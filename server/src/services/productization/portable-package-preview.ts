import { catalogManifest, resolveCatalogSkillRef } from "@paperclipai/skills-catalog";
import {
  portablePackageSchema,
  type PortablePackage,
} from "@paperclipai/shared/productization/portable-package";
import type {
  CompanyPortabilityPreviewResult,
} from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";
import { unprocessable } from "../../errors.js";
import { companyPortabilityService } from "../company-portability.js";

export interface PortablePackageCatalogPreview {
  package: Pick<PortablePackage, "packageKey" | "packageVersion" | "name" | "description">;
  compatible: boolean;
  incompatibilities: string[];
  requirements: Array<{ key: string; version: string; status: "resolved" | "unavailable" }>;
  mapping: Array<{ teamId: string; memberId: string; slug: string; role: string; title: string; deploymentMode: "persistent" }>;
  omittedProfileCount: number;
  portabilityPreview: CompanyPortabilityPreviewResult | null;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function mapRole(title: string): "ceo" | "cto" | "cmo" | "cfo" | "security" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "general" {
  const normalized = title.trim().toLowerCase();
  if (/\b(ceo|chief executive)\b/.test(normalized)) return "ceo";
  if (/\b(cto|chief technology)\b/.test(normalized)) return "cto";
  if (/\b(cmo|chief marketing)\b/.test(normalized)) return "cmo";
  if (/\b(cfo|chief financial)\b/.test(normalized)) return "cfo";
  if (/security/.test(normalized)) return "security";
  if (/engineer|developer/.test(normalized)) return "engineer";
  if (/design/.test(normalized)) return "designer";
  if (/product manager|\bpm\b/.test(normalized)) return "pm";
  if (/quality|\bqa\b/.test(normalized)) return "qa";
  if (/devops|infrastructure/.test(normalized)) return "devops";
  if (/research/.test(normalized)) return "researcher";
  return "general";
}

function buildPortabilitySource(pkg: PortablePackage, persistent: Array<{ team: PortablePackage["teams"][number]; member: PortablePackage["teams"][number]["members"][number] }>) {
  const usedSlugs = new Set<string>();
  const slugByProfile = new Map<string, string>();
  const memberBySlug = new Map<string, PortablePackage["teams"][number]["members"][number]>();
  const agents = Object.fromEntries(persistent.map(({ team, member }) => {
    const base = `${team.id}-${member.id}`.slice(0, 58);
    let slug = base;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base.slice(0, 58 - String(suffix).length)}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);
    slugByProfile.set(`${team.id}/${member.id}`, slug);
    memberBySlug.set(slug, member);
    return [slug, {
      metadata: {
        productization: {
          packageKey: pkg.packageKey,
          packageVersion: pkg.packageVersion,
          teamId: team.id,
          teamName: team.name,
          teamDescription: team.description,
          memberId: member.id,
          purpose: member.purpose,
          deploymentMode: member.deploymentMode,
          deliveryCriteria: member.deliveryCriteria,
          suggestedCostLimit: member.suggestedCostLimit,
        },
      },
    }];
  }));
  const agentPaths = persistent.map(({ team, member }) => `agents/${slugByProfile.get(`${team.id}/${member.id}`)}/AGENTS.md`);
  const company = `---\nname: ${yamlString(pkg.name)}\nslug: ${yamlString(pkg.packageKey)}\nincludes: ${JSON.stringify(agentPaths)}\n---\n\n# ${pkg.name}\n`;
  const files: Record<string, string> = {
    "COMPANY.md": company,
    ".paperclip.yaml": `schemaVersion: 7\nagents:\n${Object.entries(agents).map(([slug, metadata]) => {
      const member = memberBySlug.get(slug)!;
      return `  ${yamlString(slug)}:\n    role: ${mapRole(member.title)}\n    metadata: ${JSON.stringify(metadata.metadata)}\n`;
    }).join("")}`,
  };
  persistent.forEach(({ team, member }) => {
    const slug = slugByProfile.get(`${team.id}/${member.id}`)!;
    const managerSlug = member.reportsTo ? slugByProfile.get(`${team.id}/${member.reportsTo}`) : null;
    const skills = member.skillRefs.flatMap((ref) => {
      const skill = ref.kind === "local"
        ? pkg.skills.find((entry) => entry.id === ref.id)
        : { catalogKey: ref.key };
      return skill ? [skill.catalogKey] : [];
    });
    const managerLine = managerSlug ? `reportsTo: ${yamlString(managerSlug)}\n` : "";
    files[`agents/${slug}/AGENTS.md`] = `---\nkind: agent\nslug: ${yamlString(slug)}\nname: ${yamlString(member.title)}\ntitle: ${yamlString(member.title)}\n${managerLine}skills: ${JSON.stringify(skills)}\n---\n\n`;
  });
  return { files, persistent, slugByProfile };
}

export function portablePackagePreviewService(db: Db) {
  const portability = companyPortabilityService(db);

  return {
    async preview(companyId: string, input: unknown): Promise<PortablePackageCatalogPreview> {
      const parsed = portablePackageSchema.safeParse(input);
      if (!parsed.success) {
        throw unprocessable("Invalid portable package", {
          code: "portable_package_invalid",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        });
      }
      const pkg = parsed.data;
      const incompatibilities: string[] = [];
      const allPersistent = pkg.teams.flatMap((team) => team.members
        .filter((member) => member.deploymentMode === "persistent")
        .map((member) => ({ team, member })));
      const persistent = allPersistent.slice(0, 100);
      const omittedProfileCount = allPersistent.length - persistent.length;
      if (pkg.playbooks.length) incompatibilities.push("Playbooks are not supported by this preview importer.");
      if (pkg.requestTemplates.length) incompatibilities.push("Request templates are not supported by this preview importer.");
      if (pkg.brandPresets.length) incompatibilities.push("Brand presets are not supported by this preview importer.");
      if (pkg.forms.length) incompatibilities.push("Forms are not supported by this preview importer.");
      if (pkg.meetingTypes.length) incompatibilities.push("Meeting types are not supported by this preview importer.");
      if (pkg.connectionRequests.length) incompatibilities.push("Connection requests are requirements only and are not installed or activated by this preview.");
      if (omittedProfileCount > 0) incompatibilities.push(`Preview limit is 100 persistent profiles; ${omittedProfileCount} additional profile(s) are listed in the package but not included in the preview.`);
      if (!pkg.teams.some((team) => team.members.some((member) => member.deploymentMode === "persistent"))) {
        incompatibilities.push("The package contains no persistent profile supported by the current importer.");
      }
      for (const team of pkg.teams) {
        for (const member of team.members) {
          if (member.deploymentMode === "assignment_specialist") {
            incompatibilities.push(`Profile ${team.id}/${member.id} is an assignment specialist; the current importer only previews persistent profiles.`);
          }
        }
      }

      const requirementMap = new Map<string, { key: string; version: string }>();
      const addRequirement = (key: string, version: string) => {
        const existing = requirementMap.get(key);
        if (existing && existing.version !== version) {
          incompatibilities.push(`Skill ${key} is declared with conflicting catalog versions ${existing.version} and ${version}.`);
          return;
        }
        requirementMap.set(key, { key, version });
      };
      pkg.skills.forEach((skill) => addRequirement(skill.catalogKey, skill.catalogVersion));
      pkg.teams.forEach((team) => team.members.forEach((member) => member.skillRefs.forEach((ref) => {
        const skill = ref.kind === "local"
          ? pkg.skills.find((entry) => entry.id === ref.id)
          : { catalogKey: ref.key, catalogVersion: ref.version };
        if (skill) addRequirement(skill.catalogKey, skill.catalogVersion);
      })));
      const requirements = [...requirementMap.values()].map((skill) => {
        const match = resolveCatalogSkillRef(skill.key);
        const resolved = skill.version === catalogManifest.packageVersion
          && match?.key === skill.key
          && match.compatibility === "compatible"
          && match.trustLevel === "markdown_only";
        if (!resolved) incompatibilities.push(`Skill ${skill.key}@${skill.version} does not resolve to a compatible markdown-only entry in catalog ${catalogManifest.packageVersion}.`);
        return { key: skill.key, version: skill.version, status: resolved ? "resolved" as const : "unavailable" as const };
      });
      if (requirements.length > 0) incompatibilities.push("Skill references are validated as catalog requirements only; this preview does not install or attach skill content.");

      const { files, slugByProfile } = buildPortabilitySource(pkg, persistent);
      const mapping = persistent.map(({ team, member }) => ({
        teamId: team.id,
        memberId: member.id,
        slug: slugByProfile.get(`${team.id}/${member.id}`)!,
        role: mapRole(member.title),
        title: member.title,
        deploymentMode: "persistent" as const,
      }));
      const portabilityPreview = persistent.length > 0
        ? await portability.previewImport({
          source: { type: "inline", files },
          include: { company: false, agents: true, projects: false, issues: false, skills: false },
          target: { mode: "existing_company", companyId },
          agents: "all",
          collisionStrategy: "rename",
        }, { mode: "agent_safe", sourceCompanyId: companyId })
        : null;

      return {
        package: { packageKey: pkg.packageKey, packageVersion: pkg.packageVersion, name: pkg.name, description: pkg.description },
        compatible: incompatibilities.length === 0 && !(portabilityPreview?.errors.length),
        incompatibilities,
        requirements,
        mapping,
        omittedProfileCount,
        portabilityPreview,
      };
    },
  };
}
