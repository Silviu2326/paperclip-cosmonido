import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

// Web chat settings per company (pista F). One row per company.
// Not exported from schema/index.ts and no migration yet: the integrator adds
// `export * from "./webchat_settings.js"` and runs `pnpm db:generate`.
// The web chat service reads and writes this table with raw SQL until then.
export const webchatSettings = pgTable(
  "webchat_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(false),
    greeting: text("greeting"),
    brandColor: text("brand_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUq: uniqueIndex("webchat_settings_company_uq").on(table.companyId),
  }),
);
