import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type {
  PackageInstallationItemReview,
  PackageInstallationPlan,
  PackageResourceItemReview,
  PackageResourceResult,
  PortablePackage,
} from "@paperclipai/shared/productization/portable-package";
import { agents } from "./agents.js";
import { approvals } from "./approvals.js";
import { companies } from "./companies.js";

/**
 * Company-private, versioned portable packages. A published row is immutable
 * (enforced by the service); it grants no authority and is never executed.
 */
export const productizationPortablePackages = pgTable("productization_portable_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  packageKey: text("package_key").notNull(),
  packageVersion: text("package_version").notNull(),
  status: text("status").notNull().default("draft"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  content: jsonb("content").$type<PortablePackage>().notNull(),
  contentHash: text("content_hash").notNull(),
  /** Reviewer attestation that the content holds no customer data, credentials or private material. */
  privacyAttestedAt: timestamp("privacy_attested_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id"),
  reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  publishedByUserId: text("published_by_user_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyKeyVersionUq: uniqueIndex("productization_portable_packages_company_key_version_uq").on(table.companyId, table.packageKey, table.packageVersion),
  companyStatusIdx: index("productization_portable_packages_company_status_idx").on(table.companyId, table.status, table.updatedAt),
  statusCheck: check("productization_portable_packages_status_check", sql`${table.status} in ('draft','in_review','published','withdrawn')`),
}));

/**
 * Durable installation receipt. One receipt per company + package version
 * (unique index), so repeated or concurrent install requests resolve to the same
 * row instead of duplicating resources.
 */
export const productizationPackageInstallations = pgTable("productization_package_installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").notNull().references(() => productizationPortablePackages.id, { onDelete: "restrict" }),
  packageKey: text("package_key").notNull(),
  packageVersion: text("package_version").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("planned"),
  /** Reviewed plan snapshot: unsupported sections, acknowledged limitations and skill requirements. */
  plan: jsonb("plan").$type<PackageInstallationPlan>().notNull(),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  companyPackageUq: uniqueIndex("productization_package_installations_company_package_uq").on(table.companyId, table.packageId),
  companyStatusIdx: index("productization_package_installations_company_status_idx").on(table.companyId, table.status),
  statusCheck: check("productization_package_installations_status_check", sql`${table.status} in ('planned','in_progress','completed','needs_attention','cancelled')`),
}));

/**
 * One receipt item per persistent agent or per installed resource; `kind` is the typed discriminator.
 * Specialists and the sections without an installer are never items.
 *
 * Agent statuses (`persistent_agent`): `planned` (never claimed; may be cancelled), `submitting`/`unknown`
 * (claimed, outcome unresolved: blocked, resolved only by server-side reconciliation, never released),
 * `pending_approval`, `hired`, `cancelled` (only from `planned`). `blocked` is reserved and not written today.
 *
 * Resource statuses (playbook / lead_form / brand_preset / request_template): `planned`, `creating`
 * (claimed with a conditional UPDATE before the domain write; resumable because the domain identity is
 * unique), `created` (domain row linked in `resource_id` / `result`), `conflict` (the identity is held by
 * something that is not the pinned snapshot; never overwritten), `cancelled` (only from `planned`).
 */
export const productizationPackageInstallationItems = pgTable("productization_package_installation_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: uuid("installation_id").notNull().references(() => productizationPackageInstallations.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  /** `<teamId>/<memberId>` for agents; `<kind>/<localId>` for resources. */
  localKey: text("local_key").notNull(),
  kind: text("kind").notNull().default("persistent_agent"),
  status: text("status").notNull().default("planned"),
  review: jsonb("review").$type<PackageInstallationItemReview | PackageResourceItemReview>().notNull(),
  /** Resource items: deterministic key/slug the domain row is created under (unique per company and kind). */
  domainIdentity: text("domain_identity"),
  /** Resource items: sha256 of the resource as it appears in the published package. */
  sourceContentHash: text("source_content_hash"),
  /** Resource items: id of the domain row this item produced (polymorphic by `kind`, so no foreign key). */
  resourceId: uuid("resource_id"),
  /** Resource items: durable mapping from this item to the domain row. */
  result: jsonb("result").$type<PackageResourceResult>(),
  /**
   * Correlation id carried in agent metadata and in the hire `Idempotency-Key`; used only to reconcile,
   * never to retry. It is never rotated: no code path releases a claim and re-issues a request.
   */
  hireAttemptId: uuid("hire_attempt_id").notNull().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
  claimedByUserId: text("claimed_by_user_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  installationKeyUq: uniqueIndex("productization_package_installation_items_key_uq").on(table.installationId, table.localKey),
  hireAttemptUq: uniqueIndex("productization_package_installation_items_attempt_uq").on(table.hireAttemptId),
  agentUq: uniqueIndex("productization_package_installation_items_agent_uq").on(table.agentId).where(sql`${table.agentId} is not null`),
  companyStatusIdx: index("productization_package_installation_items_company_status_idx").on(table.companyId, table.status),
  domainIdentityUq: uniqueIndex("productization_package_installation_items_identity_uq")
    .on(table.companyId, table.kind, table.domainIdentity)
    .where(sql`${table.domainIdentity} is not null`),
  resourceUq: uniqueIndex("productization_package_installation_items_resource_uq")
    .on(table.kind, table.resourceId)
    .where(sql`${table.resourceId} is not null`),
  kindCheck: check("productization_package_installation_items_kind_check", sql`${table.kind} in ('persistent_agent','playbook','lead_form','brand_preset','request_template')`),
  statusCheck: check("productization_package_installation_items_status_check", sql`${table.status} in ('planned','submitting','pending_approval','hired','unknown','blocked','cancelled','creating','created','conflict')`),
}));

/** Provenance shared by the package-installed draft tables below. */
const draftProvenance = {
  sourcePackageKey: text("source_package_key").notNull(),
  sourcePackageVersion: text("source_package_version").notNull(),
  sourceLocalId: text("source_local_id").notNull(),
  sourceContentHash: text("source_content_hash").notNull(),
  /** The receipt item that created this row; kept as a plain id so deleting a receipt never deletes the row. */
  sourceItemId: uuid("source_item_id").notNull(),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Brand preset installed from a package. Created as `draft` and inert: nothing reads it to publish,
 * send or restyle anything until a person activates it in a later, separate step.
 */
export const productizationBrandPresets = pgTable("productization_brand_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  presetKey: text("preset_key").notNull(),
  name: text("name").notNull(),
  voice: text("voice").notNull(),
  audience: text("audience").notNull(),
  preferredTerms: jsonb("preferred_terms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  avoidedTerms: jsonb("avoided_terms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  primaryColor: text("primary_color"),
  accentColor: text("accent_color"),
  status: text("status").notNull().default("draft"),
  ...draftProvenance,
}, (table) => ({
  companyKeyUq: uniqueIndex("productization_brand_presets_company_key_uq").on(table.companyId, table.presetKey),
  provenanceUq: uniqueIndex("productization_brand_presets_provenance_uq").on(table.companyId, table.sourcePackageKey, table.sourcePackageVersion, table.sourceLocalId),
  sourceItemUq: uniqueIndex("productization_brand_presets_source_item_uq").on(table.sourceItemId),
  companyStatusIdx: index("productization_brand_presets_company_status_idx").on(table.companyId, table.status),
  statusCheck: check("productization_brand_presets_status_check", sql`${table.status} in ('draft','active','archived')`),
}));

/** Reference from a request template to a playbook: an installed one by key, or a catalog one kept as text. */
export type RequestTemplatePlaybookRef =
  | { kind: "installed"; playbookKey: string }
  | { kind: "catalog"; key: string; version: string };

/**
 * Request (encargo) template installed from a package. Created as `draft`; it creates no assignment,
 * starts no playbook and spends nothing until a person uses it.
 */
export const productizationRequestTemplates = pgTable("productization_request_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  templateKey: text("template_key").notNull(),
  name: text("name").notNull(),
  outcome: text("outcome").notNull(),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  expectedDeliverable: text("expected_deliverable").notNull(),
  suggestedPlaybooks: jsonb("suggested_playbooks").$type<RequestTemplatePlaybookRef[]>().notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("draft"),
  ...draftProvenance,
}, (table) => ({
  companyKeyUq: uniqueIndex("productization_request_templates_company_key_uq").on(table.companyId, table.templateKey),
  provenanceUq: uniqueIndex("productization_request_templates_provenance_uq").on(table.companyId, table.sourcePackageKey, table.sourcePackageVersion, table.sourceLocalId),
  sourceItemUq: uniqueIndex("productization_request_templates_source_item_uq").on(table.sourceItemId),
  companyStatusIdx: index("productization_request_templates_company_status_idx").on(table.companyId, table.status),
  statusCheck: check("productization_request_templates_status_check", sql`${table.status} in ('draft','active','archived')`),
}));
