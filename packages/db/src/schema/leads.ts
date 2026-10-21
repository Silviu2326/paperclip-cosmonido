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

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("new"),
    priority: text("priority"),
    language: text("language"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // Sin FK para evitar ciclo con opportunities; se valida en el servicio.
    opportunityId: uuid("opportunity_id"),
    // Sin FK: la conversación se enlaza desde conversations.lead_id.
    conversationId: uuid("conversation_id"),
    assignedUserId: text("assigned_user_id"),
    assignedAgentId: uuid("assigned_agent_id").references(() => agents.id, { onDelete: "set null" }),
    discardReason: text("discard_reason"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("leads_company_updated_idx").on(table.companyId, table.updatedAt),
    companyStatusIdx: index("leads_company_status_idx").on(table.companyId, table.status),
    companySourceRefUq: uniqueIndex("leads_company_source_source_ref_uq")
      .on(table.companyId, table.source, table.sourceRef)
      .where(sql`${table.sourceRef} is not null`),
    sourceCheck: check(
      "leads_source_check",
      sql`${table.source} in ('form', 'csv', 'email', 'whatsapp', 'messenger', 'instagram', 'telegram', 'webchat', 'voice', 'manual', 'api')`,
    ),
    statusCheck: check(
      "leads_status_check",
      sql`${table.status} in ('new', 'triaged', 'qualified', 'converted', 'discarded')`,
    ),
    priorityCheck: check(
      "leads_priority_check",
      sql`${table.priority} is null or ${table.priority} in ('low', 'normal', 'high')`,
    ),
  }),
);
