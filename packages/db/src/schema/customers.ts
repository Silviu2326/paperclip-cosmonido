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
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("organization"),
    name: text("name").notNull(),
    domain: text("domain"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    legalName: text("legal_name"),
    taxId: text("tax_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    ownerUserId: text("owner_user_id"),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    health: text("health"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("customers_company_updated_idx").on(table.companyId, table.updatedAt),
    companyStatusIdx: index("customers_company_status_idx").on(table.companyId, table.status),
    companyDomainIdx: index("customers_company_domain_idx").on(table.companyId, table.domain),
    nameSearchIdx: index("customers_name_search_idx").using("gin", table.name.op("gin_trgm_ops")),
    kindCheck: check("customers_kind_check", sql`${table.kind} in ('person', 'organization')`),
    statusCheck: check("customers_status_check", sql`${table.status} in ('active', 'archived')`),
    healthCheck: check(
      "customers_health_check",
      sql`${table.health} is null or ${table.health} in ('good', 'watch', 'risk')`,
    ),
  }),
);
