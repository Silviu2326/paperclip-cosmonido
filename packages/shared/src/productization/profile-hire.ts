import { z } from "zod";
import { AGENT_ROLES } from "../constants.js";
import { agentAdapterTypeSchema } from "../adapter-type.js";
import { createAgentHireSchema } from "../validators/agent.js";
import {
  portablePackageSchema,
  portablePackageTeamMemberSchema,
  type PortablePackage,
} from "./portable-package.js";

/** A single human-reviewed profile from the portable team package contract. */
export type PortableTeamMemberProfile = PortablePackage["teams"][number]["members"][number];

const installedSkillSchema = z.object({
  companyId: z.string().uuid(),
  key: z.string().min(1),
  sourceType: z.string().min(1),
  packageVersion: z.string().nullable(),
  currentVersionId: z.string().uuid().nullable(),
}).strict();

const profileHireInputSchema = z.object({
  companyId: z.string().uuid(),
  profile: portablePackageTeamMemberSchema,
  teamId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
  portablePackage: portablePackageSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(AGENT_ROLES),
  adapterType: agentAdapterTypeSchema,
  reportsTo: z.string().uuid().nullable(),
  defaultEnvironmentId: z.string().uuid().nullable(),
  installedSkills: z.array(installedSkillSchema),
  skillInventoryAvailable: z.boolean(),
  adapterSupportsSkills: z.boolean(),
}).strict();

export type ProfileHireInput = z.input<typeof profileHireInputSchema>;
export type ProfileHirePendingReason =
  | "package_reference_unresolved"
  | "skill_inventory_unavailable"
  | "skill_not_installed_for_company"
  | "adapter_does_not_support_skills";

export interface ProfileHirePendingSkill {
  reference: string;
  reason: ProfileHirePendingReason;
}

export type ProfileHireBuildResult =
  | {
      ok: true;
      /** Parsed against the existing agent-hire contract; safe to pass to agentsApi.hire. */
      request: z.output<typeof createAgentHireSchema>;
      pendingSkills: ProfileHirePendingSkill[];
      suggestedCostLimit: PortableTeamMemberProfile["suggestedCostLimit"];
    }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "invalid_package"
        | "profile_not_in_package"
        | "specialist_profile_unsupported"
        | "invalid_hire_request";
    };

function referenceLabel(reference: PortableTeamMemberProfile["skillRefs"][number]): string {
  return reference.kind === "local"
    ? `local:${reference.id}`
    : `catalog:${reference.key}@${reference.version}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/**
 * Build a bounded request for the existing hire endpoint. Package purpose,
 * delivery criteria, cost suggestions, and opaque adapter configuration are
 * deliberately excluded from the agent payload.
 */
export function buildProfileHireRequest(input: unknown): ProfileHireBuildResult {
  const parsed = profileHireInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const value = parsed.data;

  if (value.profile.deploymentMode === "assignment_specialist") {
    return { ok: false, code: "specialist_profile_unsupported" };
  }

  let portablePackage: PortablePackage | null = null;
  let profile = value.profile;
  if (value.portablePackage !== undefined && value.portablePackage !== null) {
    const packageResult = portablePackageSchema.safeParse(value.portablePackage);
    if (!packageResult.success) return { ok: false, code: "invalid_package" };
    portablePackage = packageResult.data;
    const matchingProfiles = portablePackage.teams
      .filter((team) => value.teamId === undefined || team.id === value.teamId)
      .flatMap((team) => team.members)
      .filter((member) => member.id === value.profile.id &&
        stableJson(member) === stableJson(value.profile));
    if (matchingProfiles.length !== 1) return { ok: false, code: "profile_not_in_package" };
    profile = matchingProfiles[0]!;
  }

  const pendingSkills: ProfileHirePendingSkill[] = [];
  const desiredSkills: Array<{ key: string; versionId: string | null }> = [];
  const seenSkillKeys = new Set<string>();

  for (const reference of profile.skillRefs) {
    let catalogKey: string;
    let catalogVersion: string;
    if (reference.kind === "catalog") {
      catalogKey = reference.key;
      catalogVersion = reference.version;
    } else {
      const packageSkill = portablePackage?.skills.find((skill) => skill.id === reference.id);
      if (!packageSkill) {
        pendingSkills.push({ reference: referenceLabel(reference), reason: "package_reference_unresolved" });
        continue;
      }
      catalogKey = packageSkill.catalogKey;
      catalogVersion = packageSkill.catalogVersion;
    }

    if (!value.skillInventoryAvailable) {
      pendingSkills.push({ reference: referenceLabel(reference), reason: "skill_inventory_unavailable" });
      continue;
    }
    const installed = value.installedSkills.find((skill) =>
      skill.companyId === value.companyId &&
      skill.sourceType === "catalog" &&
      skill.key === catalogKey &&
      skill.packageVersion === catalogVersion &&
      skill.currentVersionId !== null,
    );
    if (!installed) {
      pendingSkills.push({ reference: referenceLabel(reference), reason: "skill_not_installed_for_company" });
      continue;
    }
    if (!value.adapterSupportsSkills) {
      pendingSkills.push({ reference: referenceLabel(reference), reason: "adapter_does_not_support_skills" });
      continue;
    }
    if (!seenSkillKeys.has(installed.key)) {
      desiredSkills.push({ key: installed.key, versionId: installed.currentVersionId });
      seenSkillKeys.add(installed.key);
    }
  }

  const request = createAgentHireSchema.safeParse({
    name: value.name,
    title: profile.title,
    role: value.role,
    reportsTo: value.reportsTo,
    adapterType: value.adapterType,
    defaultEnvironmentId: value.defaultEnvironmentId,
    desiredSkills: desiredSkills.length > 0 ? desiredSkills : undefined,
  });
  if (!request.success) return { ok: false, code: "invalid_hire_request" };

  return {
    ok: true,
    request: request.data,
    pendingSkills,
    suggestedCostLimit: profile.suggestedCostLimit,
  };
}
