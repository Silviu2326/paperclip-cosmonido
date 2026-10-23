import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { contacts } from "./contacts.js";
import { customers } from "./customers.js";
import { deliverableReviews } from "./deliverable_reviews.js";
import { issues } from "./issues.js";
import { projects } from "./projects.js";

// External review links (S2 pista I). A link pins ONE deliverable at ONE version
// (`target_version` = the work product's updated_at, ISO). The secret is never stored:
// it is a signed token derived from (company, link id, token_issued_at, expires_at), so
// revocation and approval state live here and the token can be shown to a board user again.
export const reviewLinks = pgTable(
  "review_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    targetKind: text("target_kind").notNull().default("work_product"),
    targetId: uuid("target_id").notNull(),
    targetVersion: text("target_version").notNull(),
    targetTitle: text("target_title").notNull(),
    deliverableReviewId: uuid("deliverable_review_id").references(() => deliverableReviews.id, { onDelete: "set null" }),
    // pending_approval -> active -> revoked, or pending_approval -> rejected.
    status: text("status").notNull().default("pending_approval"),
    // The customer's answer for this version. Never resolves the internal deliverable review.
    decision: text("decision").notNull().default("open"),
    // Compare-and-set counter: every decision bumps it.
    revision: integer("revision").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull(),
    // Links to external_actions / approvals without FK, like the gate does.
    externalActionId: uuid("external_action_id"),
    approvalId: uuid("approval_id"),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByRunId: uuid("created_by_run_id"),
    tokenIssuedAt: timestamp("token_issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUq: uniqueIndex("review_links_company_idempotency_uq").on(table.companyId, table.idempotencyKey),
    targetIdx: index("review_links_company_target_idx").on(table.companyId, table.targetKind, table.targetId),
    customerIdx: index("review_links_company_customer_idx").on(table.companyId, table.customerId, table.createdAt),
    kindCheck: check("review_links_target_kind_check", sql`${table.targetKind} = 'work_product'`),
    statusCheck: check("review_links_status_check", sql`${table.status} in ('pending_approval', 'active', 'revoked', 'rejected')`),
    decisionCheck: check("review_links_decision_check", sql`${table.decision} in ('open', 'accepted', 'changes_requested')`),
  }),
);

export const reviewLinkEvents = pgTable(
  "review_link_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").notNull().references(() => reviewLinks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    body: text("body").notNull().default(""),
    // Free text typed by the visitor; never verified identity.
    authorLabel: text("author_label"),
    targetVersion: text("target_version").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    revisionAfter: integer("revision_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    linkKeyUq: uniqueIndex("review_link_events_link_key_uq").on(table.linkId, table.idempotencyKey),
    linkIdx: index("review_link_events_link_idx").on(table.linkId, table.createdAt),
    kindCheck: check("review_link_events_kind_check", sql`${table.kind} in ('comment', 'accept', 'request_changes')`),
  }),
);
