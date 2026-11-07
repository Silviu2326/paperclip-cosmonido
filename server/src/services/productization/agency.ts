import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, authUsers, companies, companyMemberships, costEvents, principalPermissionGrants, productAccounts, productAccountCompanyGrants, productAccountMembers, productizationAgencyBrands, productizationAgencyOperations, productizationPortablePackages } from "@paperclipai/db";
import { agencyBrandSchema, agencyClientProvisionSchema } from "@paperclipai/shared/productization/agency";
import { portablePackageContentHash, portablePackageCatalogService, packageInstallationService } from "./package-installation.js";
import { companyService } from "../companies.js";
import { environmentService } from "../environments.js";
import { builtInAgentService } from "../built-in-agents.js";
import { accessService } from "../access.js";
import { productizationAccountsService } from "./accounts.js";
import { conflict, forbidden, notFound, unprocessable } from "../../errors.js";

const LEASE_MS = 90_000;
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value) ?? "null";
function domainOrNull(input: string | null) {
  if (input === null || input.trim() === "") return null;
  const domain = input.trim().toLowerCase();
  if (domain.length > 253 || domain.includes(":") || domain.includes("/") || domain.includes("@") || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw unprocessable("Enter a domain name only; verification and activation are not available on this instance.", { code: "agency_domain_invalid" });
  return domain;
}

export function productizationAgencyService(db: Db) {
  const company = companyService(db), env = environmentService(db), builtIns = builtInAgentService(db), access = accessService(db);
  const accounts = productizationAccountsService(db), catalog = portablePackageCatalogService(db), installations = packageInstallationService(db);

  async function requireAccountManager(accountId: string, userId: string) {
    const [member] = await db.select({ role: productAccountMembers.role }).from(productAccountMembers).where(and(eq(productAccountMembers.accountId, accountId), eq(productAccountMembers.userId, userId))).limit(1);
    if (!member || !["owner", "admin"].includes(member.role)) throw forbidden("Commercial account owner or admin required.");
    const [account] = await db.select({ id: productAccounts.id }).from(productAccounts).where(eq(productAccounts.id, accountId)).limit(1);
    if (!account) throw notFound("Commercial account not found.");
  }
  async function loadOperation(accountId: string, operationId: string) {
    const [row] = await db.select().from(productizationAgencyOperations).where(and(eq(productizationAgencyOperations.id, operationId), eq(productizationAgencyOperations.accountId, accountId))).limit(1);
    if (!row) throw notFound("Agency setup operation not found.");
    return row;
  }
  async function resultFor(row: typeof productizationAgencyOperations.$inferSelect) {
    let installPlan = null;
    if (row.targetPackageId && row.status !== "awaiting_capacity") {
      installPlan = await installations.plan(row.companyId, row.targetPackageId);
    }
    return { id: row.id, companyId: row.companyId, companyName: row.companyName, status: row.status, packageId: row.targetPackageId, packageVersion: installPlan?.package?.packageVersion ?? null, installPlan, nextStep: row.status === "package_ready" ? "Review the installation plan in the existing package installer; no agent is hired until its normal claim and approval flow." : row.status === "awaiting_capacity" ? "This company remains archived and inaccessible until company capacity is available; resume this operation after resolving the account limit." : row.status === "ready" ? "Client company setup is ready." : "Setup is still being reconciled." };
  }
  async function acquire(row: typeof productizationAgencyOperations.$inferSelect) {
    const now = new Date(), leaseId = randomUUID();
    const [claimed] = await db.update(productizationAgencyOperations).set({ status: "creating", leaseId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now, lastErrorCode: null }).where(and(eq(productizationAgencyOperations.id, row.id), inArray(productizationAgencyOperations.status, ["pending", "creating", "awaiting_capacity", "uncertain"]), or(isNull(productizationAgencyOperations.leaseExpiresAt), lte(productizationAgencyOperations.leaseExpiresAt, now)))).returning();
    return claimed ?? null;
  }
  async function run(row: typeof productizationAgencyOperations.$inferSelect, userId: string) {
    if (["package_ready", "ready"].includes(row.status)) return resultFor(row);
    const claimed = await acquire(row);
    if (!claimed) return resultFor(await loadOperation(row.accountId, row.id));
    const lease = claimed.leaseId!;
    const finish = async (status: string, patch: Record<string, unknown> = {}) => {
      const [updated] = await db.update(productizationAgencyOperations).set({ ...patch, status, leaseId: null, leaseExpiresAt: null, updatedAt: new Date() }).where(and(eq(productizationAgencyOperations.id, claimed.id), eq(productizationAgencyOperations.leaseId, lease))).returning();
      return updated ?? await loadOperation(claimed.accountId, claimed.id);
    };
    try {
      if (!await access.canUser(claimed.sourceCompanyId, userId, "agents:create")) throw forbidden("Current source-company package access is required to resume this setup.");
      const source = await catalog.exportPublished(claimed.sourceCompanyId, claimed.sourcePackageId);
      if (source.contentHash !== claimed.sourceContentHash || portablePackageContentHash(source.package) !== claimed.sourceContentHash) throw conflict("The source package no longer matches the exact version pinned when this operation was requested.", { code: "agency_source_package_hash_mismatch" });
      let target = await company.getById(claimed.companyId);
      if (!target) {
        try {
          target = await company.create({ id: claimed.companyId, name: claimed.companyName, description: claimed.companyDescription, defaultResponsibleUserId: userId, status: "archived", budgetMonthlyCents: 0 });
        } catch (error) {
          target = await company.getById(claimed.companyId);
          if (!target) throw error;
          // The company row may have committed before a downstream factory step failed. These existing
          // idempotent domain services complete the same factory setup for this stable company id.
          await env.ensureLocalEnvironment(claimed.companyId);
          await builtIns.autoProvisionBundledAgents(claimed.companyId);
        }
      } else {
        await env.ensureLocalEnvironment(claimed.companyId);
        await builtIns.autoProvisionBundledAgents(claimed.companyId);
      }
      // Admission uses the existing account grant service. Rejected capacity leaves the factory-created
      // company archived and without user ACL, so account membership alone never opens company access.
      try {
        await accounts.grantCompany(claimed.accountId, userId, claimed.companyId);
      } catch (error) {
        const details = error instanceof Error && "details" in error ? (error as { details?: { code?: unknown } }).details : undefined;
        if (error instanceof Error && "status" in error && (error as { status?: number }).status === 422 && typeof details?.code === "string" && details.code.startsWith("plan_gate_")) {
          const blocked = await finish("awaiting_capacity", { lastErrorCode: details.code });
          return resultFor(blocked);
        }
        throw error;
      }
      await access.ensureMembership(claimed.companyId, "user", userId, "owner", "active");
      await access.ensureRoleDefaultGrants(claimed.companyId, userId, "owner", userId);
      const [existingTarget] = await db.select().from(productizationPortablePackages).where(and(eq(productizationPortablePackages.companyId, claimed.companyId), eq(productizationPortablePackages.packageKey, source.package.packageKey), eq(productizationPortablePackages.packageVersion, source.package.packageVersion))).limit(1);
      let targetPackageId: string;
      if (existingTarget) {
        if (existingTarget.contentHash !== source.contentHash) throw conflict("A different package already uses this key and version in the client company.", { code: "agency_package_version_conflict" });
        targetPackageId = existingTarget.id;
        if (existingTarget.status === "draft") { await catalog.requestReview(claimed.companyId, targetPackageId); await catalog.publish(claimed.companyId, targetPackageId, userId); }
        else if (existingTarget.status === "in_review") await catalog.publish(claimed.companyId, targetPackageId, userId);
        else if (existingTarget.status !== "published") throw conflict("The copied package version is withdrawn; create a new client setup version.", { code: "agency_package_not_installable" });
      } else {
        const draft = await catalog.createDraft(claimed.companyId, source.package, userId);
        targetPackageId = draft.id;
        await catalog.requestReview(claimed.companyId, targetPackageId);
        await catalog.publish(claimed.companyId, targetPackageId, userId);
      }
      const membership = await access.canUser(claimed.companyId, userId, "users:manage_permissions");
      if (!membership) throw forbidden("The company owner ACL does not permit client-user assignment.");
      target = await company.getById(claimed.companyId);
      if (target?.status !== "active") await company.update(claimed.companyId, { status: "active" }, { actorType: "user", actorId: userId });
      const done = await finish("package_ready", { targetPackageId, lastErrorCode: null });
      return resultFor(done);
    } catch (error) {
      const existing = await company.getById(claimed.companyId).catch(() => null);
      const status = existing ? "uncertain" : "pending";
      const errorCode = error instanceof Error && "details" in error ? "agency_setup_blocked" : "agency_setup_uncertain";
      const failed = await finish(status, { lastErrorCode: errorCode });
      if (!existing) throw error;
      return resultFor(failed);
    }
  }

  return {
    async createClient(accountId: string, userId: string, input: unknown) {
      const data = agencyClientProvisionSchema.parse(input);
      await requireAccountManager(accountId, userId);
      const [sourceGrant] = await db.select({ accountId: productAccountCompanyGrants.accountId }).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.companyId, data.sourceCompanyId)).limit(1);
      if (!sourceGrant || sourceGrant.accountId !== accountId) throw forbidden("Choose a published package from a company explicitly linked to this account.");
      const source = await catalog.exportPublished(data.sourceCompanyId, data.sourcePackageId);
      if (!data.attestPublishedPackage || portablePackageContentHash(source.package) !== source.contentHash) throw unprocessable("Confirm review of the published package before provisioning.", { code: "agency_package_attestation_required" });
      const normalized = { name: data.name, description: data.description, sourceCompanyId: data.sourceCompanyId, sourcePackageId: data.sourcePackageId, sourceHash: source.contentHash };
      const fingerprint = createHash("sha256").update(stable(normalized)).digest("hex");
      let [row] = await db.insert(productizationAgencyOperations).values({ accountId, idempotencyKey: data.idempotencyKey, fingerprint, companyId: randomUUID(), companyName: data.name, companyDescription: data.description ?? "", sourceCompanyId: data.sourceCompanyId, sourcePackageId: data.sourcePackageId, sourceContentHash: source.contentHash, requestedByUserId: userId, status: "pending" }).onConflictDoNothing().returning();
      if (!row) {
        [row] = await db.select().from(productizationAgencyOperations).where(and(eq(productizationAgencyOperations.accountId, accountId), eq(productizationAgencyOperations.idempotencyKey, data.idempotencyKey))).limit(1);
        if (!row) throw conflict("Agency setup request could not be reconciled.", { code: "agency_operation_conflict" });
        if (row.fingerprint !== fingerprint) throw conflict("Idempotency key was reused with a different client or package.", { code: "agency_idempotency_conflict" });
      }
      return run(row, userId);
    },
    async resume(accountId: string, operationId: string, userId: string) { await requireAccountManager(accountId, userId); const row = await loadOperation(accountId, operationId); if (row.requestedByUserId !== userId) throw forbidden("Only the requester may resume this client setup."); return run(row, userId); },
    async operations(accountId: string, userId: string) {
      await requireAccountManager(accountId, userId);
      const rows = await db.select().from(productizationAgencyOperations).where(and(eq(productizationAgencyOperations.accountId, accountId), eq(productizationAgencyOperations.requestedByUserId, userId), inArray(productizationAgencyOperations.status, ["pending", "creating", "awaiting_capacity", "uncertain", "package_ready"]))).orderBy(productizationAgencyOperations.updatedAt).limit(50);
      return Promise.all(rows.map((row) => resultFor(row)));
    },
    async portfolio(accountId: string, userId: string) {
      await requireAccountManager(accountId, userId);
      const snapshot = await accounts.snapshot(accountId, userId);
      const ids = snapshot.companies.map((entry) => entry.companyId);
      const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const spend = ids.length ? await db.select({ companyId: costEvents.companyId, costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::float8` }).from(costEvents).where(and(inArray(costEvents.companyId, ids), gte(costEvents.occurredAt, start), lt(costEvents.occurredAt, end))).groupBy(costEvents.companyId) : [];
      const costByCompany = new Map(spend.map((row) => [row.companyId, Number(row.costCents)]));
      const statusRows = ids.length ? await db.select({ companyId: companies.id, status: companies.status }).from(companies).where(inArray(companies.id, ids)) : [];
      const statusByCompany = new Map(statusRows.map((row) => [row.companyId, row.status]));
      const companiesList = snapshot.companies.map((entry) => ({ companyId: entry.companyId, name: entry.companyName, status: statusByCompany.get(entry.companyId) ?? "unknown", costCents: costByCompany.get(entry.companyId) ?? 0, source: "cost_events" as const }));
      return { accountId, period: { start: start.toISOString(), end: end.toISOString() }, companies: companiesList, aggregate: { costCents: companiesList.reduce((sum, row) => sum + row.costCents, 0), costSource: "cost_events" as const, billingSource: "product_account" as const, invoicesByCompany: "unavailable" as const }, accountUsage: snapshot.usage };
    },
    async saveBrand(companyId: string, userId: string, input: unknown) {
      const body = agencyBrandSchema.parse(input), requestedDomain = domainOrNull(body.requestedDomain);
      if (body.logoAssetId) {
        const [asset] = await db.select({ id: assets.id, companyId: assets.companyId, contentType: assets.contentType }).from(assets).where(and(eq(assets.id, body.logoAssetId), eq(assets.companyId, companyId))).limit(1);
        if (!asset || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(asset.contentType.toLowerCase())) throw unprocessable("Logo must be an image asset owned by this company (PNG, JPEG, WebP, or GIF).", { code: "agency_brand_logo_invalid" });
      }
      const [row] = await db.insert(productizationAgencyBrands).values({ companyId, ...body, requestedDomain, domainStatus: "unavailable", updatedByUserId: userId, updatedAt: new Date() }).onConflictDoUpdate({ target: productizationAgencyBrands.companyId, set: { ...body, requestedDomain, domainStatus: "unavailable", updatedByUserId: userId, updatedAt: new Date() } }).returning();
      return { ...row, logoUrl: row?.logoAssetId && row.publicEnabled ? `/api/public/productization/agency/brands/${companyId}/logo` : null, domainStatus: "unavailable" as const };
    },
    async getBrand(companyId: string) {
      const [row] = await db.select().from(productizationAgencyBrands).where(and(eq(productizationAgencyBrands.companyId, companyId), eq(productizationAgencyBrands.publicEnabled, true))).limit(1);
      if (!row) return null;
      return { displayName: row.displayName, primaryColor: row.primaryColor, accentColor: row.accentColor, logoUrl: row.logoAssetId ? `/api/public/productization/agency/brands/${companyId}/logo` : null, domainStatus: "unavailable" as const };
    },
    async getBrandSettings(companyId: string) {
      const [row] = await db.select().from(productizationAgencyBrands).where(eq(productizationAgencyBrands.companyId, companyId)).limit(1);
      if (row) return { ...row, logoUrl: row.logoAssetId ? `/api/public/productization/agency/brands/${companyId}/logo` : null };
      const [companyRow] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!companyRow) throw notFound("Company not found.");
      return { companyId, publicEnabled: false, displayName: companyRow.name, primaryColor: "#183f35", accentColor: "#e7ece2", logoAssetId: null, requestedDomain: null, domainStatus: "unavailable" as const, updatedByUserId: null, createdAt: null, updatedAt: null, logoUrl: null };
    },
    async getPublicLogo(companyId: string) {
      const [brand] = await db.select({ logoAssetId: productizationAgencyBrands.logoAssetId }).from(productizationAgencyBrands).where(and(eq(productizationAgencyBrands.companyId, companyId), eq(productizationAgencyBrands.publicEnabled, true))).limit(1);
      if (!brand?.logoAssetId) return null;
      const [asset] = await db.select({ companyId: assets.companyId, objectKey: assets.objectKey, contentType: assets.contentType, byteSize: assets.byteSize, sha256: assets.sha256 }).from(assets).where(and(eq(assets.id, brand.logoAssetId), eq(assets.companyId, companyId))).limit(1);
      if (!asset || asset.byteSize > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(asset.contentType.toLowerCase())) return null;
      return asset;
    },
    async addClientUser(companyId: string, grantedByUserId: string, targetUserId: string) {
      const [target] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.id, targetUserId)).limit(1);
      if (!target) throw notFound("Client user must have a Paperclip account before access can be assigned.");
      if (!await access.canUser(companyId, grantedByUserId, "users:manage_permissions")) throw forbidden("Company permission management is required; account membership does not grant company access.");
      const [existingMembership] = await db.select({ id: companyMemberships.id, membershipRole: companyMemberships.membershipRole, status: companyMemberships.status }).from(companyMemberships).where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, targetUserId))).limit(1);
      if (existingMembership) throw conflict("This user already has company membership. Manage their existing role and grants explicitly; this action never changes them to viewer.", { code: "agency_client_membership_exists", membershipRole: existingMembership.membershipRole, status: existingMembership.status });
      const [existingGrant] = await db.select({ id: principalPermissionGrants.id }).from(principalPermissionGrants).where(and(eq(principalPermissionGrants.companyId, companyId), eq(principalPermissionGrants.principalType, "user"), eq(principalPermissionGrants.principalId, targetUserId))).limit(1);
      if (existingGrant) throw conflict("Permission grants already exist for this user. Resolve them through company permissions before creating a viewer membership.", { code: "agency_client_grants_exist" });
      await access.ensureMembership(companyId, "user", targetUserId, "viewer", "active");
      await access.ensureRoleDefaultGrants(companyId, targetUserId, "viewer", grantedByUserId);
      return { companyId, userId: targetUserId, membershipRole: "viewer" as const };
    },
  };
}
