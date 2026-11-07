import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { contacts } from "./contacts.js";
import { customers } from "./customers.js";
import { leads } from "./leads.js";
import { opportunities } from "./opportunities.js";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    externalThreadId: text("external_thread_id"),
    subject: text("subject"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    assignedUserId: text("assigned_user_id"),
    assignedAgentId: uuid("assigned_agent_id").references(() => agents.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    language: text("language"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("conversations_company_updated_idx").on(table.companyId, table.updatedAt),
    companyStatusLastIdx: index("conversations_company_status_last_idx").on(
      table.companyId,
      table.status,
      table.lastMessageAt,
    ),
    companyContactIdx: index("conversations_company_contact_idx").on(table.companyId, table.contactId),
    companyChannelThreadUq: uniqueIndex("conversations_company_channel_thread_uq")
      .on(table.companyId, table.channel, table.externalThreadId)
      .where(sql`${table.externalThreadId} is not null`),
    channelCheck: check(
      "conversations_channel_check",
      sql`${table.channel} in ('email', 'whatsapp', 'messenger', 'instagram', 'telegram', 'webchat', 'voice', 'sms')`,
    ),
    statusCheck: check(
      "conversations_status_check",
      sql`${table.status} in ('open', 'waiting_us', 'waiting_them', 'closed')`,
    ),
  }),
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: text("actor_user_id"),
    actorAgentId: uuid("actor_agent_id").references(() => agents.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<Record<string, unknown>[]>().notNull().default([]),
    language: text("language"),
    deliveryStatus: text("delivery_status").notNull().default("draft"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    providerReceipt: jsonb("provider_receipt").$type<Record<string, unknown>>(),
    // Sin FK: se enlaza a external_actions por servicio.
    externalActionId: uuid("external_action_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("conversation_messages_company_updated_idx").on(table.companyId, table.updatedAt),
    conversationCreatedIdx: index("conversation_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    companyProviderMessageUq: uniqueIndex("conversation_messages_company_provider_message_uq")
      .on(table.companyId, table.provider, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    directionCheck: check(
      "conversation_messages_direction_check",
      sql`${table.direction} in ('inbound', 'outbound')`,
    ),
    actorKindCheck: check(
      "conversation_messages_actor_kind_check",
      sql`${table.actorKind} in ('contact', 'user', 'agent', 'system')`,
    ),
    deliveryStatusCheck: check(
      "conversation_messages_delivery_status_check",
      sql`${table.deliveryStatus} in ('draft', 'queued', 'sent', 'delivered', 'read', 'failed', 'uncertain')`,
    ),
  }),
);
