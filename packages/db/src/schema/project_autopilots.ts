import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AutopilotConfig, AutopilotState } from "@paperclipai/shared";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const projectAutopilots = pgTable("project_autopilots", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  responsibleUserId: text("responsible_user_id").notNull(),
  config: jsonb("config").$type<AutopilotConfig>().notNull(),
  state: jsonb("state").$type<AutopilotState>().notNull(),
  revision: integer("revision").notNull().default(1),
  nextTickAt: timestamp("next_tick_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ dueIdx: index("project_autopilots_due_idx").on(table.enabled, table.nextTickAt),
  companyIdx: index("project_autopilots_company_idx").on(table.companyId) }));
