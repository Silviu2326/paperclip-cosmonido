import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { OfficeLayout } from "@paperclipai/shared";
import { companies } from "./companies.js";

/** Per-user pixel-art office layout for one company (doc/plans/2026-10-21-oficina-pixel-art.md, contract 3). */
export const officeLayouts = pgTable("office_layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  layout: jsonb("layout").$type<OfficeLayout>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyUserUq: uniqueIndex("office_layouts_company_user_uq").on(table.companyId, table.userId),
}));
