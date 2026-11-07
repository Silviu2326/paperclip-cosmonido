import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companyFiles } from "./company_files.js";

/** Per-user favorites for Entrada (company files). Documents use document_memberships. */
export const companyFileMemberships = pgTable(
  "company_file_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    companyFileId: uuid("company_file_id").notNull().references(() => companyFiles.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    starredAt: timestamp("starred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserStarredIdx: index("company_file_memberships_company_user_starred_idx").on(
      table.companyId,
      table.userId,
      table.starredAt,
    ),
    companyUserFileUq: uniqueIndex("company_file_memberships_company_user_file_uq").on(
      table.companyId,
      table.userId,
      table.companyFileId,
    ),
  }),
);
