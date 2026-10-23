import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { BusinessWebhookEventName, PublicApiScope } from "@paperclipai/shared/productization/public-api";
import { authUsers } from "./auth.js";
import { boardApiKeys } from "./board_api_keys.js";
import { companies } from "./companies.js";

/** A normal board key becomes a v1-only key once this row exists. */
export const productPublicApiKeys = pgTable("product_public_api_keys", {
  boardApiKeyId: uuid("board_api_key_id").primaryKey().references(() => boardApiKeys.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  scopes: jsonb("scopes").$type<PublicApiScope[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("product_public_api_keys_company_idx").on(t.companyId)]);

export const businessWebhookSubscriptions = pgTable("business_webhook_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  url: text("url").notNull(), events: jsonb("events").$type<BusinessWebhookEventName[]>().notNull(),
  secretMaterial: text("secret_material").notNull(), status: text("status").notNull().default("active"),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }), lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("business_webhook_subscriptions_company_idx").on(t.companyId), check("business_webhook_subscriptions_status_check", sql`${t.status} in ('active','blocked','revoked')`)]);

/** Inserted alongside the source activity by the activity-log integration. */
export const businessWebhookOutbox = pgTable("business_webhook_outbox", {
  eventId: uuid("event_id").primaryKey(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  data: jsonb("data").$type<{ companyId:string; entityId:string }>().notNull(), fannedOutAt: timestamp("fanned_out_at", { withTimezone: true }),
}, (t) => [index("business_webhook_outbox_fanout_idx").on(t.fannedOutAt, t.occurredAt), check("business_webhook_outbox_event_check", sql`${t.eventType} in ('lead.created','proposal.accepted','deliverable.accepted','conversation.created')`)]);

export const businessWebhookDeliveries = pgTable("business_webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(), eventId: uuid("event_id").notNull().references(() => businessWebhookOutbox.eventId, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => businessWebhookSubscriptions.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }), deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastHttpStatus: integer("last_http_status"), lastError: text("last_error"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("business_webhook_deliveries_event_subscription_uq").on(t.eventId,t.subscriptionId), index("business_webhook_deliveries_due_idx").on(t.status,t.nextAttemptAt,t.lockedUntil), check("business_webhook_deliveries_status_check", sql`${t.status} in ('pending','delivering','delivered','blocked')`)]);
