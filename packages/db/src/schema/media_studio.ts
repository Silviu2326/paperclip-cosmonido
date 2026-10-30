import { pgTable, uuid, text, timestamp, jsonb, numeric, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { issues } from "./issues.js";
import { assets } from "./assets.js";
import { agents } from "./agents.js";
import { documents } from "./documents.js";
export const mediaProjects = pgTable("media_projects", {
 id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
 goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }), issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
 sourceAssetId: uuid("source_asset_id").references(() => assets.id, { onDelete: "restrict" }),
 creationType: text("creation_type").notNull().default("source"),
 transcriptDocumentId: uuid("transcript_document_id").references(() => documents.id, { onDelete: "set null" }),
 operations: jsonb("operations").$type<Array<Record<string, unknown>>>().notNull().default([]), status: text("status").notNull().default("draft"),
 createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }), createdByUserId: text("created_by_user_id"),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ companyGoalIdx: index("media_projects_company_goal_idx").on(table.companyId, table.goalId), companyIssueIdx: index("media_projects_company_issue_idx").on(table.companyId, table.issueId), creationTypeCheck: check("media_projects_creation_type_check", sql`(${table.creationType} = 'source' and ${table.sourceAssetId} is not null) or (${table.creationType} = 'motor_video' and ${table.sourceAssetId} is null)`) }));
export const mediaJobs = pgTable("media_jobs", {
 id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
 projectId: uuid("project_id").notNull().references(() => mediaProjects.id, { onDelete: "cascade" }), kind: text("kind").notNull(), idempotencyKey: text("idempotency_key").notNull(),
 input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}), outputAssetId: uuid("output_asset_id").references(() => assets.id, { onDelete: "set null" }),
 status: text("status").notNull().default("queued"), priority: numeric("priority", { precision: 3, scale: 0, mode: "number" }).notNull().default(0), error: text("error"), costCents: numeric("cost_cents", { precision: 24, scale: 7, mode: "number" }).notNull().default(0), provider: text("provider"),
 startedAt: timestamp("started_at", { withTimezone: true }), finishedAt: timestamp("finished_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ companyIdempotencyIdx: uniqueIndex("media_jobs_company_idempotency_uq").on(table.companyId, table.idempotencyKey), queueIdx: index("media_jobs_queue_idx").on(table.companyId, table.status, table.createdAt), priorityQueueIdx: index("media_jobs_priority_queue_idx").on(table.companyId, table.status, table.priority.desc(), table.createdAt.asc(), table.id.asc()), kindCheck: check("media_jobs_kind_check", sql`${table.kind} in ('transcribe', 'render', 'dub', 'stop_motion', 'dub_multivoice', 'voiceover', 'motor_video_render')`), statusCheck: check("media_jobs_status_check", sql`${table.status} in ('queued', 'running', 'cancel_requested', 'finalizing', 'done', 'failed', 'cancelled')`), priorityCheck: check("media_jobs_priority_check", sql`${table.priority} between 0 and 100`) }));
