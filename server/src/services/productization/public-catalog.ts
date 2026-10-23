import { and, desc, eq, sql } from "drizzle-orm";
import {
  productizationPackageInstallations, productizationPortablePackages, productizationPublicCatalog,
  productizationPublicCatalogImports, productizationPublicCatalogRatings, type Db,
} from "@paperclipai/db";
import { findPackagePrivacyIssues, portablePackageSchema, type PortablePackage } from "@paperclipai/shared/productization/portable-package";
import { publicCatalogSelectionSchema, type PublicCatalogSelection } from "@paperclipai/shared/productization/public-catalog";
import { conflict, forbidden, notFound, unprocessable } from "../../errors.js";
import { portablePackageCatalogService, portablePackageContentHash } from "./package-installation.js";

const PAGE_SIZE = 50;
function redactPackage(pkg: PortablePackage, selection: PublicCatalogSelection): PortablePackage {
  const teamMembers = new Set(selection.teamMembers);
  const content: PortablePackage = {
    ...pkg,
    teams: pkg.teams.map((team) => ({ ...team, members: team.members.filter((member) => teamMembers.has(`${team.id}/${member.id}`)) })).filter((team) => team.members.length),
    skills: pkg.skills.filter((item) => selection.skills.includes(item.id)),
    playbooks: pkg.playbooks.filter((item) => selection.playbooks.includes(item.id)),
    requestTemplates: pkg.requestTemplates.filter((item) => selection.requestTemplates.includes(item.id)),
    brandPresets: pkg.brandPresets.filter((item) => selection.brandPresets.includes(item.id)),
    forms: pkg.forms.filter((item) => selection.forms.includes(item.id)),
    meetingTypes: pkg.meetingTypes.filter((item) => selection.meetingTypes.includes(item.id)),
    connectionRequests: pkg.connectionRequests.filter((_, index) => selection.connectionRequests.includes(index)),
  };
  return content;
}
function toPublic(row: typeof productizationPublicCatalog.$inferSelect, ratingCount: number, averageRating: number | null, installationCount: number) {
  return { id: row.id, packageKey: row.packageKey, packageVersion: row.packageVersion, name: row.name, description: row.description, contentHash: row.contentHash, package: row.content, ratingCount, averageRating, installationCount, createdAt: row.publishedAt?.toISOString() ?? row.createdAt.toISOString() };
}

export function productizationPublicCatalogService(db: Db) {
  const privateCatalog = portablePackageCatalogService(db);
  async function loadPublished(id: string) {
    const [row] = await db.select().from(productizationPublicCatalog).where(and(eq(productizationPublicCatalog.id, id), eq(productizationPublicCatalog.status, "published"))).limit(1);
    if (!row) throw notFound("Public package not found");
    if (portablePackageContentHash(row.content) !== row.contentHash) throw conflict("Public package integrity check failed.", { code: "public_catalog_hash_mismatch" });
    return row;
  }
  async function stats(ids: string[]) {
    const result = new Map<string, { count: number; average: number | null; installs: number }>();
    if (!ids.length) return result;
    const ratings = await db.select({ listingId: productizationPublicCatalogRatings.listingId, count: sql<number>`count(*)::int`, average: sql<number>`avg(${productizationPublicCatalogRatings.rating})::float` }).from(productizationPublicCatalogRatings).where(and(sql`${productizationPublicCatalogRatings.listingId} = any(${ids}::uuid[])`, eq(productizationPublicCatalogRatings.status, "visible"))).groupBy(productizationPublicCatalogRatings.listingId);
    const imports = await db.select({ listingId: productizationPublicCatalogImports.listingId, count: sql<number>`count(*)::int` }).from(productizationPublicCatalogImports).innerJoin(productizationPackageInstallations, and(eq(productizationPackageInstallations.packageId, productizationPublicCatalogImports.packageId), eq(productizationPackageInstallations.status, "completed"))).where(sql`${productizationPublicCatalogImports.listingId} = any(${ids}::uuid[])`).groupBy(productizationPublicCatalogImports.listingId);
    for (const id of ids) result.set(id, { count: 0, average: null, installs: 0 });
    for (const row of ratings) result.set(row.listingId, { ...(result.get(row.listingId)!), count: row.count, average: row.average });
    for (const row of imports) result.set(row.listingId, { ...(result.get(row.listingId)!), installs: row.count });
    return result;
  }
  return {
    async list(cursor?: string) {
      const rows = await db.select().from(productizationPublicCatalog).where(and(eq(productizationPublicCatalog.status, "published"), ...(cursor ? [sql`${productizationPublicCatalog.id} < ${cursor}::uuid`] : []))).orderBy(desc(productizationPublicCatalog.id)).limit(PAGE_SIZE);
      for (const row of rows) if (portablePackageContentHash(row.content) !== row.contentHash || findPackagePrivacyIssues(row.content).length) throw conflict("Published catalog integrity or privacy check failed.", { code: "public_catalog_integrity_failed" });
      const aggregate = await stats(rows.map((row) => row.id));
      return { items: rows.map((row) => { const s = aggregate.get(row.id)!; return toPublic(row, s.count, s.average, s.installs); }), nextCursor: rows.length === PAGE_SIZE ? rows.at(-1)!.id : null };
    },
    async get(id: string) { const row = await loadPublished(id); const s = (await stats([id])).get(id)!; return toPublic(row, s.count, s.average, s.installs); },
    async request(companyId: string, packageId: string, selectionInput: unknown, userId: string) {
      const selection = publicCatalogSelectionSchema.parse(selectionInput);
      const hasDuplicates = (items: readonly (string | number)[]) => items.some((item, index) => items.indexOf(item) !== index);
      if (!Object.values(selection).some((items) => items.length > 0) || Object.values(selection).some(hasDuplicates)) throw unprocessable("Select at least one unique package item for public review.", { code: "public_catalog_selection_invalid" });
      const [source] = await db.select().from(productizationPortablePackages).where(and(eq(productizationPortablePackages.id, packageId), eq(productizationPortablePackages.companyId, companyId), eq(productizationPortablePackages.status, "published"))).limit(1);
      if (!source || !source.privacyAttestedAt || source.contentHash !== portablePackageContentHash(source.content)) throw conflict("Only an intact, privacy-attested private published package can be submitted.", { code: "public_catalog_source_not_eligible" });
      const sourcePackage = portablePackageSchema.parse(source.content);
      const available: PublicCatalogSelection = {
        teamMembers: sourcePackage.teams.flatMap((team) => team.members.map((member) => `${team.id}/${member.id}`)),
        skills: sourcePackage.skills.map((item) => item.id), playbooks: sourcePackage.playbooks.map((item) => item.id), requestTemplates: sourcePackage.requestTemplates.map((item) => item.id),
        brandPresets: sourcePackage.brandPresets.map((item) => item.id), forms: sourcePackage.forms.map((item) => item.id), meetingTypes: sourcePackage.meetingTypes.map((item) => item.id), connectionRequests: sourcePackage.connectionRequests.map((_, index) => index),
      };
      for (const key of Object.keys(selection) as (keyof PublicCatalogSelection)[]) if ((selection[key] as (string | number)[]).some((value) => !(available[key] as (string | number)[]).includes(value))) throw unprocessable("Selection contains an item that is not in this source version.", { code: "public_catalog_selection_out_of_range", section: key });
      const content = portablePackageSchema.parse(redactPackage(sourcePackage, selection));
      const privacyIssues = findPackagePrivacyIssues(content);
      if (privacyIssues.length) throw unprocessable("Selected package fields need editing before public review.", { code: "public_catalog_privacy_findings", findings: privacyIssues });
      const contentHash = portablePackageContentHash(content);
      const [existing] = await db.select().from(productizationPublicCatalog).where(and(eq(productizationPublicCatalog.sourcePackageId, source.id), eq(productizationPublicCatalog.contentHash, contentHash))).limit(1);
      if (existing) return { id: existing.id, status: existing.status, contentHash: existing.contentHash };
      const [row] = await db.insert(productizationPublicCatalog).values({ sourcePackageId: source.id, sourceCompanyId: companyId, packageKey: content.packageKey, packageVersion: content.packageVersion, name: content.name, description: content.description, content, contentHash, selection, requestedByUserId: userId, privacyAttestedAt: new Date() }).returning();
      return { id: row!.id, status: row!.status, contentHash: row!.contentHash };
    },
    async review(id: string, expectedHash: string, decision: "approve" | "reject", note: string | undefined, adminId: string) {
      const [current] = await db.select({ sourceCompanyId: productizationPublicCatalog.sourceCompanyId }).from(productizationPublicCatalog).where(eq(productizationPublicCatalog.id, id)).limit(1);
      if (!current) throw notFound("Review item not found");
      const [pending] = await db.select().from(productizationPublicCatalog).where(and(eq(productizationPublicCatalog.id, id), eq(productizationPublicCatalog.status, "pending"), eq(productizationPublicCatalog.contentHash, expectedHash))).limit(1);
      if (!pending || portablePackageContentHash(pending.content) !== expectedHash) throw conflict("Review item changed or failed its integrity check.", { code: "public_catalog_review_conflict" });
      if (decision === "approve") {
        portablePackageSchema.parse(pending.content);
        const findings = findPackagePrivacyIssues(pending.content);
        if (findings.length) throw unprocessable("This version still contains privacy findings and cannot be approved.", { code: "public_catalog_privacy_findings", findings });
      }
      const [updated] = await db.update(productizationPublicCatalog).set({ status: decision === "approve" ? "published" : "rejected", reviewedByUserId: adminId, reviewedAt: new Date(), reviewNote: note ?? null, publishedAt: decision === "approve" ? new Date() : null }).where(and(eq(productizationPublicCatalog.id, id), eq(productizationPublicCatalog.status, "pending"), eq(productizationPublicCatalog.contentHash, expectedHash))).returning({ id: productizationPublicCatalog.id, status: productizationPublicCatalog.status });
      if (!updated) throw conflict("Review item changed or was already decided.", { code: "public_catalog_review_conflict" });
      return { ...updated, companyId: current.sourceCompanyId };
    },
    async reviewQueue() { return db.select({ id: productizationPublicCatalog.id, packageKey: productizationPublicCatalog.packageKey, packageVersion: productizationPublicCatalog.packageVersion, name: productizationPublicCatalog.name, description: productizationPublicCatalog.description, contentHash: productizationPublicCatalog.contentHash, package: productizationPublicCatalog.content, requestedAt: productizationPublicCatalog.requestedAt }).from(productizationPublicCatalog).where(eq(productizationPublicCatalog.status, "pending")).orderBy(productizationPublicCatalog.requestedAt).limit(50); },
    async importDraft(companyId: string, listingId: string, userId: string) {
      const listing = await loadPublished(listingId);
      const created = await privateCatalog.createDraft(companyId, listing.content, userId);
      await db.insert(productizationPublicCatalogImports).values({ listingId, packageId: created.id, sourceCompanyId: listing.sourceCompanyId, targetCompanyId: companyId, importedByUserId: userId });
      return { package: created, provenance: { listingId, packageVersion: listing.packageVersion, contentHash: listing.contentHash }, nextStep: "Use the private catalog review and installation workflow; import creates only a draft." };
    },
    async rate(companyId: string, listingId: string, installationId: string, userId: string, rating: number, review?: string) {
      const listing = await loadPublished(listingId);
      const [receipt] = await db.select({ installation: productizationPackageInstallations, source: productizationPublicCatalogImports }).from(productizationPackageInstallations).innerJoin(productizationPublicCatalogImports, and(eq(productizationPublicCatalogImports.packageId, productizationPackageInstallations.packageId), eq(productizationPublicCatalogImports.listingId, listingId), eq(productizationPublicCatalogImports.targetCompanyId, companyId))).where(and(eq(productizationPackageInstallations.id, installationId), eq(productizationPackageInstallations.companyId, companyId), eq(productizationPackageInstallations.status, "completed"))).limit(1);
      if (!receipt || receipt.installation.contentHash !== listing.contentHash) throw forbidden("A completed installation receipt for this public version is required.");
      if (review && findPackagePrivacyIssues(review).length) throw unprocessable("Review contains private or identifying information.", { code: "public_catalog_review_privacy" });
      const [existing] = await db.select().from(productizationPublicCatalogRatings).where(and(eq(productizationPublicCatalogRatings.listingId, listingId), eq(productizationPublicCatalogRatings.userId, userId))).limit(1);
      if (existing) { if (existing.status !== "visible") throw conflict("A moderated rating cannot be edited by its author.", { code: "public_catalog_rating_moderated" }); const [updated] = await db.update(productizationPublicCatalogRatings).set({ rating, review: review ?? null, updatedAt: new Date() }).where(and(eq(productizationPublicCatalogRatings.id, existing.id), eq(productizationPublicCatalogRatings.userId, userId), eq(productizationPublicCatalogRatings.status, "visible"))).returning(); if (!updated) throw conflict("Rating changed during update.", { code: "public_catalog_rating_conflict" }); return { id: updated.id }; }
      const [row] = await db.insert(productizationPublicCatalogRatings).values({ listingId, installationId, userId, rating, review: review ?? null }).returning({ id: productizationPublicCatalogRatings.id });
      return row;
    },
    async ratings(listingId: string) { await loadPublished(listingId); return db.select({ rating: productizationPublicCatalogRatings.rating, review: productizationPublicCatalogRatings.review, createdAt: productizationPublicCatalogRatings.createdAt }).from(productizationPublicCatalogRatings).where(and(eq(productizationPublicCatalogRatings.listingId, listingId), eq(productizationPublicCatalogRatings.status, "visible"))).orderBy(desc(productizationPublicCatalogRatings.createdAt)).limit(50); },
    async moderationQueue() { return db.select({ id: productizationPublicCatalogRatings.id, listingId: productizationPublicCatalogRatings.listingId, packageName: productizationPublicCatalog.name, rating: productizationPublicCatalogRatings.rating, review: productizationPublicCatalogRatings.review, status: productizationPublicCatalogRatings.status, createdAt: productizationPublicCatalogRatings.createdAt }).from(productizationPublicCatalogRatings).innerJoin(productizationPublicCatalog, eq(productizationPublicCatalog.id, productizationPublicCatalogRatings.listingId)).where(eq(productizationPublicCatalog.status, "published")).orderBy(desc(productizationPublicCatalogRatings.createdAt)).limit(100); },
    async moderateRating(id: string, visible: boolean, adminId: string) { const [existing] = await db.select({ companyId: productizationPublicCatalog.sourceCompanyId }).from(productizationPublicCatalogRatings).innerJoin(productizationPublicCatalog, eq(productizationPublicCatalog.id, productizationPublicCatalogRatings.listingId)).where(eq(productizationPublicCatalogRatings.id, id)).limit(1); if (!existing) throw notFound("Rating not found"); const [row] = await db.update(productizationPublicCatalogRatings).set({ status: visible ? "visible" : "hidden", moderatedByUserId: adminId, moderatedAt: new Date() }).where(eq(productizationPublicCatalogRatings.id, id)).returning({ id: productizationPublicCatalogRatings.id }); if (!row) throw notFound("Rating not found"); return { ...row, companyId: existing.companyId }; },
    async withdraw(companyId: string, id: string) { const [row] = await db.update(productizationPublicCatalog).set({ status: "withdrawn", withdrawnAt: new Date() }).where(and(eq(productizationPublicCatalog.id, id), eq(productizationPublicCatalog.sourceCompanyId, companyId), eq(productizationPublicCatalog.status, "published"))).returning({ id: productizationPublicCatalog.id }); if (!row) throw conflict("Only an active listing owned by this company can be withdrawn."); return row; },
  };
}
