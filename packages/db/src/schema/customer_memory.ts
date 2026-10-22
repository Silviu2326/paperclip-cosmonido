import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { customers } from "./customers.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

/**
 * Sprint 2 pista K. Append-only history of notes kept about a customer.
 * Rows are never overwritten: a correction is a new row with the same key.
 * `archived_at` hides a note from the active view without deleting history.
 */
export const customerMemoryNotes = pgTable(
  "customer_memory_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull().default("user"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("customer_memory_notes_company_updated_idx").on(table.companyId, table.updatedAt),
    companyIdempotencyUq: uniqueIndex("customer_memory_notes_company_idempotency_uq")
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    customerKeyIdx: index("customer_memory_notes_customer_key_idx").on(table.customerId, table.key, table.createdAt),
    sourceCheck: check(
      "customer_memory_notes_source_check",
      sql`${table.source} in ('user', 'agent', 'detected')`,
    ),
  }),
);
