import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { projects } from "./projects.js";

/** Sprint 3 WP9: idempotent receipt of a sale → delivery handoff. `partial` receipts are resumed, never duplicated. */
export const handoffReceipts = pgTable(
  "handoff_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    customerId: uuid("customer_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    assignmentGoalId: uuid("assignment_goal_id").references(() => goals.id, { onDelete: "set null" }),
    teamCatalogKey: text("team_catalog_key"),
    status: text("status").notNull().default("partial"),
    stepsDone: jsonb("steps_done").$type<string[]>().notNull().default([]),
    error: text("error"),
    createdByAgentId: uuid("created_by_agent_id"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companySourceUq: uniqueIndex("handoff_receipts_company_source_uq").on(table.companyId, table.sourceKind, table.sourceId),
    companyStatusIdx: index("handoff_receipts_company_status_idx").on(table.companyId, table.status),
  }),
);
