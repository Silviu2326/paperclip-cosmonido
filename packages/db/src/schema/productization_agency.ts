import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, boolean } from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";
import { assets } from "./assets.js";
import { companies } from "./companies.js";
import { productAccounts } from "./productization_accounts.js";
import { productizationPortablePackages } from "./productization_packages.js";

/** Idempotent resumable client-company setup. companyId is stable before the canonical factory runs. */
export const productizationAgencyOperations = pgTable("productization_agency_operations", {
  id: uuid("id").primaryKey().defaultRandom(), accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(), fingerprint: text("fingerprint").notNull(), companyId: uuid("company_id").notNull(),
  companyName: text("company_name").notNull(), companyDescription: text("company_description").notNull().default(""), sourceContentHash: text("source_content_hash").notNull(),
  sourceCompanyId: uuid("source_company_id").notNull().references(() => companies.id, { onDelete: "restrict" }), sourcePackageId: uuid("source_package_id").notNull().references(() => productizationPortablePackages.id, { onDelete: "restrict" }),
  targetPackageId: uuid("target_package_id").references(() => productizationPortablePackages.id, { onDelete: "set null" }), requestedByUserId: text("requested_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"), leaseId: uuid("lease_id"), leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ accountKeyUq: uniqueIndex("productization_agency_operations_account_key_uq").on(t.accountId, t.idempotencyKey), accountCompanyUq: uniqueIndex("productization_agency_operations_company_uq").on(t.accountId, t.companyId), statusLeaseIdx: index("productization_agency_operations_status_lease_idx").on(t.status, t.leaseExpiresAt), statusCheck: check("productization_agency_operations_status_check", sql`${t.status} in ('pending','creating','awaiting_capacity','package_ready','ready','uncertain')`) }));

/** Public brand settings are opt-in; domainStatus is constrained until a verified hosting flow exists. */
export const productizationAgencyBrands = pgTable("productization_agency_brands", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  publicEnabled: boolean("public_enabled").notNull().default(false), displayName: text("display_name").notNull(),
  primaryColor: text("primary_color").notNull(), accentColor: text("accent_color").notNull(), logoAssetId: uuid("logo_asset_id").references(() => assets.id, { onDelete: "set null" }),
  requestedDomain: text("requested_domain"), domainStatus: text("domain_status").notNull().default("unavailable"),
  updatedByUserId: text("updated_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ domainStatusCheck: check("productization_agency_brands_domain_status_check", sql`${t.domainStatus} = 'unavailable'`), primaryColorCheck: check("productization_agency_brands_primary_color_check", sql`${t.primaryColor} ~ '^#[0-9A-Fa-f]{6}$'`), accentColorCheck: check("productization_agency_brands_accent_color_check", sql`${t.accentColor} ~ '^#[0-9A-Fa-f]{6}$'`) }));
