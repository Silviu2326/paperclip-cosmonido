import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
export const deliverableReviews = pgTable("deliverable_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  targetKind: text("target_kind").notNull(), targetId: uuid("target_id").notNull(), targetVersion: text("target_version").notNull(),
  state: text("state").notNull().default("pending"),
  reviewerUserId: text("reviewer_user_id"), reviewerAgentId: uuid("reviewer_agent_id").references(() => agents.id, { onDelete: "set null" }),
  reason: text("reason"), evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  targetIdx: index("deliverable_reviews_company_target_idx").on(table.companyId, table.targetKind, table.targetId),
  goalStateIdx: index("deliverable_reviews_company_goal_state_idx").on(table.companyId, table.goalId, table.state),
  pendingUniqueIdx: uniqueIndex("deliverable_reviews_pending_version_uq").on(table.companyId, table.targetKind, table.targetId, table.targetVersion).where(sql`${table.state} = 'pending'`),
  targetKindCheck: check("deliverable_reviews_target_kind_check", sql`${table.targetKind} in ('work_product', 'company_file_version', 'document_revision')`),
  stateCheck: check("deliverable_reviews_state_check", sql`${table.state} in ('pending', 'accepted', 'changes_requested')`),
}));
