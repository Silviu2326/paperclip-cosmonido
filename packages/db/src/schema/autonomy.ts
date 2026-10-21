import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

// Shared with the autonomy sprint: same table and columns as the main tree.
// agent_id null = company policy. Active policy = revoked_at is null.
export const autonomyPolicies = pgTable(
  "autonomy_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    level: text("level").notNull(),
    grantedByUserId: text("granted_by_user_id"),
    grantedByAgentId: uuid("granted_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    // Sin FK: autonomy_bench_runs pertenece al otro sprint.
    benchRunId: uuid("bench_run_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id"),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lookupIdx: index("autonomy_policies_company_agent_action_revoked_idx").on(
      table.companyId,
      table.agentId,
      table.actionType,
      table.revokedAt,
    ),
    actionTypeCheck: check(
      "autonomy_policies_action_type_check",
      sql`${table.actionType} in ('email', 'message', 'booking', 'stage_change', 'proposal', 'publish', 'call', 'review_link')`,
    ),
    levelCheck: check(
      "autonomy_policies_level_check",
      sql`${table.level} in ('draft_only', 'send_with_approval', 'send_direct')`,
    ),
  }),
);
