import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { decisions } from "./decisions.js";

/**
 * Sprint 3 WP5: signed one-time tokens that let a decision be resolved from an email link or a chat message.
 * Only the hash is stored; a token resolves exactly one decision and expires.
 */
export const decisionRemoteTokens = pgTable(
  "decision_remote_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    channel: text("channel").notNull().default("email"),
    recipientUserId: text("recipient_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedOptionId: text("used_option_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUq: uniqueIndex("decision_remote_tokens_hash_uq").on(table.tokenHash),
    decisionIdx: index("decision_remote_tokens_decision_idx").on(table.decisionId),
    companyExpiresIdx: index("decision_remote_tokens_company_expires_idx").on(table.companyId, table.expiresAt),
  }),
);
