import { date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AutonomyBenchFailure } from "@paperclipai/shared";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

/**
 * Sprint 3 WP3: granted autonomy level per company, optional agent and action type.
 * Rows are historical: a change writes a new row and revokes the previous one; nothing is overwritten.
 */
export const autonomyPolicies = pgTable(
  "autonomy_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    level: text("level").notNull(),
    grantedByUserId: text("granted_by_user_id"),
    grantedByAgentId: uuid("granted_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    benchRunId: uuid("bench_run_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id"),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentActionIdx: index("autonomy_policies_company_agent_action_idx").on(table.companyId, table.agentId, table.actionType, table.grantedAt),
    companyActiveIdx: index("autonomy_policies_company_active_idx").on(table.companyId, table.revokedAt),
  }),
);

/** Shadow-mode statistics per agent, action type and day. Aggregated, never overwritten per event. */
export const autonomyShadowStats = pgTable(
  "autonomy_shadow_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    periodStart: date("period_start").notNull(),
    drafts: integer("drafts").notNull().default(0),
    sentUnchanged: integer("sent_unchanged").notNull().default(0),
    edited: integer("edited").notNull().default(0),
    rejected: integer("rejected").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    periodUq: uniqueIndex("autonomy_shadow_stats_period_uq").on(table.companyId, table.agentId, table.actionType, table.periodStart),
  }),
);

/** Sprint 3 WP4: one replay bench over closed conversations or fixtures for an agent and action type. */
export const autonomyBenchRuns = pgTable(
  "autonomy_bench_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    sampleSize: integer("sample_size").notNull(),
    casesEvaluated: integer("cases_evaluated").notNull().default(0),
    status: text("status").notNull().default("running"),
    score: numeric("score", { precision: 6, scale: 3, mode: "number" }),
    threshold: numeric("threshold", { precision: 6, scale: 3, mode: "number" }),
    failures: jsonb("failures").$type<AutonomyBenchFailure[]>().notNull().default([]),
    costCents: numeric("cost_cents", { precision: 24, scale: 7, mode: "number" }).notNull().default(0),
    judgeModel: text("judge_model"),
    error: text("error"),
    createdByUserId: text("created_by_user_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentActionIdx: index("autonomy_bench_runs_company_agent_action_idx").on(table.companyId, table.agentId, table.actionType, table.createdAt),
    companyStatusIdx: index("autonomy_bench_runs_company_status_idx").on(table.companyId, table.status),
  }),
);
