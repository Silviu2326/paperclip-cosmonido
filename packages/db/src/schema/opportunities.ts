import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { contacts } from "./contacts.js";
import { customers } from "./customers.js";
import { pipelines, pipelineStages } from "./pipelines.js";

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    primaryContactId: uuid("primary_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    pipelineId: uuid("pipeline_id").references(() => pipelines.id, { onDelete: "set null" }),
    stageId: uuid("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    stageKey: text("stage_key"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    probability: integer("probability"),
    expectedCloseAt: timestamp("expected_close_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    ownerUserId: text("owner_user_id"),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
    source: text("source"),
    status: text("status").notNull().default("open"),
    lostReason: text("lost_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("opportunities_company_updated_idx").on(table.companyId, table.updatedAt),
    companyStatusIdx: index("opportunities_company_status_idx").on(table.companyId, table.status),
    companyCustomerIdx: index("opportunities_company_customer_idx").on(table.companyId, table.customerId),
    companyNextActionIdx: index("opportunities_company_next_action_idx").on(table.companyId, table.nextActionAt),
    statusCheck: check("opportunities_status_check", sql`${table.status} in ('open', 'won', 'lost')`),
    probabilityCheck: check(
      "opportunities_probability_check",
      sql`${table.probability} is null or (${table.probability} >= 0 and ${table.probability} <= 100)`,
    ),
  }),
);
