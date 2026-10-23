import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { goals } from "./goals.js";

/** Sprint 3 WP13: per-user, per-company preference for the daily owner brief. */
export const dailyBriefPreferences = pgTable(
  "daily_brief_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    deliveryAgentId: uuid("delivery_agent_id").references(() => agents.id, { onDelete: "set null" }),
    pendingTaskId: uuid("pending_task_id").references(() => goals.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(false),
    channel: text("channel").notNull().default("email"),
    hourLocal: integer("hour_local").notNull().default(8),
    timezone: text("timezone").notNull().default("Europe/Madrid"),
    lastSentOn: text("last_sent_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserUq: uniqueIndex("daily_brief_preferences_company_user_uq").on(table.companyId, table.userId),
  }),
);
