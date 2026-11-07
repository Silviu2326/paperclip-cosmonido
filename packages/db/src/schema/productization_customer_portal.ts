import { bigint, boolean, check, index, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assets } from "./assets.js";
import { companies } from "./companies.js";
import { customers } from "./customers.js";
import { contacts } from "./contacts.js";

export const customerPortals = pgTable("customer_portals", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  resourceKinds: jsonb("resource_kinds").$type<string[]>().notNull().default(["deliverables", "proposals", "meetings", "conversations", "commitments"]),
  allowDeliverableFeedback: boolean("allow_deliverable_feedback").notNull().default(false),
  allowFileUploads: boolean("allow_file_uploads").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUq: uniqueIndex("customer_portals_token_hash_uq").on(table.tokenHash),
  companyCustomerIdx: index("customer_portals_company_customer_idx").on(table.companyId, table.customerId, table.createdAt),
}));

export const customerPortalFeedback = pgTable("customer_portal_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  portalId: uuid("portal_id").notNull().references(() => customerPortals.id, { onDelete: "cascade" }),
  targetKind: text("target_kind").notNull().default("work_product"),
  targetId: uuid("target_id").notNull(),
  targetVersion: text("target_version").notNull(),
  decision: text("decision").notNull(),
  comment: text("comment").notNull(),
  actorKind: text("actor_kind").notNull().default("portal_token_holder"),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  portalKeyUq: uniqueIndex("customer_portal_feedback_portal_key_uq").on(table.portalId, table.idempotencyKey),
  companyCustomerIdx: index("customer_portal_feedback_customer_idx").on(table.companyId, table.customerId, table.createdAt),
  portalIdx: index("customer_portal_feedback_portal_idx").on(table.portalId, table.createdAt),
  decisionCheck: check("customer_portal_feedback_decision_check", sql`${table.decision} in ('accept', 'changes_requested')`),
  kindCheck: check("customer_portal_feedback_kind_check", sql`${table.targetKind} = 'work_product' and ${table.actorKind} = 'portal_token_holder'`),
}));

/**
 * Customer-scoped files. `inbound` rows are uploaded through a portal link and
 * `outbound` rows are shared by the board. The row (not the asset) is the
 * authorization record: the asset is only reachable through the exact
 * portal/customer/contact scope stored here.
 */
export const customerPortalFiles = pgTable("customer_portal_files", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  portalId: uuid("portal_id").references(() => customerPortals.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  state: text("state").notNull().default("pending"),
  visibleToCustomer: boolean("visible_to_customer").notNull().default(true),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  objectKey: text("object_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  idempotencyKey: uuid("idempotency_key"),
  createdByUserId: text("created_by_user_id"),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  storedAt: timestamp("stored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  portalKeyUq: uniqueIndex("customer_portal_files_portal_key_uq").on(table.portalId, table.idempotencyKey),
  objectKeyUq: uniqueIndex("customer_portal_files_object_key_uq").on(table.companyId, table.objectKey),
  customerIdx: index("customer_portal_files_customer_idx").on(table.companyId, table.customerId, table.createdAt),
  pendingIdx: index("customer_portal_files_portal_state_idx").on(table.portalId, table.state),
  directionCheck: check("customer_portal_files_direction_check", sql`${table.direction} in ('inbound', 'outbound')`),
  stateCheck: check("customer_portal_files_state_check", sql`${table.state} in ('pending', 'stored', 'rejected', 'abandoned')`),
  inboundCheck: check("customer_portal_files_inbound_check", sql`${table.direction} <> 'inbound' or (${table.portalId} is not null and ${table.idempotencyKey} is not null)`),
  sizeCheck: check("customer_portal_files_size_check", sql`${table.byteSize} > 0`),
}));
