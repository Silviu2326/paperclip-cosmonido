import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

// Public lead forms (pista B). Each row is one form reachable at
// POST /api/p/:companySlug/form/:slug. Not exported from schema/index.ts yet:
// integration adds the export and regenerates the migration.
export const leadForms = pgTable(
  "lead_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    fields: jsonb("fields").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    active: boolean("active").notNull().default(true),
    published: boolean("published").notNull().default(false),
    /** Set only by the package installer; proves which receipt item created this draft. */
    installationItemId: uuid("installation_item_id"),
    installationSourceContentHash: text("installation_source_content_hash"),
    settings: jsonb("settings").$type<{ sourceLabel: string | null; consentText: string | null }>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("lead_forms_company_updated_idx").on(table.companyId, table.updatedAt),
    companySlugUq: uniqueIndex("lead_forms_company_slug_uq").on(table.companyId, table.slug),
    installationItemUq: uniqueIndex("lead_forms_installation_item_uq").on(table.installationItemId).where(sql`${table.installationItemId} IS NOT NULL`),
  }),
);
