import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { AGENT_ROLES } from "@paperclipai/shared";
import { catalogManifest, resolveCatalogSkillRef } from "@paperclipai/skills-catalog";
import {
  agents,
  approvals,
  companySkills,
  productizationPackageInstallationItems as itemsTable,
  productizationPackageInstallations as installationsTable,
  productizationPortablePackages as packagesTable,
  type Db,
} from "@paperclipai/db";
import {
  createPackageInstallationSchema,
  detectUnsupportedPackageSections,
  isPackageResourceKind,
  isPackageResourceReview,
  portablePackageSchema,
  type PackageInstallationItemReview,
  type PackageInstallationPlan,
  type PackageInstallSkillRequirement,
  type PortablePackage,
} from "@paperclipai/shared/productization/portable-package";
import { buildInstallItemHireRequest, installItemHireIdempotencyKey } from "@paperclipai/shared/productization/profile-hire";
import { conflict, notFound, unprocessable } from "../../errors.js";
import {
  findOccupiedIdentities,
  inspectResourceItem,
  installResourceItem,
  planPackageResources,
  resourceLocalKey,
} from "./package-resources.js";
import { mapRole } from "./portable-package-preview.js";

type PackageRow = typeof packagesTable.$inferSelect;
type InstallationRow = typeof installationsTable.$inferSelect;
type ItemRow = typeof itemsTable.$inferSelect;

/**
 * Reconciliation reads the `agents.metadata` keys `productizationInstallItemId` and
 * `productizationHireAttemptId`, written by `buildInstallItemHireRequest`. That is the only
 * durable server fact used to resolve an uncertain claim. There is deliberately no release:
 * a claimed (`submitting`/`unknown`) item stays blocked until reconciliation finds the agent.
 */
const PACKAGE_LIST_LIMIT = 100;
const INSTALLATION_LIST_LIMIT = 100;
const RECONCILE_CANDIDATE_LIMIT = 10;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function portablePackageContentHash(pkg: PortablePackage): string {
  return createHash("sha256").update(stableJson(pkg)).digest("hex");
}

function parsePackage(input: unknown): PortablePackage {
  const parsed = portablePackageSchema.safeParse(input);
  if (!parsed.success) {
    throw unprocessable("Invalid portable package", {
      code: "portable_package_invalid",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return parsed.data;
}

export function summarizePackage(row: PackageRow) {
  const { content, ...rest } = row;
  return {
    ...rest,
    counts: {
      teams: content.teams.length,
      profiles: content.teams.reduce((sum, team) => sum + team.members.length, 0),
      skills: content.skills.length,
      playbooks: content.playbooks.length,
      requestTemplates: content.requestTemplates.length,
      brandPresets: content.brandPresets.length,
      forms: content.forms.length,
      meetingTypes: content.meetingTypes.length,
      connectionRequests: content.connectionRequests.length,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/* ------------------------------------------------------------------------- */
/* Company-private versioned package catalog with an explicit review workflow */
/* ------------------------------------------------------------------------- */

export function portablePackageCatalogService(db: Db) {
  async function load(companyId: string, id: string): Promise<PackageRow> {
    const [row] = await db.select().from(packagesTable)
      .where(and(eq(packagesTable.id, id), eq(packagesTable.companyId, companyId)));
    if (!row) throw notFound("Portable package not found");
    return row;
  }

  /** Conditional status transition; losing a race yields 409 instead of a lost update. */
  async function transition(
    companyId: string,
    id: string,
    from: PackageRow["status"][],
    values: Partial<typeof packagesTable.$inferInsert>,
  ): Promise<PackageRow> {
    const [row] = await db.update(packagesTable)
      .set({ ...values, updatedAt: new Date() })
      .where(and(
        eq(packagesTable.id, id),
        eq(packagesTable.companyId, companyId),
        inArray(packagesTable.status, from),
      ))
      .returning();
    if (row) return row;
    const current = await load(companyId, id);
    throw conflict(`Portable package is ${current.status}; this action requires ${from.join(" or ")}.`, {
      code: "portable_package_invalid_state",
      status: current.status,
    });
  }

  return {
    async list(companyId: string) {
      const rows = await db.select().from(packagesTable)
        .where(eq(packagesTable.companyId, companyId))
        .orderBy(asc(packagesTable.packageKey), desc(packagesTable.createdAt))
        .limit(PACKAGE_LIST_LIMIT);
      return rows.map(summarizePackage);
    },

    async get(companyId: string, id: string) {
      const row = await load(companyId, id);
      return { ...summarizePackage(row), content: row.content };
    },

    async createDraft(companyId: string, input: unknown, userId: string | null) {
      const pkg = parsePackage(input);
      try {
        const [row] = await db.insert(packagesTable).values({
          companyId,
          packageKey: pkg.packageKey,
          packageVersion: pkg.packageVersion,
          status: "draft",
          name: pkg.name,
          description: pkg.description,
          content: pkg,
          contentHash: portablePackageContentHash(pkg),
          createdByUserId: userId,
        }).returning();
        return { ...summarizePackage(row!), content: row!.content };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("This package key and version already exist in the company catalog. Published versions are immutable; use a new version.", {
            code: "portable_package_version_exists",
          });
        }
        throw error;
      }
    },

    /** Only drafts are editable; key and version are the identity and cannot change. */
    async updateDraft(companyId: string, id: string, input: unknown) {
      const pkg = parsePackage(input);
      const current = await load(companyId, id);
      if (current.packageKey !== pkg.packageKey || current.packageVersion !== pkg.packageVersion) {
        throw unprocessable("Package key and version cannot change; create a new version instead.", {
          code: "portable_package_identity_locked",
        });
      }
      const row = await transition(companyId, id, ["draft"], {
        name: pkg.name,
        description: pkg.description,
        content: pkg,
        contentHash: portablePackageContentHash(pkg),
        privacyAttestedAt: null,
        reviewRequestedAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
      });
      return { ...summarizePackage(row), content: row.content };
    },

    async deleteDraft(companyId: string, id: string) {
      const deleted = await db.delete(packagesTable)
        .where(and(eq(packagesTable.id, id), eq(packagesTable.companyId, companyId), eq(packagesTable.status, "draft")))
        .returning({ id: packagesTable.id });
      if (deleted.length === 0) {
        const current = await load(companyId, id);
        throw conflict(`Only drafts can be deleted; this package is ${current.status}.`, { code: "portable_package_invalid_state" });
      }
    },

    async requestReview(companyId: string, id: string) {
      return summarizePackage(await transition(companyId, id, ["draft"], { status: "in_review", reviewRequestedAt: new Date() }));
    },

    async returnToDraft(companyId: string, id: string) {
      return summarizePackage(await transition(companyId, id, ["in_review"], {
        status: "draft", reviewRequestedAt: null, reviewedByUserId: null, reviewedAt: null, privacyAttestedAt: null,
      }));
    },

    /**
     * Publishing freezes the content. It records who reviewed it and the privacy
     * attestation; it never installs anything or grants authority.
     */
    async publish(companyId: string, id: string, userId: string | null) {
      const current = await load(companyId, id);
      // Fail closed if the stored content no longer matches its hash.
      if (portablePackageContentHash(parsePackage(current.content)) !== current.contentHash) {
        throw conflict("Stored package content does not match its hash; refusing to publish.", { code: "portable_package_hash_mismatch" });
      }
      const now = new Date();
      return summarizePackage(await transition(companyId, id, ["in_review"], {
        status: "published",
        privacyAttestedAt: now,
        reviewedByUserId: userId,
        reviewedAt: now,
        publishedByUserId: userId,
        publishedAt: now,
      }));
    },

    async withdraw(companyId: string, id: string) {
      return summarizePackage(await transition(companyId, id, ["published"], { status: "withdrawn", withdrawnAt: new Date() }));
    },

    /** Shareable JSON of a published package: content only, no ids, no authority, no installation state. */
    async exportPublished(companyId: string, id: string) {
      const row = await load(companyId, id);
      if (row.status !== "published") {
        throw conflict("Only published packages can be exported.", { code: "portable_package_invalid_state", status: row.status });
      }
      return { contentHash: row.contentHash, package: row.content };
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Installation receipts                                                      */
/* ------------------------------------------------------------------------- */

interface InventorySkill {
  key: string;
  packageVersion: string | null;
  currentVersionId: string | null;
}

function persistentMembers(pkg: PortablePackage) {
  return pkg.teams.flatMap((team) => team.members
    .filter((member) => member.deploymentMode === "persistent")
    .map((member) => ({ team, member, localKey: `${team.id}/${member.id}` })));
}

function memberSkillRequirements(pkg: PortablePackage, member: PortablePackage["teams"][number]["members"][number]) {
  const byKey = new Map<string, { key: string; version: string }>();
  for (const ref of member.skillRefs) {
    const resolved = ref.kind === "catalog"
      ? { key: ref.key, version: ref.version }
      : (() => {
          const skill = pkg.skills.find((entry) => entry.id === ref.id);
          return skill ? { key: skill.catalogKey, version: skill.catalogVersion } : null;
        })();
    if (!resolved) throw unprocessable("A skill reference does not resolve inside the package.", { code: "portable_package_invalid" });
    const existing = byKey.get(resolved.key);
    if (existing && existing.version !== resolved.version) {
      throw unprocessable(`Skill ${resolved.key} is declared with conflicting versions.`, { code: "package_skill_version_conflict" });
    }
    byKey.set(resolved.key, resolved);
  }
  return [...byKey.values()];
}

function requirementStatus(
  requirement: { key: string; version: string },
  inventory: InventorySkill[],
): PackageInstallSkillRequirement {
  const match = resolveCatalogSkillRef(requirement.key);
  const resolvable = requirement.version === catalogManifest.packageVersion
    && match?.key === requirement.key
    && match.compatibility === "compatible"
    && match.trustLevel === "markdown_only";
  if (!resolvable) return { ...requirement, status: "unavailable", versionId: null };
  const installed = inventory.find((skill) =>
    skill.key === requirement.key && skill.packageVersion === requirement.version && skill.currentVersionId !== null);
  return installed
    ? { ...requirement, status: "installed", versionId: installed.currentVersionId }
    : { ...requirement, status: "missing", versionId: null };
}

export function packageInstallationService(db: Db) {
  async function skillInventory(companyId: string): Promise<InventorySkill[]> {
    const rows = await db.select({
      key: companySkills.key,
      sourceType: companySkills.sourceType,
      metadata: companySkills.metadata,
      currentVersionId: companySkills.currentVersionId,
    }).from(companySkills).where(and(eq(companySkills.companyId, companyId), eq(companySkills.sourceType, "catalog")));
    return rows
      .map((row) => {
        const version = (row.metadata as Record<string, unknown> | null)?.packageVersion;
        return { key: row.key, packageVersion: typeof version === "string" ? version : null, currentVersionId: row.currentVersionId };
      });
  }

  async function loadPublished(companyId: string, packageId: string): Promise<{ row: PackageRow; pkg: PortablePackage }> {
    const [row] = await db.select().from(packagesTable)
      .where(and(eq(packagesTable.id, packageId), eq(packagesTable.companyId, companyId)));
    if (!row) throw notFound("Portable package not found");
    if (row.status !== "published") {
      throw conflict("Only published packages can be installed.", { code: "portable_package_not_published", status: row.status });
    }
    const pkg = parsePackage(row.content);
    if (portablePackageContentHash(pkg) !== row.contentHash) {
      throw conflict("Stored package content does not match its published hash; refusing to install.", { code: "portable_package_hash_mismatch" });
    }
    return { row, pkg };
  }

  async function loadInstallation(companyId: string, installationId: string) {
    const [installation] = await db.select().from(installationsTable)
      .where(and(eq(installationsTable.id, installationId), eq(installationsTable.companyId, companyId)));
    if (!installation) throw notFound("Package installation not found");
    return installation;
  }

  async function loadItem(companyId: string, installationId: string, itemId: string): Promise<ItemRow> {
    const [item] = await db.select().from(itemsTable).where(and(
      eq(itemsTable.id, itemId),
      eq(itemsTable.installationId, installationId),
      eq(itemsTable.companyId, companyId),
    ));
    if (!item) throw notFound("Installation item not found");
    return item;
  }

  async function refreshInstallationStatus(installationId: string) {
    const items = await db.select({ status: itemsTable.status }).from(itemsTable)
      .where(eq(itemsTable.installationId, installationId));
    // Items cancelled before any claim take no part in the outcome of the others.
    const statuses = items.map((item) => item.status).filter((value) => value !== "cancelled");
    let status: InstallationRow["status"] = "in_progress";
    if (items.length > 0 && statuses.length === 0) status = "cancelled";
    else if (statuses.every((value) => value === "planned")) status = "planned";
    else if (statuses.every((value) => value === "hired" || value === "created")) status = "completed";
    else if (statuses.some((value) => value === "unknown" || value === "blocked" || value === "conflict")) status = "needs_attention";
    await db.update(installationsTable).set({
      status,
      updatedAt: new Date(),
      completedAt: status === "completed" ? new Date() : null,
    }).where(eq(installationsTable.id, installationId));
  }

  async function describe(installation: InstallationRow) {
    const items = await db.select().from(itemsTable)
      .where(eq(itemsTable.installationId, installation.id))
      .orderBy(asc(itemsTable.localKey));
    return { ...installation, items };
  }

  /** One items query for a page of installations instead of one per installation. */
  async function describeMany(companyId: string, installations: InstallationRow[]) {
    if (installations.length === 0) return [];
    const items = await db.select().from(itemsTable)
      .where(and(eq(itemsTable.companyId, companyId), inArray(itemsTable.installationId, installations.map((row) => row.id))))
      .orderBy(asc(itemsTable.localKey));
    return installations.map((installation) => ({
      ...installation,
      items: items.filter((item) => item.installationId === installation.id),
    }));
  }

  /**
   * Resource plan with the company's current state folded in: an identity that already exists in the
   * target tables makes that resource not installable (it is never installed over). Skipped once a
   * receipt exists, because the receipt already pins the outcome and its own rows would look occupied.
   */
  async function resourcePlan(companyId: string, pkg: PortablePackage, contentHash: string, checkOccupancy: boolean) {
    const planned = planPackageResources(pkg, contentHash);
    if (!checkOccupancy || planned.length === 0) return planned;
    const occupied = await findOccupiedIdentities(db, companyId, planned.map(({ entry }) => ({ kind: entry.kind, domainIdentity: entry.domainIdentity })));
    // Re-plan with the occupied identities so resources that depend on a blocked one are blocked too.
    return occupied.size === 0 ? planned : planPackageResources(pkg, contentHash, occupied);
  }

  /**
   * Resolve a skill set for an item against the current inventory. Missing or
   * unavailable skills block the item unless the reviewer explicitly accepted
   * leaving them pending; nothing is ever installed from here.
   */
  function resolveItemSkills(review: PackageInstallationItemReview, inventory: InventorySkill[]) {
    const statuses = review.skills.map((skill) => requirementStatus(skill, inventory));
    const desiredSkills = statuses
      .filter((skill) => skill.status === "installed")
      .map((skill) => ({ key: skill.key, versionId: skill.versionId! }));
    const pending = statuses.filter((skill) => skill.status !== "installed");
    return { statuses, desiredSkills, pending };
  }

  return {
    /** Read-only plan: what would be installed, what is unsupported, which skills are missing. */
    async plan(companyId: string, packageId: string) {
      const { row, pkg } = await loadPublished(companyId, packageId);
      const inventory = await skillInventory(companyId);
      const [existing] = await db.select().from(installationsTable).where(and(
        eq(installationsTable.companyId, companyId),
        eq(installationsTable.packageId, row.id),
      ));
      const profiles = persistentMembers(pkg).map(({ team, member, localKey }) => ({
        localKey,
        teamId: team.id,
        teamName: team.name,
        memberId: member.id,
        title: member.title,
        purpose: member.purpose,
        deliveryCriteria: member.deliveryCriteria,
        suggestedRole: mapRole(member.title),
        reportsToLocalKey: member.reportsTo ? `${team.id}/${member.reportsTo}` : null,
        skills: memberSkillRequirements(pkg, member).map((skill) => requirementStatus(skill, inventory)),
        suggestedCostLimit: member.suggestedCostLimit,
      }));
      const resources = await resourcePlan(companyId, pkg, row.contentHash, !existing);
      return {
        package: summarizePackage(row),
        unsupported: detectUnsupportedPackageSections(pkg),
        resources: resources.map((planned) => planned.entry),
        profiles,
        specialists: pkg.teams.flatMap((team) => team.members
          .filter((member) => member.deploymentMode === "assignment_specialist")
          .map((member) => ({ localKey: `${team.id}/${member.id}`, title: member.title }))),
        installation: existing ? await describe(existing) : null,
      };
    },

    /**
     * Create (or return) the durable receipt. Validation happens entirely before
     * any row is written; the unique (company, package) index makes concurrent
     * and repeated requests converge on one receipt.
     */
    async createInstallation(companyId: string, packageId: string, input: unknown, userId: string | null) {
      const parsed = createPackageInstallationSchema.safeParse(input);
      if (!parsed.success) {
        throw unprocessable("Invalid installation request", {
          code: "package_installation_invalid",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        });
      }
      const body = parsed.data;
      const { row, pkg } = await loadPublished(companyId, packageId);

      const [existing] = await db.select().from(installationsTable).where(and(
        eq(installationsTable.companyId, companyId),
        eq(installationsTable.packageId, row.id),
      ));
      if (existing) return { reused: true, installation: await describe(existing) };

      const unsupported = detectUnsupportedPackageSections(pkg);
      const detected = new Set(unsupported.map((entry) => entry.section));
      const acknowledged = new Set(body.acknowledgeUnsupported);
      const unacknowledged = [...detected].filter((section) => !acknowledged.has(section));
      const stale = [...acknowledged].filter((section) => !detected.has(section));
      if (unacknowledged.length > 0 || stale.length > 0) {
        throw unprocessable("Unsupported package sections must be acknowledged exactly as reported.", {
          code: "package_unsupported_sections",
          unacknowledged,
          unexpected: stale,
        });
      }

      const members = persistentMembers(pkg);
      const byKey = new Map(members.map((entry) => [entry.localKey, entry]));
      const submitted = new Map<string, PackageInstallationItemReview>();
      for (const item of body.items) {
        const key = `${item.teamId}/${item.memberId}`;
        if (submitted.has(key)) throw unprocessable(`Duplicate reviewed item ${key}.`, { code: "package_installation_invalid" });
        if (!byKey.has(key)) throw unprocessable(`Reviewed item ${key} is not a persistent profile of this package.`, { code: "package_installation_invalid" });
        submitted.set(key, item);
      }
      const missingItems = [...byKey.keys()].filter((key) => !submitted.has(key));
      if (missingItems.length > 0) {
        throw unprocessable("Every persistent profile must be reviewed; none is skipped silently.", { code: "package_installation_incomplete", missing: missingItems });
      }

      const inventory = await skillInventory(companyId);
      const existingManagerIds = [...new Set(body.items.map((item) => item.reportsToExistingAgentId).filter((id): id is string => id !== null))];
      const managerRows = existingManagerIds.length === 0 ? [] : await db.select({ id: agents.id, status: agents.status })
        .from(agents).where(and(eq(agents.companyId, companyId), inArray(agents.id, existingManagerIds)));
      const validManagers = new Set(managerRows.filter((agent) => agent.status !== "terminated").map((agent) => agent.id));

      for (const [key, item] of submitted) {
        const { team, member } = byKey.get(key)!;
        if (item.reportsToLocalKey !== null && item.reportsToExistingAgentId !== null) {
          throw unprocessable(`${key}: choose either a package manager or an existing agent, not both.`, { code: "package_installation_invalid" });
        }
        const packageManagerKey = member.reportsTo ? `${team.id}/${member.reportsTo}` : null;
        if (item.reportsToLocalKey !== null && item.reportsToLocalKey !== packageManagerKey) {
          throw unprocessable(`${key}: the in-package manager must match the package hierarchy.`, { code: "package_installation_invalid" });
        }
        if (item.reportsToLocalKey !== null && !byKey.has(item.reportsToLocalKey)) {
          throw unprocessable(`${key}: its manager is not a persistent profile; pick an existing agent instead.`, { code: "package_manager_not_installable" });
        }
        // A package manager that is a specialist cannot be created; leaving both manager
        // fields null is then an explicit "no manager" decision by the reviewer.
        if (item.reportsToExistingAgentId !== null && !validManagers.has(item.reportsToExistingAgentId)) {
          throw unprocessable(`${key}: the selected manager does not exist in this company.`, { code: "package_manager_not_found" });
        }
        // Reject now what the core hire route would reject later: a refused POST leaves the claim blocked.
        if (!(AGENT_ROLES as readonly string[]).includes(item.role)) {
          throw unprocessable(`${key}: unknown agent role.`, { code: "package_installation_invalid" });
        }
        const required = memberSkillRequirements(pkg, member);
        const requiredSet = new Set(required.map((skill) => `${skill.key}@${skill.version}`));
        const reviewedSet = new Set(item.skills.map((skill) => `${skill.key}@${skill.version}`));
        if (requiredSet.size !== reviewedSet.size || [...requiredSet].some((value) => !reviewedSet.has(value))) {
          throw unprocessable(`${key}: reviewed skills must match the package declaration exactly.`, { code: "package_skill_mismatch" });
        }
        const { pending } = resolveItemSkills(item, inventory);
        if (pending.length > 0 && !item.acceptPendingSkills) {
          throw unprocessable(`${key}: required skills are not installed at the exact version.`, {
            code: "package_skill_missing",
            skills: pending.map((skill) => ({ key: skill.key, version: skill.version, status: skill.status })),
          });
        }
      }
      // Cycle safety: package hierarchy is acyclic by schema; reviewed links are a subset of it.

      // Resources: explicit human selection, validated against the plan computed now (never trusting the client's shape).
      const resourcePlanned = await resourcePlan(companyId, pkg, row.contentHash, true);
      const plannedByKey = new Map(resourcePlanned.map((planned) => [resourceLocalKey(planned.entry.kind, planned.entry.localId), planned]));
      const selectedKeys = new Set<string>();
      for (const selection of body.resources) {
        const key = resourceLocalKey(selection.kind, selection.localId);
        if (selectedKeys.has(key)) throw unprocessable(`Duplicate selected resource ${key}.`, { code: "package_installation_invalid" });
        const planned = plannedByKey.get(key);
        if (!planned) throw unprocessable(`Selected resource ${key} is not part of this package.`, { code: "package_installation_invalid" });
        if (!planned.review) {
          throw unprocessable(`Resource ${key} cannot be installed as it is.`, { code: "package_resource_not_installable", blockers: planned.entry.blockers });
        }
        selectedKeys.add(key);
      }
      for (const key of selectedKeys) {
        const missingDeps = plannedByKey.get(key)!.entry.dependsOn
          .map((dep) => resourceLocalKey(dep.kind, dep.localId))
          .filter((dep) => !selectedKeys.has(dep));
        if (missingDeps.length > 0) {
          throw unprocessable(`Resource ${key} refers to resources that are not selected; select them too.`, {
            code: "package_resource_dependency_missing",
            resource: key,
            missing: missingDeps,
          });
        }
      }
      const resourceOutcomes: NonNullable<PackageInstallationPlan["resources"]> = resourcePlanned.map(({ entry }) => {
        const key = resourceLocalKey(entry.kind, entry.localId);
        return {
          kind: entry.kind,
          localId: entry.localId,
          title: entry.title.slice(0, 240),
          outcome: selectedKeys.has(key) ? "selected" as const : entry.installable ? "not_selected" as const : "not_installable" as const,
          blockers: entry.blockers,
        };
      });

      const skillRequirements: PackageInstallSkillRequirement[] = [];
      const seen = new Set<string>();
      for (const item of submitted.values()) {
        for (const status of resolveItemSkills(item, inventory).statuses) {
          if (!seen.has(`${status.key}@${status.version}`)) {
            seen.add(`${status.key}@${status.version}`);
            skillRequirements.push(status);
          }
        }
      }
      const plan: PackageInstallationPlan = {
        unsupported,
        acknowledgedUnsupported: body.acknowledgeUnsupported,
        skills: skillRequirements,
        specialists: pkg.teams.flatMap((team) => team.members
          .filter((member) => member.deploymentMode === "assignment_specialist")
          .map((member) => ({ localKey: `${team.id}/${member.id}`, title: member.title }))),
        resources: resourceOutcomes,
      };

      const agentRows = [...submitted.entries()].map(([key, review]) => ({
        companyId,
        localKey: key,
        kind: "persistent_agent" as const,
        status: "planned" as const,
        review,
      }));
      const resourceRows = [...selectedKeys].map((key) => {
        const review = plannedByKey.get(key)!.review!;
        return {
          companyId,
          localKey: key,
          kind: review.resourceKind,
          status: "planned" as const,
          review,
          domainIdentity: review.domainIdentity,
          sourceContentHash: review.sourceContentHash,
        };
      });

      let result: InstallationRow | null;
      try {
        result = await db.transaction(async (tx) => {
          const [created] = await tx.insert(installationsTable).values({
            companyId,
            packageId: row.id,
            packageKey: row.packageKey,
            packageVersion: row.packageVersion,
            contentHash: row.contentHash,
            status: "planned",
            plan,
            createdByUserId: userId,
          }).onConflictDoNothing().returning();
          if (!created) return null;
          await tx.insert(itemsTable).values([...agentRows, ...resourceRows].map((item) => ({ ...item, installationId: created.id })));
          return created;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Another receipt of this company already holds one of the resource identities; nothing was written.
          throw conflict("A resource identity of this package is already reserved by another installation of this company.", { code: "package_resource_identity_occupied" });
        }
        throw error;
      }
      if (!result) {
        const [winner] = await db.select().from(installationsTable).where(and(
          eq(installationsTable.companyId, companyId),
          eq(installationsTable.packageId, row.id),
        ));
        if (!winner) throw conflict("Installation could not be recorded; try again.", { code: "package_installation_race" });
        return { reused: true, installation: await describe(winner) };
      }
      return { reused: false, installation: await describe(result) };
    },

    async listInstallations(companyId: string) {
      const rows = await db.select().from(installationsTable)
        .where(eq(installationsTable.companyId, companyId))
        .orderBy(desc(installationsTable.createdAt))
        .limit(INSTALLATION_LIST_LIMIT);
      return describeMany(companyId, rows);
    },

    async getInstallation(companyId: string, installationId: string) {
      return describe(await loadInstallation(companyId, installationId));
    },

    /** Only an untouched receipt (every item planned or cancelled before any claim) can be discarded; it is then removed so a new plan may be made. */
    async discardInstallation(companyId: string, installationId: string) {
      await loadInstallation(companyId, installationId);
      const removed = await db.delete(installationsTable).where(and(
        eq(installationsTable.id, installationId),
        eq(installationsTable.companyId, companyId),
        sql`not exists (select 1 from ${itemsTable} where ${itemsTable.installationId} = ${installationsTable.id} and ${itemsTable.status} not in ('planned', 'cancelled'))`,
      )).returning({ id: installationsTable.id });
      if (removed.length === 0) {
        throw conflict("A hire has already been started for this installation; it can no longer be discarded.", { code: "package_installation_started" });
      }
    },

    /**
     * Atomically claim one planned item and return the exact body to POST to the
     * existing `/agent-hires` endpoint. The claim is the durable once-only gate:
     * a second claim, a double click or a parallel tab loses with 409 and the
     * request body is never handed out again. The response carries the stable
     * item-specific `idempotencyKey` for the `Idempotency-Key` header. That key helps the
     * core recognise a duplicate; it is not an exactly-once guarantee (see the S80 doc).
     */
    async claimItem(companyId: string, installationId: string, itemId: string, userId: string | null) {
      const installation = await loadInstallation(companyId, installationId);
      const item = await loadItem(companyId, installationId, itemId);
      if (isPackageResourceKind(item.kind) || isPackageResourceReview(item.review)) {
        throw conflict("Resources are installed by the server; use the install action, not a hire claim.", { code: "package_item_not_agent", kind: item.kind });
      }
      if (item.status !== "planned") {
        throw conflict(
          item.status === "submitting" || item.status === "unknown"
            ? "The outcome of an earlier hire request is unresolved and this item stays blocked. Check its status; the request is never re-sent."
            : `Item is ${item.status}; nothing to submit.`,
          { code: "package_item_not_claimable", status: item.status },
        );
      }
      const [packageRow] = await db.select().from(packagesTable).where(and(
        eq(packagesTable.id, installation.packageId),
        eq(packagesTable.companyId, companyId),
      ));
      if (!packageRow || packageRow.contentHash !== installation.contentHash) {
        throw conflict("The package no longer matches this installation.", { code: "portable_package_hash_mismatch" });
      }

      const review = item.review as PackageInstallationItemReview; // resource items were rejected above
      let managerAgentId: string | null = null;
      if (review.reportsToLocalKey) {
        const [manager] = await db.select().from(itemsTable).where(and(
          eq(itemsTable.installationId, installationId),
          eq(itemsTable.companyId, companyId),
          eq(itemsTable.localKey, review.reportsToLocalKey),
        ));
        if (!manager || !manager.agentId || (manager.status !== "pending_approval" && manager.status !== "hired")) {
          throw conflict("The manager profile must be hired first.", { code: "package_manager_not_ready", managerKey: review.reportsToLocalKey });
        }
        managerAgentId = manager.agentId;
      }
      if (review.reportsToExistingAgentId) {
        const [manager] = await db.select({ status: agents.status }).from(agents).where(and(
          eq(agents.id, review.reportsToExistingAgentId),
          eq(agents.companyId, companyId),
        ));
        if (!manager || manager.status === "terminated") {
          throw conflict("The selected existing manager is no longer available.", { code: "package_manager_not_found" });
        }
      }

      const { desiredSkills, pending } = resolveItemSkills(review, await skillInventory(companyId));
      if (pending.length > 0 && !review.acceptPendingSkills) {
        throw conflict("Required skills are no longer installed at the exact version.", {
          code: "package_skill_missing",
          skills: pending.map((skill) => ({ key: skill.key, version: skill.version, status: skill.status })),
        });
      }

      const built = buildInstallItemHireRequest(review, {
        installationId,
        itemId: item.id,
        hireAttemptId: item.hireAttemptId,
        packageKey: installation.packageKey,
        packageVersion: installation.packageVersion,
        managerAgentId,
        desiredSkills,
      });
      if (!built.ok) {
        throw unprocessable("The reviewed configuration does not produce a valid hire request.", { code: built.code });
      }

      const now = new Date();
      const [claimed] = await db.update(itemsTable).set({
        status: "submitting",
        claimedByUserId: userId,
        claimedAt: now,
        note: pending.length > 0 ? `Skills pendientes aceptadas: ${pending.map((skill) => `${skill.key}@${skill.version}`).join(", ")}` : null,
        updatedAt: now,
      }).where(and(eq(itemsTable.id, item.id), eq(itemsTable.companyId, companyId), eq(itemsTable.status, "planned"))).returning();
      if (!claimed) {
        throw conflict("Another request claimed this item first.", { code: "package_item_not_claimable" });
      }
      await refreshInstallationStatus(installationId);
      return {
        item: claimed,
        hireRequest: built.request,
        endpoint: `/companies/${companyId}/agent-hires`,
        idempotencyKey: installItemHireIdempotencyKey(claimed.id, claimed.hireAttemptId),
      };
    },

    /**
     * Install one resource item as a draft through its domain service (or, for brand presets and request
     * templates, its own table). The item is claimed with a conditional UPDATE first; the domain write is
     * keyed by a unique identity, so repeating this call after a crash, a timeout or from another tab can
     * only link the same row. Never publishes, sends, connects or grants autonomy.
     */
    async installResource(companyId: string, installationId: string, itemId: string, userId: string | null) {
      const installation = await loadInstallation(companyId, installationId);
      const [packageRow] = await db.select().from(packagesTable).where(and(
        eq(packagesTable.id, installation.packageId),
        eq(packagesTable.companyId, companyId),
      ));
      if (!packageRow || packageRow.contentHash !== installation.contentHash) {
        throw conflict("The package no longer matches this installation.", { code: "portable_package_hash_mismatch" });
      }
      const result = await installResourceItem(db, { companyId, installationId, itemId, userId });
      await refreshInstallationStatus(installationId);
      return result;
    },

    /**
     * Link the item to what actually exists in the company. Looks the agent up by
     * the correlation ids carried in its metadata and reads its approval; it never
     * creates anything and never marks an agent active on its own.
     */
    async reconcileItem(companyId: string, installationId: string, itemId: string) {
      await loadInstallation(companyId, installationId);
      const item = await loadItem(companyId, installationId, itemId);
      if (isPackageResourceKind(item.kind)) {
        // Resource recovery is a read-only identity lookup against the pinned snapshot; it creates nothing.
        const inspected = await inspectResourceItem(db, { companyId, installationId, itemId });
        await refreshInstallationStatus(installationId);
        return inspected;
      }
      if (item.status === "planned" || item.status === "blocked" || item.status === "cancelled") {
        throw conflict("There is nothing to reconcile for this item.", { code: "package_item_not_reconcilable", status: item.status });
      }
      const candidates = await db.select().from(agents).where(and(
        eq(agents.companyId, companyId),
        sql`${agents.metadata}->>'productizationInstallItemId' = ${item.id}`,
        sql`${agents.metadata}->>'productizationHireAttemptId' = ${item.hireAttemptId}`,
      )).limit(RECONCILE_CANDIDATE_LIMIT);
      const now = new Date();
      if (candidates.length === 0) {
        if (item.status === "submitting") {
          await db.update(itemsTable).set({
            status: "unknown",
            note: "Bloqueado: no aparece ningún agente con esta referencia, pero eso no demuestra que la solicitud no llegue a completarse. No se reenvía; solo se resuelve cuando el agente aparezca.",
            updatedAt: now,
          }).where(and(eq(itemsTable.id, item.id), eq(itemsTable.status, "submitting")));
          await refreshInstallationStatus(installationId);
        }
        return { found: false, item: await loadItem(companyId, installationId, itemId) };
      }
      if (candidates.length > 1) {
        await db.update(itemsTable).set({
          status: "unknown",
          note: "Bloqueado: hay varios agentes con esta referencia; revisa agentes y aprobaciones antes de continuar.",
          updatedAt: now,
        }).where(and(eq(itemsTable.id, item.id), inArray(itemsTable.status, ["submitting", "unknown"])));
        await refreshInstallationStatus(installationId);
        return { found: false, duplicates: candidates.map((agent) => agent.id), item: await loadItem(companyId, installationId, itemId) };
      }
      const agent = candidates[0]!;
      const [approval] = await db.select({ id: approvals.id, status: approvals.status }).from(approvals).where(and(
        eq(approvals.companyId, companyId),
        eq(approvals.type, "hire_agent"),
        sql`${approvals.payload}->>'agentId' = ${agent.id}`,
      )).orderBy(desc(approvals.createdAt)).limit(1);

      let status: ItemRow["status"];
      let note: string | null = null;
      if (agent.status === "terminated") {
        status = "unknown";
        note = "El agente vinculado fue terminado; revisa la empresa antes de volver a contratar.";
      } else if (agent.status === "pending_approval" || approval?.status === "pending") {
        status = "pending_approval";
      } else if (approval && approval.status !== "approved") {
        status = "unknown";
        note = `La aprobación está ${approval.status}; no se considera contratado.`;
      } else {
        status = "hired";
      }
      const [updated] = await db.update(itemsTable).set({
        status,
        agentId: agent.id,
        approvalId: approval?.id ?? null,
        resolvedAt: status === "hired" ? now : null,
        note,
        updatedAt: now,
      }).where(and(eq(itemsTable.id, item.id), inArray(itemsTable.status, ["submitting", "unknown", "pending_approval"]))).returning();
      await refreshInstallationStatus(installationId);
      return { found: true, item: updated ?? await loadItem(companyId, installationId, itemId) };
    },

    /**
     * Give up on an item that was never claimed. This is safe because no request body
     * was ever handed out, so no hire request can exist. A claimed item (`submitting`,
     * `unknown`) is never cancelled or released: there is no durable server fact that
     * proves an earlier POST cannot still complete, and neither a timeout nor a human
     * statement is such a fact. Those items resolve only through `reconcileItem`.
     */
    async cancelItem(companyId: string, installationId: string, itemId: string) {
      await loadInstallation(companyId, installationId);
      const item = await loadItem(companyId, installationId, itemId);
      const isResource = isPackageResourceKind(item.kind);
      if (isResource) {
        // Do not leave another selected resource pointing at one that will never exist.
        const siblings = await db.select().from(itemsTable).where(and(
          eq(itemsTable.installationId, installationId),
          eq(itemsTable.companyId, companyId),
        ));
        const dependents = siblings
          .filter((sibling) => sibling.id !== item.id && sibling.status !== "cancelled" && isPackageResourceReview(sibling.review)
            && sibling.review.references.some((ref) => resourceLocalKey(ref.kind, ref.localId) === item.localKey))
          .map((sibling) => sibling.localKey);
        if (dependents.length > 0) {
          throw conflict("Other selected resources refer to this one; cancel them first.", { code: "package_item_has_dependents", dependents });
        }
      }
      const now = new Date();
      const [cancelled] = await db.update(itemsTable).set({
        status: "cancelled",
        note: isResource
          ? "Cancelado antes de instalar: no se creó ningún recurso."
          : "Cancelado antes de reclamar: no se generó ninguna solicitud de contratación.",
        updatedAt: now,
      }).where(and(
        eq(itemsTable.id, item.id),
        eq(itemsTable.installationId, installationId),
        eq(itemsTable.companyId, companyId),
        eq(itemsTable.status, "planned"),
      )).returning();
      if (!cancelled) {
        throw conflict("Only an item that was never claimed can be cancelled; a claimed item stays blocked until reconciliation finds its agent.", {
          code: "package_item_not_cancellable",
          status: (await loadItem(companyId, installationId, itemId)).status,
        });
      }
      await refreshInstallationStatus(installationId);
      return cancelled;
    },
  };
}
