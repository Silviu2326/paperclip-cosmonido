import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { MediaOperation } from "@paperclipai/shared";
import type { MediaPresetBrandReferences, MediaPresetInputCriteria, MediaTemplateKind } from "@paperclipai/shared/productization/media-presets";
import { companies } from "./companies.js";

export const productizationMediaPresets = pgTable("productization_media_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  presetKey: text("preset_key").notNull(),
  version: integer("version").notNull(),
  kind: text("kind").$type<MediaTemplateKind>().notNull(),
  outputAspect: text("output_aspect").$type<"9:16" | "16:9">().notNull().default("9:16"),
  name: text("name").notNull(),
  description: text("description"),
  inputCriteria: jsonb("input_criteria").$type<MediaPresetInputCriteria>().notNull(),
  operations: jsonb("operations").$type<MediaOperation[]>().notNull(),
  brandReferences: jsonb("brand_references").$type<MediaPresetBrandReferences>().notNull().default({}),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyKeyVersionUq: uniqueIndex("productization_media_presets_company_key_version_uq").on(table.companyId, table.presetKey, table.version),
  companyKindIdx: index("productization_media_presets_company_kind_idx").on(table.companyId, table.kind, table.createdAt),
  kindCheck: check("productization_media_presets_kind_check", sql`${table.kind} in ('clip', 'demo', 'testimonial', 'tutorial', 'advert')`),
  aspectCheck: check("productization_media_presets_aspect_check", sql`${table.outputAspect} in ('9:16', '16:9')`),
}));
