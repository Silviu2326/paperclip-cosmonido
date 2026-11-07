import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, check, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";
import { productAccounts } from "./productization_accounts.js";

/**
 * Explicit per-company retention policy. A category deletes or redacts content only while its
 * `*_enabled` flag is true; `revision` is the optimistic-concurrency token for every write.
 * `retention_days` is the legacy preference-only column and is no longer read.
 */
export const companyRetention = pgTable("productization_company_retention", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  retentionDays: integer("retention_days").notNull().default(365),
  conversationsEnabled: boolean("conversations_enabled").notNull().default(false),
  conversationsDays: integer("conversations_days").notNull().default(365),
  filesEnabled: boolean("files_enabled").notNull().default(false),
  filesDays: integer("files_days").notNull().default(30),
  revision: integer("revision").notNull().default(0),
  updatedByUserId: text("updated_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyUnique: uniqueIndex("productization_company_retention_company_uq").on(table.companyId),
  retentionDaysCheck: check("productization_company_retention_days_check", sql`${table.retentionDays} BETWEEN 1 AND 3650`),
  conversationsDaysCheck: check("productization_company_retention_conv_days_check", sql`${table.conversationsDays} BETWEEN 30 AND 3650`),
  filesDaysCheck: check("productization_company_retention_files_days_check", sql`${table.filesDays} BETWEEN 7 AND 3650`),
  revisionCheck: check("productization_company_retention_revision_check", sql`${table.revision} >= 0`),
}));

/** Counts shown to an admin before a destructive policy can be saved. Single use, short lived. */
export const retentionPreviews = pgTable("productization_retention_previews", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  inputHash: text("input_hash").notNull(),
  counts: jsonb("counts").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (table) => ({
  companyIdx: index("productization_retention_previews_company_idx").on(table.companyId, table.createdAt),
}));

/**
 * Leased, resumable sweep. Cutoffs are fixed at creation so a resumed sweep never widens its scope;
 * cursors are keyset positions (uuid order) advanced in the same transaction as the work they cover.
 */
export const retentionSweeps = pgTable("productization_retention_sweeps", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  policyRevision: integer("policy_revision").notNull(),
  status: text("status").notNull().default("pending"),
  phase: text("phase").notNull().default("conversations"),
  conversationsCutoff: timestamp("conversations_cutoff", { withTimezone: true }),
  filesCutoff: timestamp("files_cutoff", { withTimezone: true }),
  conversationsCursor: uuid("conversations_cursor"),
  filesCursor: uuid("files_cursor"),
  conversationsRedacted: integer("conversations_redacted").notNull().default(0),
  messagesRedacted: integer("messages_redacted").notNull().default(0),
  filesPurged: integer("files_purged").notNull().default(0),
  versionsPurged: integer("versions_purged").notNull().default(0),
  bytesPurged: bigint("bytes_purged", { mode: "number" }).notNull().default(0),
  protectedSkipped: integer("protected_skipped").notNull().default(0),
  failures: integer("failures").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  activeUnique: uniqueIndex("productization_retention_sweeps_active_uq").on(table.companyId).where(sql`${table.status} in ('pending','running')`),
  claimIdx: index("productization_retention_sweeps_claim_idx").on(table.status, table.leaseExpiresAt),
  companyIdx: index("productization_retention_sweeps_company_idx").on(table.companyId, table.createdAt),
  statusCheck: check("productization_retention_sweeps_status_check", sql`${table.status} in ('pending','running','completed','failed','superseded')`),
  phaseCheck: check("productization_retention_sweeps_phase_check", sql`${table.phase} in ('conversations','files','done')`),
}));

/** Durable audit and receipts for policy changes and sweep batches. Holds counts and ids, never content. */
export const retentionEvents = pgTable("productization_retention_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sweepId: uuid("sweep_id").references(() => retentionSweeps.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyIdx: index("productization_retention_events_company_idx").on(table.companyId, table.createdAt),
  kindCheck: check("productization_retention_events_kind_check", sql`${table.kind} in ('policy_updated','sweep_started','sweep_batch','sweep_completed','sweep_failed','sweep_superseded')`),
  actorCheck: check("productization_retention_events_actor_check", sql`${table.actorType} in ('user','system')`),
}));

/**
 * User-requested deletion of one commercial account. The product_accounts row is kept (anonymized)
 * so audit events, Stripe identifiers and the owner foreign key stay intact; companies and the
 * global auth user are never deleted by this lifecycle.
 */
export const accountDeletions = pgTable("productization_account_deletions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "restrict" }),
  requestedByUserId: text("requested_by_user_id").notNull(),
  status: text("status").notNull().default("cooling"),
  step: text("step").notNull().default("verify"),
  coolingEndsAt: timestamp("cooling_ends_at", { withTimezone: true }).notNull(),
  scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
  blockerCode: text("blocker_code"),
  blockerDetail: jsonb("blocker_detail").$type<Record<string, unknown>>(),
  irreversibleAt: timestamp("irreversible_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledByUserId: text("cancelled_by_user_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  counters: jsonb("counters").$type<Record<string, number>>().notNull().default({}),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  openUnique: uniqueIndex("productization_account_deletions_open_uq").on(table.accountId).where(sql`${table.status} in ('cooling','running','blocked')`),
  dueIdx: index("productization_account_deletions_due_idx").on(table.status, table.coolingEndsAt),
  statusCheck: check("productization_account_deletions_status_check", sql`${table.status} in ('cooling','running','blocked','completed','cancelled')`),
  stepCheck: check("productization_account_deletions_step_check", sql`${table.step} in ('verify','usage','anonymize','done')`),
}));
