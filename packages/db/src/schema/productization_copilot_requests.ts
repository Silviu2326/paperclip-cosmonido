import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { decisionInvocations } from "./decision_models.js";

/** Durable idempotency and result journal for paid builder-copilot model calls. */
export const productizationCopilotRequests = pgTable("productization_copilot_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  status: text("status").notNull().default("pending"),
  request: jsonb("request").notNull(),
  response: jsonb("response"),
  result: jsonb("result"),
  invocationId: uuid("invocation_id").references(() => decisionInvocations.id, { onDelete: "set null" }),
  provider: text("provider"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({
  key: uniqueIndex("productization_copilot_requests_key_idx").on(t.companyId, t.feature, t.idempotencyKey),
  invocation: index("productization_copilot_requests_invocation_idx").on(t.companyId, t.invocationId),
  status: check("productization_copilot_requests_status_check", sql`${t.status} in ('pending', 'responded', 'completed', 'unknown')`),
  hash: check("productization_copilot_requests_hash_check", sql`length(${t.requestHash}) = 64`),
}));
