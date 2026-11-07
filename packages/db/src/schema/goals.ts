import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    level: text("level").notNull().default("task"),
    status: text("status").notNull().default("planned"),
    kind: text("kind").notNull().default("goal"),
    acceptanceCriteria: text("acceptance_criteria"),
    expectedDeliverable: text("expected_deliverable"),
    budgetCents: integer("budget_cents"),
    projectId: uuid("project_id").references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id, { onDelete: "set null" }),
    rootIssueId: uuid("root_issue_id").references((): AnyPgColumn => issues.id, { onDelete: "set null" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => goals.id),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKindStatusIdx: index("goals_company_kind_status_idx").on(table.companyId, table.kind, table.status),
    companyIdx: index("goals_company_idx").on(table.companyId),
  }),
);
