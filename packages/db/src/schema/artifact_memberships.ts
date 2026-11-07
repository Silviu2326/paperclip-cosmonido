import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Per-user favorites for Salida artifacts that are not documents (attachments and work products).
 * artifact_ref is "<source>:<id>" where source is "attachment" or "work_product".
 * Documents keep using document_memberships.
 */
export const artifactMemberships = pgTable(
  "artifact_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    artifactRef: text("artifact_ref").notNull(),
    userId: text("user_id").notNull(),
    starredAt: timestamp("starred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserStarredIdx: index("artifact_memberships_company_user_starred_idx").on(
      table.companyId,
      table.userId,
      table.starredAt,
    ),
    companyUserRefUq: uniqueIndex("artifact_memberships_company_user_ref_uq").on(
      table.companyId,
      table.userId,
      table.artifactRef,
    ),
  }),
);
