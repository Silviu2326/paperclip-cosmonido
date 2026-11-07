import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agentWakeupRequests } from "./agent_wakeup_requests.js";
import { companies } from "./companies.js";
import { conversationMessages, conversations } from "./conversations.js";
import { issues } from "./issues.js";

/** Explicit per-company opt-in and accountable identity for automatic web-chat task dispatch. */
export const conversationAgentDispatchSettings = pgTable("conversation_agent_dispatch_settings", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  agentId: uuid("agent_id").notNull(),
  responsibleUserId: text("responsible_user_id").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Durable, idempotent outbox. The source message and exact authorized principal are pinned at enqueue. */
export const conversationAgentDispatches = pgTable("conversation_agent_dispatches", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  sourceMessageId: uuid("source_message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull(),
  responsibleUserId: text("responsible_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  leaseOwner: text("lease_owner"),
  leaseToken: uuid("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  wakeupRequestId: uuid("wakeup_request_id").references(() => agentWakeupRequests.id, { onDelete: "set null" }),
  language: text("language"),
  languageSource: text("language_source"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceUq: uniqueIndex("conversation_agent_dispatches_company_source_uq").on(table.companyId, table.sourceMessageId),
  pendingIdx: index("conversation_agent_dispatches_pending_idx").on(table.status, table.nextAttemptAt, table.leaseExpiresAt, table.createdAt),
  conversationIdx: index("conversation_agent_dispatches_conversation_idx").on(table.companyId, table.conversationId, table.createdAt),
  statusCheck: check("conversation_agent_dispatches_status_check", sql`${table.status} in ('pending', 'leased', 'wake_queued', 'skipped', 'failed')`),
  attemptsCheck: check("conversation_agent_dispatches_attempts_check", sql`${table.attempts} >= 0`),
  languageSourceCheck: check("conversation_agent_dispatches_language_source_check", sql`${table.languageSource} is null or ${table.languageSource} in ('contact', 'conversation')`),
  leaseCheck: check("conversation_agent_dispatches_lease_check", sql`(${table.status} = 'leased' and ${table.leaseOwner} is not null and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'leased')`),
}));
