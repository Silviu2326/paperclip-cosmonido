import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ContactImportReceipt } from "@paperclipai/shared/productization/contact-import";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

/** Receipts store results and hashes, never the source CSV or inferred consent. */
export const productContactImports = pgTable("product_contact_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
  idempotencyKey: uuid("idempotency_key").notNull(), csvHash: text("csv_hash").notNull(),
  receipt: jsonb("receipt").$type<ContactImportReceipt>().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
}, t => [uniqueIndex("product_contact_imports_company_key_uq").on(t.companyId, t.idempotencyKey)]);
