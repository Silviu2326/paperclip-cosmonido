import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import type { OnboardingJourney } from "@paperclipai/shared/productization/onboarding-journey";
import { companies } from "./companies.js";

/** One resumable onboarding journey per company, isolated from instance settings. */
export const productizationOnboarding = pgTable("productization_onboarding", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  journey: jsonb("journey").$type<OnboardingJourney>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  revisionPositiveCheck: check("productization_onboarding_revision_positive_check", sql`${table.revision} > 0`),
}));
