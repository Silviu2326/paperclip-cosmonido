import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id"),
    actorAgentId: uuid("actor_agent_id").references(() => agents.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    externalRef: text("external_ref"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("crm_activities_company_updated_idx").on(table.companyId, table.updatedAt),
    subjectIdx: index("crm_activities_company_subject_occurred_idx").on(
      table.companyId,
      table.subjectKind,
      table.subjectId,
      table.occurredAt,
    ),
    subjectKindCheck: check(
      "crm_activities_subject_kind_check",
      sql`${table.subjectKind} in ('customer', 'contact', 'lead', 'opportunity', 'conversation', 'commitment')`,
    ),
    kindCheck: check(
      "crm_activities_kind_check",
      sql`${table.kind} in ('note', 'call', 'email', 'message', 'meeting', 'stage_change', 'status_change', 'task', 'system')`,
    ),
  }),
);
