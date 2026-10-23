import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { toolConnections } from "./tool_access.js";

// External CRM sync (S2 pista L). Nothing here is a remote success claim: a link row exists
// only after the provider returned a receipt (an id), and `uncertain` marks a write whose
// outcome is unknown so it is never repeated blindly.

// One row per (company, provider): which connection is used and who wins a conflict.
export const crmSyncConfigs = pgTable(
  "crm_sync_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    connectionId: uuid("connection_id").references(() => toolConnections.id, { onDelete: "set null" }),
    direction: text("direction").notNull().default("both"),
    // Declared system of record: paperclip | external | manual (conflicts wait for a person).
    primarySystem: text("primary_system").notNull().default("manual"),
    enabled: boolean("enabled").notNull().default(false),
    // Optional overrides of the upstream tool names, keyed by operation.
    toolNames: jsonb("tool_names").$type<Record<string, string>>().notNull().default({}),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProviderUq: uniqueIndex("crm_sync_configs_company_provider_uq").on(table.companyId, table.provider),
    providerCheck: check("crm_sync_configs_provider_check", sql`${table.provider} in ('hubspot', 'pipedrive')`),
    directionCheck: check("crm_sync_configs_direction_check", sql`${table.direction} in ('import', 'export', 'both')`),
    primaryCheck: check("crm_sync_configs_primary_check", sql`${table.primarySystem} in ('paperclip', 'external', 'manual')`),
  }),
);

// Source-id mapping between a local record and its provider record.
export const crmSyncLinks = pgTable(
  "crm_sync_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    entityKind: text("entity_kind").notNull(),
    localId: uuid("local_id").notNull(),
    // Null only while status = 'uncertain' (a create whose outcome is unknown).
    externalId: text("external_id"),
    status: text("status").notNull().default("linked"),
    // Hashes of the canonical fields as of the last confirmed sync; null = never synced.
    localHash: text("local_hash"),
    externalHash: text("external_hash"),
    externalUpdatedAt: text("external_updated_at"),
    // Both snapshots while status = 'conflict'.
    conflict: jsonb("conflict").$type<Record<string, unknown> | null>(),
    // Last provider receipt (id and timestamps only, never credentials).
    receipt: jsonb("receipt").$type<Record<string, unknown> | null>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    localUq: uniqueIndex("crm_sync_links_local_uq").on(table.companyId, table.provider, table.entityKind, table.localId),
    externalUq: uniqueIndex("crm_sync_links_external_uq")
      .on(table.companyId, table.provider, table.entityKind, table.externalId)
      .where(sql`${table.externalId} is not null`),
    statusIdx: index("crm_sync_links_status_idx").on(table.companyId, table.provider, table.status),
    kindCheck: check("crm_sync_links_kind_check", sql`${table.entityKind} in ('customer', 'contact')`),
    statusCheck: check("crm_sync_links_status_check", sql`${table.status} in ('linked', 'conflict', 'uncertain', 'error')`),
  }),
);

export const crmSyncJobs = pgTable(
  "crm_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    direction: text("direction").notNull(),
    // queued -> running -> succeeded | partial | failed | blocked. A running job whose lease
    // expired is picked up again from `cursors`.
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestedByUserId: text("requested_by_user_id"),
    cursors: jsonb("cursors").$type<Record<string, string | null>>().notNull().default({}),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    // Capped list of { entityKind, localId?, externalId?, message, uncertain? } (no secrets).
    errors: jsonb("errors").$type<Array<Record<string, unknown>>>().notNull().default([]),
    blockedReason: text("blocked_reason"),
    attempts: integer("attempts").notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUq: uniqueIndex("crm_sync_jobs_company_idempotency_uq").on(table.companyId, table.idempotencyKey),
    companyProviderIdx: index("crm_sync_jobs_company_provider_idx").on(table.companyId, table.provider, table.createdAt),
    statusIdx: index("crm_sync_jobs_status_idx").on(table.status, table.leaseExpiresAt),
    statusCheck: check("crm_sync_jobs_status_check", sql`${table.status} in ('queued', 'running', 'succeeded', 'partial', 'failed', 'blocked')`),
    directionCheck: check("crm_sync_jobs_direction_check", sql`${table.direction} in ('import', 'export', 'both')`),
  }),
);
