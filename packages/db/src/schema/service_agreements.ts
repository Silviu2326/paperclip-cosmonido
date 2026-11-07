import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ServiceAgreementDeliverable } from "@paperclipai/shared";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { proposals } from "./proposals.js";

/** Sprint 3 WP10: recurring service agreement. `customer_id` has no foreign key yet (Sprint 2 table). */
export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id"),
    proposalId: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    periodKind: text("period_kind").notNull().default("monthly"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    deliverablesPerPeriod: jsonb("deliverables_per_period").$type<ServiceAgreementDeliverable[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    autoRenew: boolean("auto_renew").notNull().default(true),
    noticeDays: integer("notice_days").notNull().default(30),
    assigneeAgentId: uuid("assignee_agent_id"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("service_agreements_company_status_idx").on(table.companyId, table.status, table.endsAt),
    companyCustomerIdx: index("service_agreements_company_customer_idx").on(table.companyId, table.customerId),
  }),
);

/** One billing/delivery period of an agreement. Exactly one assignment is created per period. */
export const agreementPeriods = pgTable(
  "agreement_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agreementId: uuid("agreement_id").notNull().references(() => serviceAgreements.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    assignmentGoalId: uuid("assignment_goal_id").references(() => goals.id, { onDelete: "set null" }),
    renewalProposalId: uuid("renewal_proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    renewalDecisionId: uuid("renewal_decision_id"),
    // A scheduler-created assignment is the durable handoff to an authorized agent run.
    renewalTaskId: uuid("renewal_task_id").references(() => goals.id, { onDelete: "set null" }),
    status: text("status").notNull().default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agreementPeriodUq: uniqueIndex("agreement_periods_agreement_start_uq").on(table.agreementId, table.periodStart),
    companyStatusIdx: index("agreement_periods_company_status_idx").on(table.companyId, table.status, table.periodEnd),
  }),
);
