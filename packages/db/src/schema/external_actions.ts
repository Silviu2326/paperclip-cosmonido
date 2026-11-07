import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const externalActions = pgTable(
  "external_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    actorAgentId: uuid("actor_agent_id").references(() => agents.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id"),
    subjectKind: text("subject_kind"),
    subjectId: uuid("subject_id"),
    levelApplied: text("level_applied").notNull(),
    mode: text("mode").notNull(),
    // Sin FK: el registro de aprobación vive en approvals; se enlaza por servicio.
    approvalId: uuid("approval_id"),
    // Sin FK: decisión registrada por el servicio de decisiones.
    decisionId: uuid("decision_id"),
    payloadHash: text("payload_hash"),
    idempotencyKey: text("idempotency_key"),
    status: text("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("external_actions_company_updated_idx").on(table.companyId, table.updatedAt),
    companyIdempotencyUq: uniqueIndex("external_actions_company_idempotency_uq")
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    modeCheck: check("external_actions_mode_check", sql`${table.mode} in ('draft', 'approval', 'direct')`),
    statusCheck: check(
      "external_actions_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'executed', 'failed', 'uncertain')`,
    ),
  }),
);
