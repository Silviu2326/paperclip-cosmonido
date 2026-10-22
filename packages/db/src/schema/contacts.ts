import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { customers } from "./customers.js";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email"),
    primaryPhone: text("primary_phone"),
    title: text("title"),
    language: text("language"),
    preferredChannel: text("preferred_channel"),
    consents: jsonb("consents")
      .$type<{ email?: boolean; whatsapp?: boolean; sms?: boolean; updatedAt?: string }>()
      .notNull()
      .default({}),
    status: text("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("contacts_company_updated_idx").on(table.companyId, table.updatedAt),
    companyEmailIdx: index("contacts_company_email_idx").on(table.companyId, table.primaryEmail),
    companyPhoneIdx: index("contacts_company_phone_idx").on(table.companyId, table.primaryPhone),
    statusCheck: check("contacts_status_check", sql`${table.status} in ('active', 'archived')`),
  }),
);

export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerContactUq: uniqueIndex("customer_contacts_customer_contact_uq").on(table.customerId, table.contactId),
    companyUpdatedIdx: index("customer_contacts_company_updated_idx").on(table.companyId, table.updatedAt),
    contactIdx: index("customer_contacts_contact_idx").on(table.contactId),
  }),
);

export const contactIdentities = pgTable(
  "contact_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    identifier: text("identifier").notNull(),
    verified: boolean("verified").notNull().default(false),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyChannelIdentifierUq: uniqueIndex("contact_identities_company_channel_identifier_uq").on(
      table.companyId,
      table.channel,
      table.identifier,
    ),
    companyUpdatedIdx: index("contact_identities_company_updated_idx").on(table.companyId, table.updatedAt),
    contactIdx: index("contact_identities_contact_idx").on(table.contactId),
    channelCheck: check(
      "contact_identities_channel_check",
      sql`${table.channel} in ('email', 'phone', 'whatsapp', 'messenger', 'instagram', 'telegram', 'webchat')`,
    ),
  }),
);
