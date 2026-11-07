import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { contacts } from "./contacts.js";
import { customers } from "./customers.js";
import { opportunities } from "./opportunities.js";

export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    who: text("who").notNull(),
    what: text("what").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    source: text("source").notNull().default("manual"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    // Sin FK: la conversación se valida en el servicio de conversaciones.
    conversationId: uuid("conversation_id"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("commitments_company_updated_idx").on(table.companyId, table.updatedAt),
    companyStatusDueIdx: index("commitments_company_status_due_idx").on(table.companyId, table.status, table.dueAt),
    whoCheck: check("commitments_who_check", sql`${table.who} in ('us', 'them')`),
    statusCheck: check(
      "commitments_status_check",
      sql`${table.status} in ('proposed', 'open', 'kept', 'missed', 'cancelled')`,
    ),
    sourceCheck: check("commitments_source_check", sql`${table.source} in ('manual', 'detected')`),
  }),
);
