import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";
import { companies } from "./companies.js";

/** Commercial Paperclip account. Company ownership is represented only by explicit grants. */
export const productAccounts = pgTable("product_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  planId: text("plan_id").notNull(),
  access: text("access").notNull().default("inactive"),
  /** The durable operator-approved trial window; null means this account has no trial. */
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ accessCheck: check("product_accounts_access_check", sql`${t.access} in ('active','trial_eligible','inactive')`), trialWindowCheck: check("product_accounts_trial_window_check", sql`(${t.trialStartedAt} is null and ${t.trialExpiresAt} is null) or (${t.trialStartedAt} is not null and ${t.trialExpiresAt} > ${t.trialStartedAt})`), trialOwnerUq: uniqueIndex("product_accounts_trial_owner_uidx").on(t.ownerUserId).where(sql`${t.trialStartedAt} is not null`), customerUnique: uniqueIndex("product_accounts_stripe_customer_uidx").on(t.stripeCustomerId), subscriptionUnique: uniqueIndex("product_accounts_stripe_subscription_uidx").on(t.stripeSubscriptionId) }));
export const productAccountMembers = pgTable("product_account_members", {
  id: uuid("id").primaryKey().defaultRandom(), accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }), role: text("role").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uniqueMember: uniqueIndex("product_account_members_account_user_uidx").on(t.accountId, t.userId), roleCheck: check("product_account_members_role_check", sql`${t.role} in ('owner','admin','member')`) }));
export const productAccountCompanyGrants = pgTable("product_account_company_grants", {
  accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), grantedByUserId: text("granted_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({name:"product_account_company_grants_pk",columns:[t.accountId,t.companyId]}), companyUnique: uniqueIndex("product_account_company_grants_company_uidx").on(t.companyId) }));
export const productPlans = pgTable("product_plans", {
  id: text("id").primaryKey(), name: text("name").notNull(), limits: jsonb("limits").notNull(), stripePriceId: text("stripe_price_id"), enabled: integer("enabled").notNull().default(0), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const productUsageMeters = pgTable("product_usage_meters", {
  accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }), metric: text("metric").notNull(), periodKey: text("period_key").notNull(), consumed: numeric("consumed", { precision: 24, scale: 7, mode: "number" }).notNull().default(0), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({name:"product_usage_meters_pk",columns:[t.accountId,t.metric,t.periodKey]}), consumedCheck: check("product_usage_meters_consumed_check", sql`${t.consumed} >= 0`) }));
export const productUsageEvents = pgTable("product_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(), accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }), metric: text("metric").notNull(), periodKey: text("period_key").notNull(), idempotencyKey: text("idempotency_key").notNull(), quantity: numeric("quantity", { precision: 24, scale: 7, mode: "number" }).notNull(), source: text("source").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ idempotency: uniqueIndex("product_usage_events_account_idempotency_uidx").on(t.accountId, t.idempotencyKey) }));
/** Durable account-level notices, emitted only after metered usage is confirmed. */
export const productAccountUsageNotifications = pgTable("product_account_usage_notifications", {
  id: uuid("id").primaryKey().defaultRandom(), accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(), periodKey: text("period_key").notNull(), threshold: integer("threshold").notNull(),
  consumed: numeric("consumed", { precision: 24, scale: 7, mode: "number" }).notNull(), limit: numeric("limit", { precision: 24, scale: 7, mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  thresholdCheck: check("product_account_usage_notifications_threshold_check", sql`${t.threshold} in (80, 100)`),
  dedupe: uniqueIndex("product_account_usage_notifications_dedupe_uidx").on(t.accountId, t.metric, t.periodKey, t.threshold),
  recent: index("product_account_usage_notifications_recent_idx").on(t.accountId, t.createdAt),
}));
export const productBillingEvents = pgTable("product_billing_events", {
  eventId: text("event_id").primaryKey(), eventType: text("event_type").notNull(), processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
export const productAccountAuditEvents = pgTable("product_account_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(), accountId: uuid("account_id").references(() => productAccounts.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull(), actorType: text("actor_type").notNull().default("user"), action: text("action").notNull(),
  entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Admission reservation serializes concurrent limit checks and survives process interruption. */
export const productUsageReservations = pgTable("product_usage_reservations", {
  id: uuid("id").primaryKey().defaultRandom(), accountId: uuid("account_id").notNull().references(() => productAccounts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }), metric: text("metric").notNull(),
  periodKey: text("period_key").notNull(), idempotencyKey: text("idempotency_key").notNull(), requestFingerprint: text("request_fingerprint").notNull(), quantity: numeric("quantity", { precision: 24, scale: 7, mode: "number" }).notNull(),
  state: text("state").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ idempotency: uniqueIndex("product_usage_reservations_account_key_uidx").on(t.accountId, t.idempotencyKey), stateCheck: check("product_usage_reservations_state_check", sql`${t.state} in ('reserved','committed','uncertain','released')`), quantityCheck: check("product_usage_reservations_quantity_check", sql`${t.quantity} > 0`) }));




