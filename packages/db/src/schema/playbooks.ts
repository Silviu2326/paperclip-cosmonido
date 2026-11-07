import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PlaybookStep } from "@paperclipai/shared";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { routines } from "./routines.js";

/** Sprint 3 WP1: versioned commercial sequence. A published version is immutable; editing creates a new draft row. */
export const playbooks = pgTable(
  "playbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    scopeKind: text("scope_kind").notNull().default("lead_type"),
    scopeValue: text("scope_value"),
    steps: jsonb("steps").$type<PlaybookStep[]>().notNull().default([]),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    /** Set only by the package installer; proves which receipt item created this draft. */
    installationItemId: uuid("installation_item_id"),
    installationSourceContentHash: text("installation_source_content_hash"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyVersionUq: uniqueIndex("playbooks_company_key_version_uq").on(table.companyId, table.key, table.version),
    installationItemUq: uniqueIndex("playbooks_installation_item_uq").on(table.installationItemId).where(sql`${table.installationItemId} IS NOT NULL`),
    companyStatusIdx: index("playbooks_company_status_idx").on(table.companyId, table.status),
    companyScopeIdx: index("playbooks_company_scope_idx").on(table.companyId, table.scopeKind, table.scopeValue),
  }),
);

/** One execution of a playbook version over a polymorphic commercial subject (lead, opportunity, conversation, customer). */
export const playbookRuns = pgTable(
  "playbook_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    playbookId: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "restrict" }),
    playbookVersion: integer("playbook_version").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    status: text("status").notNull().default("running"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lastActionAt: timestamp("last_action_at", { withTimezone: true }),
    lastRoutineId: uuid("last_routine_id").references(() => routines.id, { onDelete: "set null" }),
    lastRunId: uuid("last_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    attempts: jsonb("attempts").$type<Record<string, number>>().notNull().default({}),
    idempotencyKey: text("idempotency_key"),
    failureReason: text("failure_reason"),
    startedByAgentId: uuid("started_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    startedByUserId: text("started_by_user_id"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companySubjectIdx: index("playbook_runs_company_subject_idx").on(table.companyId, table.subjectKind, table.subjectId),
    nextActionIdx: index("playbook_runs_next_action_idx").on(table.nextActionAt),
    companyStatusIdx: index("playbook_runs_company_status_idx").on(table.companyId, table.status),
    companyIdempotencyUq: uniqueIndex("playbook_runs_company_idempotency_uq")
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);
