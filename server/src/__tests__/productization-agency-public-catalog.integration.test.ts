import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  authUsers,
  companies,
  companyMemberships,
  createDb,
  principalPermissionGrants,
  productAccounts,
  productAccountCompanyGrants,
  productAccountMembers,
  productPlans,
  productizationAgencyOperations,
  productizationPackageInstallations,
  productizationPortablePackages,
  productizationPublicCatalog,
  productizationPublicCatalogImports,
  productizationPublicCatalogRatings,
  type Db,
} from "@paperclipai/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { productizationAgencyService } from "../services/productization/agency.js";
import { productizationAccountsService } from "../services/productization/accounts.js";
import { productizationPublicCatalogService } from "../services/productization/public-catalog.js";
import { portablePackageContentHash } from "../services/productization/package-installation.js";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";

const support = await getEmbeddedPostgresTestSupport();
const describeDatabase = support.supported ? describe : describe.skip;

const packageContent: PortablePackage = {
  format: "paperclip.portable-package", version: 1, packageKey: "agency-fixture", packageVersion: "1.0.0",
  name: "Agency fixture", description: "A clean package for database boundary tests.", teams: [], skills: [],
  playbooks: [], requestTemplates: [], brandPresets: [], forms: [], meetingTypes: [], connectionRequests: [],
};

describeDatabase("S95 agency and public catalog company/receipt boundaries", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: Db;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-s95-agency-catalog-");
    db = createDb(database.connectionString);
  }, 90_000);
  afterAll(async () => { await database?.cleanup(); });

  async function user(id: string) {
    const now = new Date();
    await db.insert(authUsers).values({ id, name: id, email: `${id}@fixture.invalid`, createdAt: now, updatedAt: now });
  }
  async function company(name: string) {
    const id = randomUUID();
    await db.insert(companies).values({ id, name, issuePrefix: `T${id.replace(/-/g, "").slice(0, 7).toUpperCase()}` });
    return id;
  }

  it("adds a fresh client user as a viewer, and refuses to rewrite an existing administrator or residual grants", async () => {
    const companyId = await company("Agency client ACL fixture");
    const operatorId = randomUUID(), freshViewerId = randomUUID(), existingAdminId = randomUUID(), residualGrantId = randomUUID();
    await Promise.all([user(operatorId), user(freshViewerId), user(existingAdminId), user(residualGrantId)]);
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: operatorId, membershipRole: "owner", status: "active" });
    await db.insert(principalPermissionGrants).values({ companyId, principalType: "user", principalId: operatorId, permissionKey: "users:manage_permissions", grantedByUserId: operatorId });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: existingAdminId, membershipRole: "admin", status: "active" });
    await db.insert(principalPermissionGrants).values({ companyId, principalType: "user", principalId: existingAdminId, permissionKey: "agents:create", grantedByUserId: operatorId });
    await db.insert(principalPermissionGrants).values({ companyId, principalType: "user", principalId: residualGrantId, permissionKey: "agents:create", grantedByUserId: operatorId });

    const service = productizationAgencyService(db);
    await expect(service.addClientUser(companyId, operatorId, existingAdminId)).rejects.toMatchObject({ details: { code: "agency_client_membership_exists" } });
    await expect(service.addClientUser(companyId, operatorId, residualGrantId)).rejects.toMatchObject({ details: { code: "agency_client_grants_exist" } });

    const [adminMembership] = await db.select().from(companyMemberships).where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalId, existingAdminId)));
    const adminGrants = await db.select().from(principalPermissionGrants).where(and(eq(principalPermissionGrants.companyId, companyId), eq(principalPermissionGrants.principalId, existingAdminId)));
    expect(adminMembership).toMatchObject({ membershipRole: "admin", status: "active" });
    expect(adminGrants.map((grant) => grant.permissionKey)).toEqual(["agents:create"]);

    const result = await service.addClientUser(companyId, operatorId, freshViewerId);
    expect(result).toMatchObject({ companyId, userId: freshViewerId, membershipRole: "viewer" });
    const viewerGrants = await db.select().from(principalPermissionGrants).where(and(eq(principalPermissionGrants.companyId, companyId), eq(principalPermissionGrants.principalId, freshViewerId)));
    expect(viewerGrants.some((grant) => grant.permissionKey === "agents:create")).toBe(false);
  });

  it("admits an archived company through account capacity without requiring a company ACL, then reuses its grant idempotently", async () => {
    const ownerId = randomUUID(); await user(ownerId);
    const accountId = randomUUID(), planId = `agency-test-${randomUUID()}`;
    await db.insert(productPlans).values({ id: planId, name: "One-company test", enabled: 1, limits: { companies: 1, agents: null, jobs_per_month: null, video_minutes: null, messages: null, connections: null } });
    await db.insert(productAccounts).values({ id: accountId, ownerUserId: ownerId, name: "Agency account", planId, access: "active" });
    await db.insert(productAccountMembers).values({ accountId, userId: ownerId, role: "owner" });
    const firstCompanyId = await company("First admitted");
    const archivedClientId = randomUUID();
    await db.insert(companies).values({ id: archivedClientId, name: "Archived client", issuePrefix: `T${archivedClientId.replace(/-/g, "").slice(0, 7).toUpperCase()}`, status: "archived" });
    const accounts = productizationAccountsService(db);

    await expect(accounts.grantCompany(accountId, ownerId, firstCompanyId)).resolves.toMatchObject({ accountId, companyId: firstCompanyId });
    await expect(accounts.grantCompany(accountId, ownerId, firstCompanyId)).resolves.toMatchObject({ accountId, companyId: firstCompanyId });
    await expect(accounts.grantCompany(accountId, ownerId, archivedClientId)).rejects.toMatchObject({ status: 422, details: { code: "plan_gate_limit_reached" } });
    const clientGrant = await db.select().from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.companyId, archivedClientId));
    const [client] = await db.select().from(companies).where(eq(companies.id, archivedClientId));
    const clientMembership = await db.select().from(companyMemberships).where(eq(companyMemberships.companyId, archivedClientId));
    expect(clientGrant).toHaveLength(0);
    expect(client).toMatchObject({ status: "archived" });
    expect(clientMembership).toHaveLength(0);
  });

  it("keeps an over-capacity client archived, inaccessible, and bound to one durable idempotency identity", async () => {
    const ownerId = randomUUID(); await user(ownerId);
    const accountId = randomUUID(), planId = `agency-operation-${randomUUID()}`;
    await db.insert(productPlans).values({ id: planId, name: "Source-only capacity", enabled: 1, limits: { companies: 1, agents: null, jobs_per_month: null, video_minutes: null, messages: null, connections: null } });
    await db.insert(productAccounts).values({ id: accountId, ownerUserId: ownerId, name: "Agency operation account", planId, access: "active" });
    await db.insert(productAccountMembers).values({ accountId, userId: ownerId, role: "owner" });
    const sourceCompanyId = await company("Agency package source");
    await db.insert(companyMemberships).values({ companyId: sourceCompanyId, principalType: "user", principalId: ownerId, membershipRole: "owner", status: "active" });
    await db.insert(principalPermissionGrants).values({ companyId: sourceCompanyId, principalType: "user", principalId: ownerId, permissionKey: "agents:create", grantedByUserId: ownerId });
    const sourceHash = portablePackageContentHash(packageContent), now = new Date();
    const [sourcePackage] = await db.insert(productizationPortablePackages).values({
      companyId: sourceCompanyId, packageKey: packageContent.packageKey, packageVersion: packageContent.packageVersion,
      name: packageContent.name, description: packageContent.description, content: packageContent, contentHash: sourceHash,
      status: "published", privacyAttestedAt: now, createdByUserId: ownerId,
    }).returning();
    const operationService = productizationAgencyService(db);
    const accounts = productizationAccountsService(db);
    // Fill the single allowed slot through the real account admission service before provisioning.
    await accounts.grantCompany(accountId, ownerId, sourceCompanyId);
    const request = { name: "Capacity-blocked client", description: "", sourceCompanyId, sourcePackageId: sourcePackage.id, idempotencyKey: randomUUID(), attestPublishedPackage: true as const };
    const first = await operationService.createClient(accountId, ownerId, request);
    const second = await operationService.createClient(accountId, ownerId, request);
    expect(first).toMatchObject({ status: "awaiting_capacity", companyName: request.name });
    expect(second).toMatchObject({ id: first.id, companyId: first.companyId, status: "awaiting_capacity" });
    const [stored] = await db.select().from(productizationAgencyOperations).where(eq(productizationAgencyOperations.id, first.id));
    const [client] = await db.select().from(companies).where(eq(companies.id, first.companyId));
    const grants = await db.select().from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.companyId, first.companyId));
    const memberships = await db.select().from(companyMemberships).where(eq(companyMemberships.companyId, first.companyId));
    expect(stored).toMatchObject({ status: "awaiting_capacity", companyId: first.companyId, sourceContentHash: sourceHash });
    expect(client).toMatchObject({ status: "archived" });
    expect(grants).toHaveLength(0);
    expect(memberships).toHaveLength(0);
    expect(await operationService.operations(accountId, ownerId)).toHaveLength(1);
  });

  it("requires an exact completed installation receipt imported into the same target company and listing version", async () => {
    const sourceCompanyId = await company("Public package source");
    const targetCompanyId = await company("Receipt target");
    const otherCompanyId = await company("Other receipt company");
    const userId = randomUUID(); await user(userId);
    const contentHash = portablePackageContentHash(packageContent), now = new Date();
    const [sourcePackage] = await db.insert(productizationPortablePackages).values({
      companyId: sourceCompanyId, packageKey: packageContent.packageKey, packageVersion: packageContent.packageVersion,
      name: packageContent.name, description: packageContent.description, content: packageContent, contentHash,
      status: "published", privacyAttestedAt: now, createdByUserId: userId,
    }).returning();
    const [listing] = await db.insert(productizationPublicCatalog).values({
      sourcePackageId: sourcePackage.id, sourceCompanyId, packageKey: packageContent.packageKey, packageVersion: packageContent.packageVersion,
      name: packageContent.name, description: packageContent.description, content: packageContent, contentHash,
      selection: { teamMembers: [], skills: [], playbooks: [], requestTemplates: [], brandPresets: [], forms: [], meetingTypes: [], connectionRequests: [] },
      status: "published", requestedByUserId: userId, requestedAt: now, privacyAttestedAt: now, publishedAt: now,
    }).returning();
    const [importedPackage] = await db.insert(productizationPortablePackages).values({
      companyId: targetCompanyId, packageKey: packageContent.packageKey, packageVersion: packageContent.packageVersion,
      name: packageContent.name, description: packageContent.description, content: packageContent, contentHash, status: "draft", createdByUserId: userId,
    }).returning();
    await db.insert(productizationPublicCatalogImports).values({ listingId: listing.id, packageId: importedPackage.id, sourceCompanyId, targetCompanyId, importedByUserId: userId });
    const [receipt] = await db.insert(productizationPackageInstallations).values({
      companyId: targetCompanyId, packageId: importedPackage.id, packageKey: packageContent.packageKey, packageVersion: packageContent.packageVersion,
      contentHash, status: "completed", plan: { unsupported: [], acknowledgedUnsupported: [], skills: [], specialists: [] }, createdByUserId: userId, completedAt: now,
    }).returning();
    const catalog = productizationPublicCatalogService(db);

    await expect(catalog.rate(otherCompanyId, listing.id, receipt.id, userId, 5)).rejects.toMatchObject({ status: 403 });
    await expect(catalog.rate(targetCompanyId, listing.id, randomUUID(), userId, 5)).rejects.toMatchObject({ status: 403 });
    expect(await db.select().from(productizationPublicCatalogRatings)).toHaveLength(0);

    const [changedPackage] = await db.insert(productizationPortablePackages).values({
      companyId: targetCompanyId, packageKey: packageContent.packageKey, packageVersion: "1.0.1",
      name: packageContent.name, description: packageContent.description, content: packageContent, contentHash: "sha256:another-version", status: "draft", createdByUserId: userId,
    }).returning();
    await db.insert(productizationPublicCatalogImports).values({ listingId: listing.id, packageId: changedPackage.id, sourceCompanyId, targetCompanyId, importedByUserId: userId });
    const [wrongVersionReceipt] = await db.insert(productizationPackageInstallations).values({
      companyId: targetCompanyId, packageId: changedPackage.id, packageKey: packageContent.packageKey, packageVersion: "1.0.1",
      contentHash: "sha256:another-version", status: "completed", plan: { unsupported: [], acknowledgedUnsupported: [], skills: [], specialists: [] }, createdByUserId: userId, completedAt: now,
    }).returning();
    await expect(catalog.rate(targetCompanyId, listing.id, wrongVersionReceipt.id, userId, 5)).rejects.toMatchObject({ status: 403 });
    expect(await db.select().from(productizationPublicCatalogRatings)).toHaveLength(0);

    await catalog.rate(targetCompanyId, listing.id, receipt.id, userId, 4);
    const ratings = await db.select().from(productizationPublicCatalogRatings).where(eq(productizationPublicCatalogRatings.listingId, listing.id));
    expect(ratings).toHaveLength(1);
    expect(ratings[0]).toMatchObject({ userId, installationId: receipt.id, rating: 4 });
  });
});
