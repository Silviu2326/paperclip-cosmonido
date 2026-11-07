import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { activityLog } from "./activity_log.js";

/** Per-board-user, per-company product notification scope; no device secrets or push endpoints are stored. */
export const productNotificationPreferences = pgTable("product_notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull().default(["decisions", "reviews", "tasks"]),
  browserEnabled: boolean("browser_enabled").notNull().default(false),
  remotePushEnabled: boolean("remote_push_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyUserUq: uniqueIndex("product_notification_preferences_company_user_uq").on(table.companyId, table.userId),
  companyIdx: index("product_notification_preferences_company_idx").on(table.companyId),
  categoryScopeCheck: check("product_notification_preferences_category_scope_check", sql`${table.categories} <@ '["decisions", "reviews", "tasks"]'::jsonb`),
}));

/** Push endpoint and encryption keys are kept only inside instance-encrypted material. */
export const productNotificationSubscriptions = pgTable("product_notification_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  endpointHash: text("endpoint_hash").notNull(),
  endpointHost: text("endpoint_host").notNull(),
  encryptedMaterial: text("encrypted_material").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  endpointOwnerUq: uniqueIndex("product_notification_subscriptions_owner_endpoint_uq").on(table.companyId, table.userId, table.endpointHash),
  activeCompanyIdx: index("product_notification_subscriptions_active_company_idx").on(table.companyId, table.status),
  userIdx: index("product_notification_subscriptions_user_idx").on(table.userId, table.status),
  statusCheck: check("product_notification_subscriptions_status_check", sql`${table.status} in ('active', 'revoked', 'expired')`),
}));

/** Durable, idempotent signal emitted after the canonical activity row commits. */
export const productNotificationSignals = pgTable("product_notification_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  activityId: uuid("activity_id").notNull().references(() => activityLog.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  activityUq: uniqueIndex("product_notification_signals_activity_uq").on(table.companyId, table.activityId),
  queueIdx: index("product_notification_signals_queue_idx").on(table.status, table.nextAttemptAt),
  statusCheck: check("product_notification_signals_status_check", sql`${table.status} in ('pending', 'processing', 'processed', 'dead')`),
}));

/** One row per subscription/source revision; sending is always outside a DB transaction. */
export const productNotificationOutbox = pgTable("product_notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull().references(() => productNotificationSubscriptions.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  revision: text("revision").notNull(),
  href: text("href").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastStatusCode: integer("last_status_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  dedupeUq: uniqueIndex("product_notification_outbox_source_revision_uq").on(table.subscriptionId, table.sourceType, table.sourceId, table.revision),
  queueIdx: index("product_notification_outbox_queue_idx").on(table.status, table.nextAttemptAt),
  companyUserIdx: index("product_notification_outbox_company_user_idx").on(table.companyId, table.userId, table.createdAt),
  categoryCheck: check("product_notification_outbox_category_check", sql`${table.category} in ('decisions', 'reviews', 'tasks')`),
  statusCheck: check("product_notification_outbox_status_check", sql`${table.status} in ('pending', 'sending', 'sent', 'dead', 'expired')`),
}));
