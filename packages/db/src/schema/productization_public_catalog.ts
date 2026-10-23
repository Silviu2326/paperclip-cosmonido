import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";
import type { PublicCatalogSelection } from "@paperclipai/shared/productization/public-catalog";
import { productizationPackageInstallations, productizationPortablePackages } from "./productization_packages.js";
import { companies } from "./companies.js";

/** Opt-in review request and immutable, privacy-attested publication version. */
export const productizationPublicCatalog = pgTable("productization_public_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourcePackageId: uuid("source_package_id").notNull().references(() => productizationPortablePackages.id, { onDelete: "restrict" }),
  sourceCompanyId: uuid("source_company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  packageKey: text("package_key").notNull(), packageVersion: text("package_version").notNull(),
  name: text("name").notNull(), description: text("description").notNull(),
  content: jsonb("content").$type<PortablePackage>().notNull(), contentHash: text("content_hash").notNull(),
  selection: jsonb("selection").$type<PublicCatalogSelection>().notNull(),
  status: text("status").notNull().default("pending"),
  requestedByUserId: text("requested_by_user_id").notNull(), requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedByUserId: text("reviewed_by_user_id"), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), reviewNote: text("review_note"),
  privacyAttestedAt: timestamp("privacy_attested_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }), withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sourceVersionUq: uniqueIndex("productization_public_catalog_source_version_uq").on(t.sourcePackageId, t.contentHash),
  statusCreatedIdx: index("productization_public_catalog_status_created_idx").on(t.status, t.createdAt),
  statusCheck: check("productization_public_catalog_status_check", sql`${t.status} in ('pending','published','rejected','withdrawn')`),
}));

/** Provenance for a private draft imported from an approved public version. */
export const productizationPublicCatalogImports = pgTable("productization_public_catalog_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => productizationPublicCatalog.id, { onDelete: "restrict" }),
  packageId: uuid("package_id").notNull().references(() => productizationPortablePackages.id, { onDelete: "restrict" }),
  sourceCompanyId: uuid("source_company_id").notNull().references(() => companies.id, { onDelete: "restrict" }), targetCompanyId: uuid("target_company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  importedByUserId: text("imported_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ packageUq: uniqueIndex("productization_public_catalog_import_package_uq").on(t.packageId), listingIdx: index("productization_public_catalog_import_listing_idx").on(t.listingId, t.targetCompanyId) }));

/** A vote requires a real completed installer receipt for this exact listing version. */
export const productizationPublicCatalogRatings = pgTable("productization_public_catalog_ratings", {
  id: uuid("id").primaryKey().defaultRandom(), listingId: uuid("listing_id").notNull().references(() => productizationPublicCatalog.id, { onDelete: "cascade" }),
  installationId: uuid("installation_id").notNull().references(() => productizationPackageInstallations.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull(), rating: integer("rating").notNull(), review: text("review"),
  status: text("status").notNull().default("visible"), moderatedByUserId: text("moderated_by_user_id"), moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ principalUq: uniqueIndex("productization_public_catalog_rating_principal_uq").on(t.listingId, t.userId), receiptIdx: index("productization_public_catalog_rating_receipt_idx").on(t.listingId, t.installationId), statusCheck: check("productization_public_catalog_rating_status_check", sql`${t.status} in ('visible','hidden')`), ratingCheck: check("productization_public_catalog_rating_value_check", sql`${t.rating} between 1 and 5`) }));
