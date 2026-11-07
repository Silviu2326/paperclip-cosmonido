import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { CrmPhoneCallSummary } from "@paperclipai/shared";
import { agents } from "./agents.js";
import { chatVoiceSessions } from "./chat_voice_sessions.js";
import { companies } from "./companies.js";
import { contacts } from "./contacts.js";
import { crmActivities } from "./crm_activities.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";
import { leads } from "./leads.js";
import { projects } from "./projects.js";

/** One CRM projection per provider call. Transcripts stay in chat_voice_reports; only a bounded extractive summary is kept. */
export const crmPhoneCalls = pgTable(
  "crm_phone_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    activityId: uuid("activity_id").references(() => crmActivities.id, { onDelete: "set null" }),
    identityState: text("identity_state").notNull().default("unresolved"),
    identityBasis: text("identity_basis"),
    callerPhoneE164: text("caller_phone_e164"),
    reportStatus: text("report_status").notNull(),
    summary: jsonb("summary").$type<CrmPhoneCallSummary>().notNull(),
    reportProviderUpdatedAt: timestamp("report_provider_updated_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerUq: uniqueIndex("crm_phone_calls_company_provider_uq").on(table.companyId, table.providerSessionId),
    sessionUq: uniqueIndex("crm_phone_calls_company_session_uq").on(table.companyId, table.sessionId),
    contactIdx: index("crm_phone_calls_company_contact_idx").on(table.companyId, table.contactId, table.startedAt),
    recentIdx: index("crm_phone_calls_company_started_idx").on(table.companyId, table.startedAt),
    sessionFk: foreignKey({
      columns: [table.companyId, table.sessionId],
      foreignColumns: [chatVoiceSessions.companyId, chatVoiceSessions.id],
      name: "crm_phone_calls_session_fk",
    }).onDelete("cascade"),
    identityCheck: check(
      "crm_phone_calls_identity_check",
      sql`${table.identityState} in ('matched', 'unresolved', 'ambiguous', 'manual')`,
    ),
    reportCheck: check("crm_phone_calls_report_check", sql`${table.reportStatus} in ('available', 'unavailable')`),
    phoneCheck: check(
      "crm_phone_calls_phone_check",
      sql`${table.callerPhoneE164} is null or ${table.callerPhoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
  }),
);

/**
 * Durable callback request. Scheduling never dials: `dialed` needs a provider receipt.
 *
 * Dial state machine (owned by services/crm-phone-executor.ts):
 *   pending -> dialing (durable lease; claim_token + claim_expires_at)
 *   dialing -> dialed          provider session id received and bound
 *   dialing -> pending         known failure, or lease lost before network_started_at (retry later)
 *   dialing -> failed          known provider rejection, attempts exhausted
 *   dialing -> dial_unknown    network_started_at set but no confirmed provider session: NEVER re-dialed
 * `revision` changes whenever what a human approved changes (time, number); approval binds to it.
 */
export const crmPhoneCallbacks = pgTable(
  "crm_phone_callbacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    sourceCallId: uuid("source_call_id").references(() => crmPhoneCalls.id, { onDelete: "set null" }),
    endpointId: uuid("endpoint_id").notNull(),
    assigneeAgentId: uuid("assignee_agent_id").notNull().references(() => agents.id),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    requestedByUserId: text("requested_by_user_id"),
    requestedByRunId: uuid("requested_by_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    phoneE164: text("phone_e164").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    consentBasis: text("consent_basis").notNull(),
    gateLevel: text("gate_level").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Revision of this request that is current; changes invalidate any approval. */
    revision: integer("revision").notNull().default(1),
    /** Revision a board user approved. The dial needs `approved_revision = revision` below send_direct. */
    approvedRevision: integer("approved_revision"),
    claimToken: text("claim_token"),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    dialAttempts: integer("dial_attempts").notNull().default(0),
    /** Set immediately before the provider request. After this a lost outcome is `dial_unknown`, never a retry. */
    networkStartedAt: timestamp("network_started_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    /** Blockers observed by the last server-side evaluation, so the UI never guesses. */
    lastBlockers: jsonb("last_blockers").$type<string[]>(),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    dialSessionId: uuid("dial_session_id"),
    providerReceiptId: text("provider_receipt_id"),
    dialedAt: timestamp("dialed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUq: uniqueIndex("crm_phone_callbacks_company_idempotency_uq").on(table.companyId, table.idempotencyKey),
    dueIdx: index("crm_phone_callbacks_company_status_due_idx").on(table.companyId, table.status, table.scheduledFor),
    contactIdx: index("crm_phone_callbacks_company_contact_idx").on(table.companyId, table.contactId),
    // Cross-company scheduler scan: only due pending rows and expired leases.
    schedulerIdx: index("crm_phone_callbacks_status_due_idx").on(table.status, table.scheduledFor),
    leaseIdx: index("crm_phone_callbacks_lease_idx").on(table.status, table.claimExpiresAt),
    dialSessionFk: foreignKey({
      columns: [table.companyId, table.dialSessionId],
      foreignColumns: [chatVoiceSessions.companyId, chatVoiceSessions.id],
      name: "crm_phone_callbacks_dial_session_fk",
    }),
    statusCheck: check(
      "crm_phone_callbacks_status_check",
      sql`${table.status} in ('awaiting_consent', 'awaiting_approval', 'pending', 'dialing', 'dialed', 'dial_unknown', 'failed', 'missed', 'cancelled')`,
    ),
    revisionCheck: check(
      "crm_phone_callbacks_revision_check",
      sql`${table.revision} >= 1 and (${table.approvedRevision} is null or ${table.approvedRevision} between 1 and ${table.revision}) and ${table.dialAttempts} >= 0`,
    ),
    // A live lease always carries its token and expiry; nothing else may hold them.
    leaseCheck: check(
      "crm_phone_callbacks_lease_check",
      sql`(${table.status} = 'dialing') = (${table.claimToken} is not null and ${table.claimExpiresAt} is not null)`,
    ),
    consentCheck: check(
      "crm_phone_callbacks_consent_check",
      sql`${table.consentBasis} in ('contact_consent_call', 'caller_requested_verified', 'missing')`,
    ),
    gateCheck: check(
      "crm_phone_callbacks_gate_check",
      sql`${table.gateLevel} in ('draft_only', 'send_with_approval', 'send_direct')`,
    ),
    phoneCheck: check("crm_phone_callbacks_phone_check", sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
    // A call counts as made only with the provider's receipt.
    dialedReceiptCheck: check(
      "crm_phone_callbacks_dialed_receipt_check",
      sql`${table.status} <> 'dialed' or (${table.providerReceiptId} is not null and ${table.dialSessionId} is not null and ${table.dialedAt} is not null)`,
    ),
  }),
);
