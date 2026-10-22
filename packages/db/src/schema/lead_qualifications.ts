import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { LeadQualificationReason, LeadQualificationSource } from "@paperclipai/shared";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { leads } from "./leads.js";

/**
 * Sprint 3 WP2: result of qualifying a lead against the company criteria.
 * `lead_id` references `leads` (Sprint 2); deleting a lead removes its qualifications.
 */
export const leadQualifications = pgTable(
  "lead_qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    criteriaVersion: text("criteria_version").notNull(),
    score: integer("score").notNull(),
    reasons: jsonb("reasons").$type<LeadQualificationReason[]>().notNull().default([]),
    sources: jsonb("sources").$type<LeadQualificationSource[]>().notNull().default([]),
    enrichment: jsonb("enrichment").$type<Record<string, unknown>>(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyLeadCreatedIdx: index("lead_qualifications_company_lead_created_idx").on(table.companyId, table.leadId, table.createdAt),
  }),
);
