import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ProposalAcceptanceEvidence, ProposalScopeItem } from "@paperclipai/shared";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { documents } from "./documents.js";

/**
 * Sprint 3 WP8: commercial proposal. Revisions of the same proposal share `proposal_key`;
 * a `sent` revision is immutable and any change creates a row with `revision + 1`.
 * `opportunity_id` and `customer_id` have no foreign key yet: those tables belong to Sprint 2.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    proposalKey: text("proposal_key").notNull(),
    revision: integer("revision").notNull().default(1),
    opportunityId: uuid("opportunity_id"),
    customerId: uuid("customer_id"),
    title: text("title").notNull(),
    scope: jsonb("scope").$type<ProposalScopeItem[]>().notNull().default([]),
    terms: text("terms"),
    priceCents: integer("price_cents").notNull().default(0),
    depositCents: integer("deposit_cents"),
    currency: text("currency").notNull().default("EUR"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    status: text("status").notNull().default("draft"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    publicToken: text("public_token"),
    acceptanceEvidence: jsonb("acceptance_evidence").$type<ProposalAcceptanceEvidence>(),
    stripePaymentLinkId: text("stripe_payment_link_id"),
    stripePaymentLinkUrl: text("stripe_payment_link_url"),
    paymentStatus: text("payment_status").notNull().default("none"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyRevisionUq: uniqueIndex("proposals_company_key_revision_uq").on(table.companyId, table.proposalKey, table.revision),
    publicTokenUq: uniqueIndex("proposals_public_token_uq").on(table.publicToken),
    companyOpportunityIdx: index("proposals_company_opportunity_idx").on(table.companyId, table.opportunityId),
    companyStatusIdx: index("proposals_company_status_idx").on(table.companyId, table.status, table.updatedAt),
  }),
);
