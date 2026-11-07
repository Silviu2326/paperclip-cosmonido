import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  activityLog,
  agents,
  chatEndpoints,
  chatVoicePhoneLines,
  chatVoiceReports,
  chatVoiceSessions,
  contactIdentities,
  contacts,
  crmActivities,
  crmPhoneCallbacks,
  crmPhoneCalls,
  companyMemberships,
  instanceUserRoles,
  issues,
  leads,
  projects,
  type Db,
} from "@paperclipai/db";
import {
  CRM_CALLBACK_CALLER_AUTHORITY,
  CRM_CALLBACK_CALLER_PREFIX,
  VOICE_REPEAT_NOTIFICATION,
  VOICE_RESULT_NOTIFICATION,
  type CrmPhoneCallbackRescheduleInput,
  type CrmPhoneDialBlocker,
  type CrmPhoneCall,
  type CrmPhoneCallSummary,
  type CrmPhoneCallSummaryGetInput,
  type CrmPhoneCallScheduleInput,
  type CrmPhoneCallback,
  type CrmPhoneConnectorStatus,
  type CrmPhoneConsentBasis,
  type CrmPhoneDialAuthorization,
  type CrmPhoneIdentityState,
  type AutonomyLevel,
  type VoiceTranscriptEntry,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { autonomyService } from "./autonomy.js";
import { budgetService } from "./budgets.js";
import { normalizePhoneE164 } from "./crm/identity.js";
import { issueService } from "./issues.js";
import { leadIntakeService } from "./leads/intake.js";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type CallRow = typeof crmPhoneCalls.$inferSelect;
type CallbackRow = typeof crmPhoneCallbacks.$inferSelect;

export interface CrmPhoneActor {
  agentId?: string | null;
  userId?: string | null;
  /** Only a real heartbeat run id from the authenticated actor. Never synthesized. */
  runId?: string | null;
}

const TERMINAL_SESSION_STATES = ["ended", "failed", "expired"] as const;
const MAX_STATEMENT_LENGTH = 600;
const CALLER_STATEMENTS = 3;
const AGENT_STATEMENTS = 2;
const MIN_LEAD_MS = 60_000;
const MAX_LEAD_MS = 180 * 86_400_000;
/** A callback agreed for 10:00 is not placed at 16:00: past this lateness the window is missed. */
export const CRM_PHONE_MAX_LATE_MS = 2 * 3_600_000;
/** Company-scoped quotas, enforced again at dial time. */
export const CRM_PHONE_MAX_CONCURRENT_DIALS = 2;
export const CRM_PHONE_MAX_CONTACT_DIALS_PER_DAY = 2;
const OPEN_STATUSES = ["awaiting_consent", "awaiting_approval", "pending"] as const;
const UNUSABLE_AGENT_STATUSES = ["terminated", "paused", "pending_approval"];
const UNAVAILABLE_ACTION = "Configura una línea telefónica de empresa (conector de voz con número activo) para programar devoluciones de llamada.";

const iso = (value: Date | null) => (value ? value.toISOString() : null);

function excerpt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_STATEMENT_LENGTH ? `${clean.slice(0, MAX_STATEMENT_LENGTH - 1)}…` : clean;
}

/** Extractive summary: quoted turns and provider metadata only. Absent facts are listed, never invented. */
export function buildCrmPhoneSummary(input: {
  reportStatus: "available" | "unavailable";
  transcript: readonly VoiceTranscriptEntry[];
  durationSeconds: number | null;
  providerUpdatedAt: Date | null;
  callerPhone: string | null;
}): CrmPhoneCallSummary {
  const turns = input.transcript.filter(
    (turn) => turn.text.trim() && (turn.speaker !== "caller" || ![VOICE_RESULT_NOTIFICATION, VOICE_REPEAT_NOTIFICATION].includes(turn.text)),
  );
  const caller = turns.filter((turn) => turn.speaker === "caller").slice(0, CALLER_STATEMENTS);
  const agent = turns.filter((turn) => turn.speaker === "agent").slice(-AGENT_STATEMENTS);
  const notAvailable: CrmPhoneCallSummary["notAvailable"] = ["generated_summary", "recording"];
  if (!input.callerPhone) notAvailable.push("caller_number");
  if (!turns.length) notAvailable.push("transcript");
  return {
    method: "extractive",
    reportStatus: input.reportStatus,
    provider: { durationSeconds: input.durationSeconds, transcriptTurns: turns.length, reportUpdatedAt: iso(input.providerUpdatedAt) },
    callerStatements: caller.map((turn) => ({ text: excerpt(turn.text), at: turn.startedAt, source: "caller_transcript" as const })),
    agentStatements: agent.map((turn) => ({ text: excerpt(turn.text), at: turn.startedAt, source: "voice_agent_transcript" as const })),
    notAvailable,
  };
}

function activityText(summary: CrmPhoneCallSummary) {
  const head = `Llamada entrante · ${summary.provider.transcriptTurns} turnos${summary.provider.durationSeconds != null ? ` · ${summary.provider.durationSeconds} s` : ""}`;
  if (summary.reportStatus === "unavailable") return `${head}. El proveedor no entregó informe de la llamada.`;
  const first = summary.callerStatements[0];
  return first ? `${head}. Llamante (transcripción): «${first.text}»`.slice(0, 1800) : `${head}. Sin intervenciones del llamante en la transcripción.`;
}

const projectCall = (row: CallRow): CrmPhoneCall => ({
  id: row.id, companyId: row.companyId, endpointId: row.endpointId, sessionId: row.sessionId, providerSessionId: row.providerSessionId,
  issueId: row.issueId, contactId: row.contactId, leadId: row.leadId, activityId: row.activityId,
  identityState: row.identityState as CrmPhoneIdentityState, identityBasis: row.identityBasis, summary: row.summary,
  startedAt: row.startedAt.toISOString(), endedAt: iso(row.endedAt), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

const projectCallback = (row: CallbackRow): CrmPhoneCallback => ({
  id: row.id, companyId: row.companyId, contactId: row.contactId, projectId: row.projectId, issueId: row.issueId, sourceCallId: row.sourceCallId,
  assigneeAgentId: row.assigneeAgentId, requestedByAgentId: row.requestedByAgentId, requestedByUserId: row.requestedByUserId,
  scheduledFor: row.scheduledFor.toISOString(), timezone: row.timezone, reason: row.reason, status: row.status as CrmPhoneCallback["status"],
  consentBasis: row.consentBasis as CrmPhoneConsentBasis, gateLevel: row.gateLevel as AutonomyLevel,
  approvedByUserId: row.approvedByUserId, approvedAt: iso(row.approvedAt), revision: row.revision, approvedRevision: row.approvedRevision,
  providerReceiptId: row.providerReceiptId, dialedAt: iso(row.dialedAt), dialAttempts: row.dialAttempts,
  networkStartedAt: iso(row.networkStartedAt), lastErrorCode: row.lastErrorCode,
  dialBlockers: row.lastBlockers as CrmPhoneDialBlocker[] | null, createdAt: row.createdAt.toISOString(),
});

function actorLog(actor: CrmPhoneActor) {
  return actor.agentId
    ? { actorType: "agent" as const, actorId: actor.agentId, agentId: actor.agentId, runId: actor.runId ?? null }
    : actor.userId
      ? { actorType: "user" as const, actorId: actor.userId }
      : { actorType: "system" as const, actorId: "crm-phone" };
}

function formatLocal(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "short", timeZone }).format(date);
}

function contactAllowsCalls(consents: unknown) {
  return typeof consents === "object" && consents !== null && (consents as Record<string, unknown>).call === true;
}

export function crmPhoneService(db: Db) {
  const autonomy = autonomyService(db);
  const issueSvc = issueService(db);
  const leadIntake = leadIntakeService(db);

  /** Enabled company phone lines. The voice endpoint's own agent must match the callback's agent to dial. */
  async function activeLines(companyId: string) {
    return db
      .select({ endpointId: chatVoicePhoneLines.endpointId, assignedAgentId: chatEndpoints.assignedAgentId })
      .from(chatVoicePhoneLines)
      .innerJoin(chatEndpoints, and(eq(chatEndpoints.id, chatVoicePhoneLines.endpointId), eq(chatEndpoints.companyId, chatVoicePhoneLines.companyId)))
      .where(and(
        eq(chatVoicePhoneLines.companyId, companyId), eq(chatVoicePhoneLines.enabled, true),
        eq(chatEndpoints.provider, "speko"), eq(chatEndpoints.status, "active"),
      ))
      .orderBy(chatVoicePhoneLines.endpointId);
  }

  async function connectorStatus(companyId: string, preferAgentId?: string): Promise<CrmPhoneConnectorStatus> {
    const lines = await activeLines(companyId);
    const line = preferAgentId ? lines.find((item) => item.assignedAgentId === preferAgentId) : lines[0];
    return line ? { available: true, endpointId: line.endpointId, reason: null } : { available: false, endpointId: null, reason: UNAVAILABLE_ACTION };
  }

  /** The number always comes from the contact record, never from a request. */
  async function resolveContactPhone(companyId: string, contact: { id: string; primaryPhone: string | null }) {
    const primary = normalizePhoneE164(contact.primaryPhone);
    if (primary) return primary;
    const [identity] = await db.select({ identifier: contactIdentities.identifier }).from(contactIdentities)
      .where(and(eq(contactIdentities.companyId, companyId), eq(contactIdentities.contactId, contact.id), eq(contactIdentities.channel, "phone")))
      .orderBy(contactIdentities.identifier).limit(1);
    return normalizePhoneE164(identity?.identifier);
  }

  /** Board user still allowed to act: active non-viewer member, instance admin or the local board. */
  async function userCanAct(companyId: string, userId: string) {
    if (userId === "local-board") return true;
    const [member] = await db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
      eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalId, userId), eq(companyMemberships.principalType, "user"),
      eq(companyMemberships.status, "active"), sql`${companyMemberships.membershipRole} is distinct from 'viewer'`,
    )).limit(1);
    if (member) return true;
    const [admin] = await db.select({ id: instanceUserRoles.id }).from(instanceUserRoles)
      .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin"))).limit(1);
    return Boolean(admin);
  }

  async function resolveIdentity(tx: DbTransaction, companyId: string, rawPhone: string | null | undefined) {
    const phone = normalizePhoneE164(rawPhone);
    if (!phone) return { phone: null, state: "unresolved" as CrmPhoneIdentityState, basis: null, contactId: null };
    const rows = await tx
      .select({ contactId: contactIdentities.contactId, verified: contactIdentities.verified })
      .from(contactIdentities)
      .innerJoin(contacts, and(eq(contacts.id, contactIdentities.contactId), eq(contacts.companyId, companyId)))
      .where(and(
        eq(contactIdentities.companyId, companyId), eq(contactIdentities.channel, "phone"),
        eq(contactIdentities.identifier, phone), isNull(contacts.archivedAt),
      ));
    const ids = [...new Set(rows.map((row) => row.contactId))];
    // Caller ID is evidence, not authority: only a single exact match is attached.
    if (ids.length === 1) return { phone, state: "matched" as const, basis: rows[0]!.verified ? "phone_identity_verified" : "phone_identity_unverified", contactId: ids[0]! };
    return { phone, state: (ids.length > 1 ? "ambiguous" : "unresolved") as CrmPhoneIdentityState, basis: null, contactId: null };
  }

  /**
   * Projects one finished inbound call into the CRM. Idempotent by company + provider session.
   * Caller phone is optional evidence supplied by a verified source; the provider report does not carry it today.
   */
  async function projectSession(companyId: string, sessionId: string, options: { callerPhone?: string | null } = {}) {
    const [row] = await db
      .select({ session: chatVoiceSessions, report: chatVoiceReports })
      .from(chatVoiceSessions)
      .leftJoin(chatVoiceReports, and(eq(chatVoiceReports.sessionId, chatVoiceSessions.id), eq(chatVoiceReports.companyId, chatVoiceSessions.companyId)))
      .where(and(eq(chatVoiceSessions.id, sessionId), eq(chatVoiceSessions.companyId, companyId)));
    if (!row) throw notFound("Voice session not found");
    const { session, report } = row;
    if (session.mode !== "inbound_phone" || !session.providerSessionId) return { status: "skipped" as const, call: null };
    if (!(TERMINAL_SESSION_STATES as readonly string[]).includes(session.state) || !report || report.status === "pending") {
      return { status: "pending" as const, call: null, code: "report_pending" as const };
    }
    const [endpoint] = await db.select({ id: chatEndpoints.id }).from(chatEndpoints)
      .where(and(eq(chatEndpoints.id, session.endpointId), eq(chatEndpoints.companyId, companyId), eq(chatEndpoints.provider, "speko")));
    if (!endpoint) throw forbidden("Voice connection is not available for this company");

    const reportStatus = report.status === "available" ? "available" as const : "unavailable" as const;
    const providerSessionId = session.providerSessionId;
    const [priorProjection] = await db.select({ id: crmPhoneCalls.id }).from(crmPhoneCalls)
      .where(and(eq(crmPhoneCalls.companyId, companyId), eq(crmPhoneCalls.providerSessionId, providerSessionId)));
    let intakeLeadId: string | null = null;
    if (!priorProjection) {
      const preflightIdentity = await db.transaction((tx) => resolveIdentity(tx, companyId, options.callerPhone));
      if (!preflightIdentity.contactId) {
        const summary = buildCrmPhoneSummary({
          reportStatus, transcript: report.transcript, durationSeconds: report.durationSeconds,
          providerUpdatedAt: report.providerUpdatedAt, callerPhone: preflightIdentity.phone,
        });
        const intake = await leadIntake.ingest(companyId, {
          source: "voice",
          sourceRef: providerSessionId,
          payload: {
            origin: "crm_phone", providerSessionId, identity: { state: preflightIdentity.state }, reportStatus,
            callerStatements: summary.callerStatements, notAvailable: summary.notAvailable,
          },
        });
        intakeLeadId = intake.lead.id;
      }
    }
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`crm-phone:${companyId}:${providerSessionId}`}, 0))`);
      const [existing] = await tx.select().from(crmPhoneCalls)
        .where(and(eq(crmPhoneCalls.companyId, companyId), eq(crmPhoneCalls.providerSessionId, providerSessionId)));
      const summaryFor = (phone: string | null) => buildCrmPhoneSummary({
        reportStatus, transcript: report.transcript, durationSeconds: report.durationSeconds,
        providerUpdatedAt: report.providerUpdatedAt, callerPhone: phone,
      });
      if (existing) {
        const newer = report.providerUpdatedAt && (!existing.reportProviderUpdatedAt || report.providerUpdatedAt > existing.reportProviderUpdatedAt);
        if (!newer && existing.reportStatus === reportStatus) return { status: "projected" as const, created: false, call: projectCall(existing) };
        const summary = summaryFor(existing.callerPhoneE164);
        const [updated] = await tx.update(crmPhoneCalls)
          .set({ summary, reportStatus, reportProviderUpdatedAt: report.providerUpdatedAt, updatedAt: new Date() })
          .where(eq(crmPhoneCalls.id, existing.id)).returning();
        if (existing.activityId) {
          await tx.update(crmActivities).set({ summary: activityText(summary), payload: { callId: existing.id, summary }, updatedAt: new Date() })
            .where(and(eq(crmActivities.id, existing.activityId), eq(crmActivities.companyId, companyId)));
        }
        return { status: "projected" as const, created: false, call: projectCall(updated!) };
      }

      const identity = await resolveIdentity(tx, companyId, options.callerPhone);
      const summary = summaryFor(identity.phone);
      const occurredAt = session.endedAt ?? session.createdAt;
      const leadId = identity.contactId ? null : intakeLeadId;
      const subject = identity.contactId ? { kind: "contact" as const, id: identity.contactId } : leadId ? { kind: "lead" as const, id: leadId } : null;
      let activityId: string | null = null;
      if (subject) {
        const [activity] = await tx.insert(crmActivities).values({
          companyId, subjectKind: subject.kind, subjectId: subject.id, kind: "call", actorAgentId: session.assignedAgentId,
          summary: activityText(summary), payload: { providerSessionId, summary }, externalRef: `voice:${providerSessionId}`, occurredAt,
        }).returning({ id: crmActivities.id });
        activityId = activity!.id;
      }
      const [call] = await tx.insert(crmPhoneCalls).values({
        companyId, endpointId: session.endpointId, sessionId: session.id, providerSessionId, issueId: session.issueId,
        contactId: identity.contactId, leadId, activityId, identityState: identity.state, identityBasis: identity.basis,
        callerPhoneE164: identity.phone, reportStatus, summary, reportProviderUpdatedAt: report.providerUpdatedAt,
        startedAt: session.createdAt, endedAt: session.endedAt,
      }).returning();
      await tx.insert(activityLog).values({
        companyId, actorType: "system", actorId: "crm-phone", action: "crm_phone.call_projected", entityType: "crm_phone_call", entityId: call!.id,
        details: { sessionId: session.id, contactId: identity.contactId, leadId, identityState: identity.state },
      });
      return { status: "projected" as const, created: true, call: projectCall(call!) };
    });
  }

  /** Project inbound calls whose report is stored but not yet in the CRM (or has a newer provider version). */
  async function sync(companyId: string, limit = 50) {
    const rows = await db
      .select({ sessionId: chatVoiceSessions.id })
      .from(chatVoiceSessions)
      .innerJoin(chatVoiceReports, and(eq(chatVoiceReports.sessionId, chatVoiceSessions.id), eq(chatVoiceReports.companyId, chatVoiceSessions.companyId)))
      .leftJoin(crmPhoneCalls, and(eq(crmPhoneCalls.sessionId, chatVoiceSessions.id), eq(crmPhoneCalls.companyId, chatVoiceSessions.companyId)))
      .where(and(
        eq(chatVoiceSessions.companyId, companyId), eq(chatVoiceSessions.mode, "inbound_phone"),
        inArray(chatVoiceSessions.state, [...TERMINAL_SESSION_STATES]), inArray(chatVoiceReports.status, ["available", "unavailable"]),
        or(isNull(crmPhoneCalls.id), sql`${chatVoiceReports.providerUpdatedAt} > ${crmPhoneCalls.reportProviderUpdatedAt}`, sql`${crmPhoneCalls.reportStatus} <> ${chatVoiceReports.status}`),
      ))
      .orderBy(desc(chatVoiceSessions.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
    let projected = 0;
    for (const { sessionId } of rows) {
      const result = await projectSession(companyId, sessionId);
      if (result.status === "projected") projected += 1;
    }
    return { examined: rows.length, projected };
  }

  async function listCalls(companyId: string, filter: { contactId?: string; limit?: number } = {}) {
    const rows = await db.select().from(crmPhoneCalls)
      .where(and(eq(crmPhoneCalls.companyId, companyId), filter.contactId ? eq(crmPhoneCalls.contactId, filter.contactId) : undefined))
      .orderBy(desc(crmPhoneCalls.startedAt)).limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
    return rows.map(projectCall);
  }

  async function callInScope(call: CallRow, scope: CrmPhoneCallSummaryGetInput["scope"]) {
    if (scope.contactId) return call.contactId === scope.contactId;
    const linked = await db.select({ issueId: crmPhoneCallbacks.issueId, projectId: crmPhoneCallbacks.projectId }).from(crmPhoneCallbacks)
      .where(and(eq(crmPhoneCallbacks.companyId, call.companyId), eq(crmPhoneCallbacks.sourceCallId, call.id)));
    if (scope.issueId) return call.issueId === scope.issueId || linked.some((item) => item.issueId === scope.issueId);
    if (scope.projectId) {
      if (linked.some((item) => item.projectId === scope.projectId)) return true;
      if (!call.issueId) return false;
      const [issue] = await db.select({ projectId: issues.projectId }).from(issues).where(and(eq(issues.id, call.issueId), eq(issues.companyId, call.companyId)));
      return issue?.projectId === scope.projectId;
    }
    return false;
  }

  /** `call_summary_get`: scoped read. Out-of-scope and missing calls are indistinguishable. */
  async function getSummary(companyId: string, input: CrmPhoneCallSummaryGetInput) {
    const [call] = await db.select().from(crmPhoneCalls).where(and(eq(crmPhoneCalls.id, input.callId), eq(crmPhoneCalls.companyId, companyId)));
    if (!call || !(await callInScope(call, input.scope))) throw notFound("Call not found in this scope");
    return { call: projectCall(call) };
  }

  async function linkContact(companyId: string, callId: string, contactId: string, userId: string) {
    return db.transaction(async (tx) => {
      const [call] = await tx.select().from(crmPhoneCalls).where(and(eq(crmPhoneCalls.id, callId), eq(crmPhoneCalls.companyId, companyId))).for("update");
      if (!call) throw notFound("Call not found");
      if (!["unresolved", "ambiguous"].includes(call.identityState)) throw conflict("This call already has an identity decision");
      const [contact] = await tx.select({ id: contacts.id }).from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId), isNull(contacts.archivedAt)));
      if (!contact) throw notFound("Contact not found");
      const [activity] = await tx.insert(crmActivities).values({
        companyId, subjectKind: "contact", subjectId: contactId, kind: "call", actorUserId: userId, summary: activityText(call.summary),
        payload: { providerSessionId: call.providerSessionId, summary: call.summary, linkedBy: userId }, externalRef: `voice:${call.providerSessionId}:manual`,
        occurredAt: call.endedAt ?? call.startedAt,
      }).returning({ id: crmActivities.id });
      if (call.leadId) await tx.update(leads).set({ contactId, updatedAt: new Date() }).where(and(eq(leads.id, call.leadId), eq(leads.companyId, companyId)));
      const [updated] = await tx.update(crmPhoneCalls)
        .set({ contactId, identityState: "manual", identityBasis: `linked_by_user:${userId}`, activityId: call.activityId ?? activity!.id, updatedAt: new Date() })
        .where(eq(crmPhoneCalls.id, call.id)).returning();
      await tx.insert(activityLog).values({
        companyId, actorType: "user", actorId: userId, action: "crm_phone.call_contact_linked", entityType: "crm_phone_call", entityId: call.id, details: { contactId },
      });
      return projectCall(updated!);
    });
  }

  async function evaluateConsent(tx: DbTransaction | Db, companyId: string, contactId: string) {
    const [contact] = await tx.select({ consents: contacts.consents }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)));
    if (contactAllowsCalls(contact?.consents)) return "contact_consent_call" as CrmPhoneConsentBasis;
    return "missing" as CrmPhoneConsentBasis;
  }

  async function createCallbackIssue(tx: DbTransaction, input: {
    companyId: string; contactName: string; assigneeAgentId: string; scheduledFor: Date;
    timezone: string; reason: string; projectId: string | null; parentIssueId: string | null;
    idempotencyKey: string; actor: CrmPhoneActor;
  }) {
    const when = formatLocal(input.scheduledFor, input.timezone);
    return issueSvc.create(input.companyId, {
      title: `Devolver llamada a ${input.contactName}`.slice(0, 200),
      description: [`Callback requested for ${when} (${input.timezone}).`, `Reason: ${input.reason}`, "The number comes from the contact record. Calling requires contact consent, current call autonomy and a real provider receipt."].join("\n\n"),
      status: "todo", priority: "medium", assigneeAgentId: input.assigneeAgentId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.parentIssueId ? { parentId: input.parentIssueId } : {}),
      createdByAgentId: input.actor.agentId ?? null,
      createdByUserId: input.actor.agentId ? null : input.actor.userId ?? null,
      idempotencyKey: `crm-phone-callback:${input.idempotencyKey}`,
    }, tx);
  }

  /** `call_schedule`: durable request, with a task only after consent and policy criteria pass. Never dials. */
  async function schedule(companyId: string, input: CrmPhoneCallScheduleInput, actor: CrmPhoneActor) {
    const connector = await connectorStatus(companyId, input.assigneeAgentId);
    if (!connector.available || !connector.endpointId) {
      throw conflict("No telephone connector is configured for this company", { code: "phone_connector_unavailable", action: UNAVAILABLE_ACTION });
    }
    const scheduledFor = new Date(input.scheduledFor);
    const lead = scheduledFor.getTime() - Date.now();
    if (lead < MIN_LEAD_MS || lead > MAX_LEAD_MS) throw unprocessable("scheduledFor must be between 1 minute and 180 days from now");

    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.companyId, companyId), isNull(contacts.archivedAt)));
    if (!contact) throw notFound("Contact not found");
    const phone = await resolveContactPhone(companyId, contact);
    if (!phone) throw unprocessable("The contact has no phone number", { code: "contact_phone_missing" });

    const [agent] = await db.select({ id: agents.id, status: agents.status }).from(agents)
      .where(and(eq(agents.id, input.assigneeAgentId), eq(agents.companyId, companyId)));
    if (!agent || ["terminated", "paused", "pending_approval"].includes(agent.status)) throw unprocessable("The assignee must be an available agent of this company");
    if (input.projectId) {
      const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.companyId, companyId)));
      if (!project) throw notFound("Project not found");
    }
    if (input.issueId) {
      const [issue] = await db.select({ id: issues.id }).from(issues).where(and(eq(issues.id, input.issueId), eq(issues.companyId, companyId)));
      if (!issue) throw notFound("Issue not found");
    }
    if (input.sourceCallId) {
      const [call] = await db.select({ contactId: crmPhoneCalls.contactId }).from(crmPhoneCalls)
        .where(and(eq(crmPhoneCalls.id, input.sourceCallId), eq(crmPhoneCalls.companyId, companyId)));
      if (!call) throw notFound("Source call not found");
      if (call.contactId !== input.contactId) throw unprocessable("The source call is not linked to this contact");
    }

    const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, scheduledFor: scheduledFor.toISOString() })).digest("hex");
    const consentBasis = await evaluateConsent(db, companyId, input.contactId);
    const gateLevel = (await autonomy.effectiveLevel(companyId, input.assigneeAgentId, "call")).level;
    const status: CrmPhoneCallback["status"] = consentBasis === "missing" ? "awaiting_consent" : gateLevel === "send_direct" ? "pending" : "awaiting_approval";

    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`crm-phone-callback:${companyId}:${input.idempotencyKey}`}, 0))`);
      const [prior] = await tx.select().from(crmPhoneCallbacks)
        .where(and(eq(crmPhoneCallbacks.companyId, companyId), eq(crmPhoneCallbacks.idempotencyKey, input.idempotencyKey)));
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) throw conflict("This idempotency key was already used for a different callback");
        return { callback: projectCallback(prior), created: false };
      }
      const task = status === "pending" ? await createCallbackIssue(tx, {
        companyId, contactName: contact.displayName, assigneeAgentId: input.assigneeAgentId, scheduledFor,
        timezone: input.timezone, reason: input.reason, projectId: input.projectId ?? null,
        parentIssueId: input.issueId ?? null, idempotencyKey: input.idempotencyKey, actor,
      }) : null;
      const [created] = await tx.insert(crmPhoneCallbacks).values({
        companyId, contactId: input.contactId, projectId: input.projectId ?? null, issueId: task?.id ?? null, sourceCallId: input.sourceCallId ?? null,
        endpointId: connector.endpointId!, assigneeAgentId: input.assigneeAgentId, requestedByAgentId: actor.agentId ?? null,
        requestedByUserId: actor.agentId ? null : actor.userId ?? null, requestedByRunId: actor.runId ?? null, phoneE164: phone!,
        scheduledFor, timezone: input.timezone, reason: input.reason, status, consentBasis, gateLevel,
        idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint,
      }).returning();
      await tx.insert(crmActivities).values({
        companyId, subjectKind: "contact", subjectId: input.contactId, kind: task ? "task" : "note", actorAgentId: actor.agentId ?? null,
        actorUserId: actor.agentId ? null : actor.userId ?? null, summary: `Devolución de llamada programada para ${formatLocal(scheduledFor, input.timezone)} (${input.timezone})`,
        payload: { callbackId: created!.id, issueId: task?.id ?? null, status }, externalRef: `crm-phone-callback:${created!.id}`,
      });
      await tx.insert(activityLog).values({
        companyId, ...actorLog(actor), action: "crm_phone.callback_scheduled", entityType: "crm_phone_callback", entityId: created!.id,
        details: { contactId: input.contactId, issueId: task?.id ?? null, status, consentBasis, gateLevel, runId: actor.runId ?? null },
      });
      return { callback: projectCallback(created!), created: true };
    });
  }

  async function listCallbacks(companyId: string, filter: { status?: CrmPhoneCallback["status"]; limit?: number } = {}) {
    const rows = await db.select().from(crmPhoneCallbacks)
      .where(and(eq(crmPhoneCallbacks.companyId, companyId), filter.status ? eq(crmPhoneCallbacks.status, filter.status) : undefined))
      .orderBy(crmPhoneCallbacks.scheduledFor).limit(Math.min(Math.max(filter.limit ?? 100, 1), 300));
    return rows.map(projectCallback);
  }

  async function loadCallback(companyId: string, callbackId: string, actor?: CrmPhoneActor) {
    const [row] = await db.select().from(crmPhoneCallbacks).where(and(eq(crmPhoneCallbacks.id, callbackId), eq(crmPhoneCallbacks.companyId, companyId)));
    if (!row) throw notFound("Callback not found");
    if (actor?.agentId && actor.agentId !== row.assigneeAgentId) throw forbidden("Only the assigned agent can act on this callback");
    return row;
  }

  async function approve(companyId: string, callbackId: string, userId: string) {
    if (!(await userCanAct(companyId, userId))) throw forbidden("An active company writer must approve a callback");
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.id, callbackId), eq(crmPhoneCallbacks.companyId, companyId),
      )).for("update");
      if (!row) throw notFound("Callback not found");
      if (row.status !== "awaiting_approval") throw conflict("This callback is not waiting for approval");
      const [contact] = await tx.select({ displayName: contacts.displayName, consents: contacts.consents }).from(contacts)
        .where(and(eq(contacts.id, row.contactId), eq(contacts.companyId, companyId), isNull(contacts.archivedAt)));
      if (!contact || !contactAllowsCalls(contact.consents)) {
        throw conflict("The contact has not granted call consent; approval cannot create a callback task", { code: "phone_consent_missing" });
      }
      const task = row.issueId ? null : await createCallbackIssue(tx as DbTransaction, {
        companyId, contactName: contact.displayName, assigneeAgentId: row.assigneeAgentId,
        scheduledFor: row.scheduledFor, timezone: row.timezone, reason: row.reason,
        projectId: row.projectId, parentIssueId: null, idempotencyKey: row.idempotencyKey,
        actor: { userId },
      });
      const [updated] = await tx.update(crmPhoneCallbacks)
        .set({ status: "pending", issueId: task?.id ?? row.issueId, approvedByUserId: userId, approvedAt: new Date(), approvedRevision: row.revision, updatedAt: new Date() })
        .where(and(eq(crmPhoneCallbacks.id, row.id), eq(crmPhoneCallbacks.status, "awaiting_approval"))).returning();
      if (!updated) throw conflict("This callback changed while approving");
      await tx.insert(activityLog).values({ companyId, actorType: "user", actorId: userId, action: "crm_phone.callback_approved", entityType: "crm_phone_callback", entityId: row.id });
      return projectCallback(updated);
    });
  }

  async function cancel(companyId: string, callbackId: string, userId: string) {
    if (!(await userCanAct(companyId, userId))) throw forbidden("An active company writer must cancel a callback");
    const { row, updated } = await db.transaction(async tx => {
      const [current] = await tx.select().from(crmPhoneCallbacks).where(and(eq(crmPhoneCallbacks.id, callbackId), eq(crmPhoneCallbacks.companyId, companyId))).for("update");
      if (!current) throw notFound("Callback not found");
      if (current.status === "cancelled") return { row: current, updated: current };
      if (current.networkStartedAt || ["dialed", "dial_unknown"].includes(current.status)) throw conflict("A callback whose provider request may have started cannot be cancelled safely", { code: "callback_outcome_unknown" });
      const [changed] = await tx.update(crmPhoneCallbacks)
        .set({ status: "cancelled", cancelledAt: new Date(), claimToken: null, claimExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(crmPhoneCallbacks.id, current.id), inArray(crmPhoneCallbacks.status, ["awaiting_consent", "awaiting_approval", "pending", "dialing"]), isNull(crmPhoneCallbacks.networkStartedAt))).returning();
      if (!changed) throw conflict("This callback changed while cancelling");
      await tx.insert(activityLog).values({ companyId, actorType: "user", actorId: userId, action: "crm_phone.callback_cancelled", entityType: "crm_phone_callback", entityId: current.id });
      return { row: current, updated: changed };
    });
    if (row.status === "cancelled") return projectCallback(updated);
    if (row.issueId) await issueSvc.update(row.issueId, { status: "cancelled", actorUserId: userId });
    return projectCallback(updated);
  }

  /** Current decision. Re-reads consent, gate and connector so a revocation after scheduling blocks the dial. */
  async function authorizeDial(companyId: string, callbackId: string, actor?: CrmPhoneActor, now = new Date()): Promise<CrmPhoneDialAuthorization> {
    const row = await loadCallback(companyId, callbackId, actor);
    const blockers: CrmPhoneDialAuthorization["blockers"] = [];
    const current = (await autonomy.effectiveLevel(companyId, row.assigneeAgentId, "call")).level;
    if (!["pending", "awaiting_approval", "awaiting_consent"].includes(row.status)) blockers.push("not_pending");
    if (row.scheduledFor > now) blockers.push("not_due");
    const [contact] = await db.select({ id: contacts.id, consents: contacts.consents, primaryPhone: contacts.primaryPhone, archivedAt: contacts.archivedAt }).from(contacts).where(and(eq(contacts.id, row.contactId), eq(contacts.companyId, companyId)));
    const consented = contactAllowsCalls(contact?.consents);
    if (!consented) blockers.push("consent_missing");
    if (!contact || contact.archivedAt) blockers.push("contact_unavailable");
    else if (await resolveContactPhone(companyId, contact) !== row.phoneE164) blockers.push("phone_changed");
    const exactApproval = row.approvedByUserId !== null && row.approvedAt !== null && row.approvedRevision === row.revision;
    if (current === "draft_only") blockers.push("gate_revoked");
    else if (current === "send_with_approval" && !exactApproval) blockers.push("approval_required");
    if (current !== "send_direct" && exactApproval && !(await userCanAct(companyId, row.approvedByUserId!))) blockers.push("approver_unavailable");
    const line = (await activeLines(companyId)).find(item => item.endpointId === row.endpointId && item.assignedAgentId === row.assigneeAgentId);
    if (!line) blockers.push("connector_unavailable");
    const [agent] = await db.select({ status: agents.status }).from(agents).where(and(eq(agents.id, row.assigneeAgentId), eq(agents.companyId, companyId)));
    if (!agent || UNUSABLE_AGENT_STATUSES.includes(agent.status)) blockers.push("agent_unavailable");
    if (row.requestedByAgentId) {
      const [requester] = await db.select({ status: agents.status }).from(agents).where(and(eq(agents.id, row.requestedByAgentId), eq(agents.companyId, companyId)));
      if (!requester || UNUSABLE_AGENT_STATUSES.includes(requester.status)) blockers.push("requester_unavailable");
    }
    if (row.networkStartedAt) blockers.push("unknown_outcome");
    if (row.scheduledFor.getTime() + CRM_PHONE_MAX_LATE_MS < now.getTime()) blockers.push("window_missed");
    if (row.nextAttemptAt && row.nextAttemptAt > now) blockers.push("attempt_backoff");
    if (row.issueId) {
      const [task] = await db.select({ projectId: issues.projectId, status: issues.status, assigneeAgentId: issues.assigneeAgentId }).from(issues)
        .where(and(eq(issues.id, row.issueId), eq(issues.companyId, companyId)));
      if (!task || task.status === "cancelled" || task.status === "done" || task.assigneeAgentId !== row.assigneeAgentId) blockers.push("task_unavailable");
      const budgetBlock = task ? await budgetService(db).getInvocationBlock(companyId, row.assigneeAgentId, { issueId: row.issueId, projectId: task.projectId }) : null;
      if (budgetBlock) blockers.push("budget_blocked");
    }
    const concurrent = await db.select({ id: chatVoiceSessions.id }).from(chatVoiceSessions).where(and(
      eq(chatVoiceSessions.companyId, companyId), eq(chatVoiceSessions.mode, "outbound_phone"), inArray(chatVoiceSessions.state, ["reserved", "creating", "creation_unknown", "connecting", "active", "ending"]),
      sql`${chatVoiceSessions.expiresAt} > now()`,
    ));
    if (concurrent.length >= CRM_PHONE_MAX_CONCURRENT_DIALS) blockers.push("quota_company_concurrency");
    const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const contactToday = await db.select({ id: crmPhoneCallbacks.id }).from(crmPhoneCallbacks).where(and(
      eq(crmPhoneCallbacks.companyId, companyId), eq(crmPhoneCallbacks.contactId, row.contactId), eq(crmPhoneCallbacks.status, "dialed"), gte(crmPhoneCallbacks.dialedAt, utcDayStart),
    ));
    if (contactToday.length >= CRM_PHONE_MAX_CONTACT_DIALS_PER_DAY) blockers.push("quota_contact_daily");
    const connector = line ? { available: true, endpointId: line.endpointId, reason: null } : await connectorStatus(companyId);
    return { allowed: blockers.length === 0, blockers, endpointId: line?.endpointId ?? connector.endpointId, gateLevel: current };
  }

  /** Atomic final policy check and network-start fence called by voice immediately before provider I/O. */
  async function beginDial(input: { companyId: string; callbackId: string; claimToken: string; sessionId: string; endpointId: string; assigneeAgentId: string; phoneE164: string }) {
    const [snapshot] = await db.select().from(crmPhoneCallbacks).where(and(
      eq(crmPhoneCallbacks.id, input.callbackId), eq(crmPhoneCallbacks.companyId, input.companyId), eq(crmPhoneCallbacks.status, "dialing"),
      eq(crmPhoneCallbacks.claimToken, input.claimToken), sql`${crmPhoneCallbacks.claimExpiresAt} > now()`,
    ));
    if (!snapshot) throw conflict("CRM callback lease was lost before dialing");
    const decision = await authorizeDial(input.companyId, snapshot.id, undefined);
    if (decision.blockers.some(blocker => !["not_pending"].includes(blocker))) throw conflict("CRM callback no longer passes its dial policy", { code: "dial_not_authorized", blockers: decision.blockers });
    if (snapshot.endpointId !== input.endpointId || snapshot.assigneeAgentId !== input.assigneeAgentId || snapshot.phoneE164 !== input.phoneE164 || !snapshot.issueId) {
      throw conflict("CRM callback voice binding changed before dialing", { code: "dial_binding_changed" });
    }
    const now = new Date();
    const utcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`crm-phone-dial:${input.companyId}`}, 0))`);
      const [row] = await tx.select().from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.id, snapshot.id), eq(crmPhoneCallbacks.companyId, input.companyId), eq(crmPhoneCallbacks.status, "dialing"),
        eq(crmPhoneCallbacks.claimToken, input.claimToken), sql`${crmPhoneCallbacks.claimExpiresAt} > now()`, isNull(crmPhoneCallbacks.networkStartedAt),
      )).for("update");
      if (!row || row.endpointId !== input.endpointId || row.assigneeAgentId !== input.assigneeAgentId || row.phoneE164 !== input.phoneE164 || row.revision !== snapshot.revision || row.approvedRevision !== snapshot.approvedRevision) {
        throw conflict("CRM callback changed before dialing", { code: "dial_binding_changed" });
      }
      const active = await tx.select({ id: chatVoiceSessions.id }).from(chatVoiceSessions).where(and(
        eq(chatVoiceSessions.companyId, input.companyId), eq(chatVoiceSessions.mode, "outbound_phone"), inArray(chatVoiceSessions.state, ["reserved", "creating", "creation_unknown", "connecting", "active", "ending"]),
        sql`${chatVoiceSessions.expiresAt} > now()`,
      ));
      if (active.length > CRM_PHONE_MAX_CONCURRENT_DIALS) throw conflict("Company phone concurrency limit reached", { code: "quota_company_concurrency" });
      const daily = await tx.select({ id: crmPhoneCallbacks.id }).from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.companyId, input.companyId), eq(crmPhoneCallbacks.contactId, row.contactId), eq(crmPhoneCallbacks.status, "dialed"), gte(crmPhoneCallbacks.dialedAt, utcDay),
      ));
      if (daily.length >= CRM_PHONE_MAX_CONTACT_DIALS_PER_DAY) throw conflict("Contact daily callback limit reached", { code: "quota_contact_daily" });
      const [updated] = await tx.update(crmPhoneCallbacks).set({ networkStartedAt: now, dialAttempts: sql`${crmPhoneCallbacks.dialAttempts} + 1`, lastEvaluatedAt: now, lastBlockers: [], updatedAt: now })
        .where(and(eq(crmPhoneCallbacks.id, row.id), eq(crmPhoneCallbacks.status, "dialing"), eq(crmPhoneCallbacks.claimToken, input.claimToken), isNull(crmPhoneCallbacks.networkStartedAt))).returning({ id: crmPhoneCallbacks.id });
      if (!updated) throw conflict("CRM callback network-start fence was lost");
      return { started: true as const, sessionId: input.sessionId };
    });
  }

  /** Only called with a provider session created by voice.startCrmCallback, never exposed on HTTP. */
  async function recordExecutedReceipt(companyId: string, callbackId: string, claimToken: string, sessionId: string) {
    return db.transaction(async tx => {
      const [row] = await tx.select().from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.id, callbackId), eq(crmPhoneCallbacks.companyId, companyId), eq(crmPhoneCallbacks.status, "dialing"),
        eq(crmPhoneCallbacks.claimToken, claimToken), sql`${crmPhoneCallbacks.claimExpiresAt} > now()`, sql`${crmPhoneCallbacks.networkStartedAt} is not null`,
      )).for("update");
      const [session] = await tx.select().from(chatVoiceSessions).where(and(eq(chatVoiceSessions.id, sessionId), eq(chatVoiceSessions.companyId, companyId)));
      const expectedCaller = `${CRM_CALLBACK_CALLER_PREFIX}${callbackId}`;
      if (!row || !session || !session.providerSessionId || session.callerAuthority !== CRM_CALLBACK_CALLER_AUTHORITY || session.callerId !== expectedCaller
        || session.mode !== "outbound_phone" || session.endpointId !== row.endpointId || session.issueId !== row.issueId || session.assignedAgentId !== row.assigneeAgentId
        || !["connecting", "active", "ending", "ended"].includes(session.state)) throw conflict("The callback has no matching provider session receipt");
      const expectedFingerprint = createHash("sha256").update(JSON.stringify({ endpointId: row.endpointId, issueId: row.issueId, maxDurationSeconds: 600, mode: "outbound_phone", phoneNumber: row.phoneE164 })).digest("hex");
      if (session.requestFingerprint !== expectedFingerprint) throw conflict("Provider session is not bound to this approved contact number");
      const [updated] = await tx.update(crmPhoneCallbacks).set({ status: "dialed", dialSessionId: session.id, providerReceiptId: session.providerSessionId, dialedAt: new Date(), claimToken: null, claimExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(crmPhoneCallbacks.id, row.id), eq(crmPhoneCallbacks.status, "dialing"), eq(crmPhoneCallbacks.claimToken, claimToken))).returning();
      if (!updated) throw conflict("Callback receipt could not be committed");
      await tx.insert(activityLog).values({ companyId, actorType: "system", actorId: "crm-phone-executor", action: "crm_phone.callback_dialed", entityType: "crm_phone_callback", entityId: row.id, details: { sessionId: session.id, providerSessionId: session.providerSessionId } });
      return projectCallback(updated);
    });
  }

  /** Recover a committed provider receipt after worker loss; this never makes a provider call. */
  async function reconcilePersistedReceipt(companyId: string, callbackId: string) {
    return db.transaction(async tx => {
      const [row] = await tx.select().from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.id, callbackId), eq(crmPhoneCallbacks.companyId, companyId), eq(crmPhoneCallbacks.status, "dial_unknown"), isNull(crmPhoneCallbacks.dialSessionId),
      )).for("update");
      if (!row) return false;
      const [session] = await tx.select().from(chatVoiceSessions).where(and(
        eq(chatVoiceSessions.companyId, companyId), eq(chatVoiceSessions.callerId, `${CRM_CALLBACK_CALLER_PREFIX}${row.id}`),
        eq(chatVoiceSessions.callerAuthority, CRM_CALLBACK_CALLER_AUTHORITY), eq(chatVoiceSessions.endpointId, row.endpointId),
        eq(chatVoiceSessions.issueId, row.issueId!), eq(chatVoiceSessions.assignedAgentId, row.assigneeAgentId), eq(chatVoiceSessions.mode, "outbound_phone"),
        sql`${chatVoiceSessions.providerSessionId} is not null`, inArray(chatVoiceSessions.state, ["connecting", "active", "ending", "ended"]),
      )).orderBy(desc(chatVoiceSessions.createdAt)).limit(1);
      if (!session?.providerSessionId) return false;
      const expectedFingerprint = createHash("sha256").update(JSON.stringify({ endpointId: row.endpointId, issueId: row.issueId, maxDurationSeconds: 600, mode: "outbound_phone", phoneNumber: row.phoneE164 })).digest("hex");
      if (session.requestFingerprint !== expectedFingerprint) return false;
      const [updated] = await tx.update(crmPhoneCallbacks).set({ status: "dialed", dialSessionId: session.id, providerReceiptId: session.providerSessionId, dialedAt: new Date(), claimToken: null, claimExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(crmPhoneCallbacks.id, row.id), eq(crmPhoneCallbacks.status, "dial_unknown"), isNull(crmPhoneCallbacks.dialSessionId))).returning({ id: crmPhoneCallbacks.id });
      if (updated) await tx.insert(activityLog).values({ companyId, actorType: "system", actorId: "crm-phone-executor", action: "crm_phone.callback_dialed", entityType: "crm_phone_callback", entityId: row.id, details: { sessionId: session.id, providerSessionId: session.providerSessionId, reconciled: true } });
      return Boolean(updated);
    });
  }

  /** A newly recorded contact consent can unblock a durable request on a later scheduler tick. */
  async function refreshConsentedCallbacks(now = new Date()) {
    const waiting = await db.select().from(crmPhoneCallbacks).where(and(
      eq(crmPhoneCallbacks.status, "awaiting_consent"), lte(crmPhoneCallbacks.scheduledFor, now),
    )).orderBy(crmPhoneCallbacks.scheduledFor).limit(20);
    for (const snapshot of waiting) {
      const consentBasis = await evaluateConsent(db, snapshot.companyId, snapshot.contactId);
      if (consentBasis === "missing") continue;
      const gateLevel = (await autonomy.effectiveLevel(snapshot.companyId, snapshot.assigneeAgentId, "call")).level;
      if (gateLevel === "draft_only") continue;
      const status: CrmPhoneCallback["status"] = gateLevel === "send_direct" ? "pending" : "awaiting_approval";
      await db.transaction(async tx => {
        const [row] = await tx.select().from(crmPhoneCallbacks).where(and(eq(crmPhoneCallbacks.id, snapshot.id), eq(crmPhoneCallbacks.companyId, snapshot.companyId), eq(crmPhoneCallbacks.status, "awaiting_consent"))).for("update");
        if (!row) return;
        let task: typeof issues.$inferSelect | null = null;
        if (status === "pending" && !row.issueId) {
          const [contact] = await tx.select({ displayName: contacts.displayName }).from(contacts).where(and(eq(contacts.id, row.contactId), eq(contacts.companyId, row.companyId), isNull(contacts.archivedAt)));
          if (!contact) return;
          task = await createCallbackIssue(tx as DbTransaction, {
            companyId: row.companyId, contactName: contact.displayName, assigneeAgentId: row.assigneeAgentId, scheduledFor: row.scheduledFor,
            timezone: row.timezone, reason: row.reason, projectId: row.projectId, parentIssueId: null, idempotencyKey: row.idempotencyKey,
            actor: { agentId: row.requestedByAgentId, userId: row.requestedByUserId, runId: row.requestedByRunId },
          });
        }
        await tx.update(crmPhoneCallbacks).set({ status, consentBasis, gateLevel, issueId: task?.id ?? row.issueId, lastBlockers: null, updatedAt: now }).where(eq(crmPhoneCallbacks.id, row.id));
      });
    }
  }

  /** One bounded scheduler tick. The injected function is the trusted voice-session factory. */
  async function processNext(workerId: string, startVoiceCallback: (callbackId: string, claimToken: string) => Promise<{ id: string }>) {
    const now = new Date();
    const claimToken = `${workerId.trim().slice(0, 80) || "worker"}:${randomUUID()}`;
    await refreshConsentedCallbacks(now);
    const unknown = await db.select({ id: crmPhoneCallbacks.id, companyId: crmPhoneCallbacks.companyId }).from(crmPhoneCallbacks)
      .where(and(eq(crmPhoneCallbacks.status, "dial_unknown"), isNull(crmPhoneCallbacks.dialSessionId))).orderBy(crmPhoneCallbacks.updatedAt).limit(10);
    for (const candidate of unknown) await reconcilePersistedReceipt(candidate.companyId, candidate.id);
    const claimed = await db.transaction(async tx => {
      const stale = await tx.select().from(crmPhoneCallbacks).where(and(eq(crmPhoneCallbacks.status, "dialing"), lte(crmPhoneCallbacks.claimExpiresAt, now))).for("update", { skipLocked: true }).limit(20);
      for (const row of stale) {
        const observedClaim = row.claimToken === null ? isNull(crmPhoneCallbacks.claimToken) : eq(crmPhoneCallbacks.claimToken, row.claimToken);
        await tx.update(crmPhoneCallbacks).set(row.networkStartedAt
          ? { status: "dial_unknown", claimToken: null, claimExpiresAt: null, lastErrorCode: "lease_expired_after_network_start", updatedAt: now }
          : { status: "pending", claimToken: null, claimExpiresAt: null, lastErrorCode: "lease_expired_before_network_start", nextAttemptAt: now, updatedAt: now })
          .where(and(eq(crmPhoneCallbacks.id, row.id), eq(crmPhoneCallbacks.status, "dialing"), observedClaim));
      }
      const late = await tx.select({ id: crmPhoneCallbacks.id }).from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.status, "pending"), lte(crmPhoneCallbacks.scheduledFor, new Date(now.getTime() - CRM_PHONE_MAX_LATE_MS)),
      )).for("update", { skipLocked: true }).limit(50);
      for (const row of late) await tx.update(crmPhoneCallbacks).set({ status: "missed", lastBlockers: ["window_missed"], lastEvaluatedAt: now, updatedAt: now }).where(eq(crmPhoneCallbacks.id, row.id));
      const [row] = await tx.select().from(crmPhoneCallbacks).where(and(
        eq(crmPhoneCallbacks.status, "pending"), lte(crmPhoneCallbacks.scheduledFor, now), or(isNull(crmPhoneCallbacks.nextAttemptAt), lte(crmPhoneCallbacks.nextAttemptAt, now)),
        isNull(crmPhoneCallbacks.networkStartedAt),
      )).orderBy(crmPhoneCallbacks.scheduledFor, crmPhoneCallbacks.createdAt).for("update", { skipLocked: true }).limit(1);
      if (!row) return null;
      const [updated] = await tx.update(crmPhoneCallbacks).set({ status: "dialing", claimToken, claimExpiresAt: new Date(now.getTime() + 15 * 60_000), lastBlockers: null, updatedAt: now })
        .where(and(eq(crmPhoneCallbacks.id, row.id), eq(crmPhoneCallbacks.status, "pending"), isNull(crmPhoneCallbacks.networkStartedAt))).returning();
      return updated ?? null;
    });
    if (!claimed) return { claimed: false as const, callbackId: null, status: null };
    try {
      const session = await startVoiceCallback(claimed.id, claimToken);
      const callback = await recordExecutedReceipt(claimed.companyId, claimed.id, claimToken, session.id);
      return { claimed: true as const, callbackId: claimed.id, status: callback.status };
    } catch {
      const [current] = await db.select().from(crmPhoneCallbacks).where(and(eq(crmPhoneCallbacks.id, claimed.id), eq(crmPhoneCallbacks.companyId, claimed.companyId)));
      if (current?.status === "dialing" && current.claimToken === claimToken) {
        if (current.networkStartedAt) {
          await db.update(crmPhoneCallbacks).set({ status: "dial_unknown", claimToken: null, claimExpiresAt: null, lastErrorCode: "provider_outcome_unknown", updatedAt: new Date() })
            .where(and(eq(crmPhoneCallbacks.id, current.id), eq(crmPhoneCallbacks.status, "dialing"), eq(crmPhoneCallbacks.claimToken, claimToken)));
        } else {
          const decision = await authorizeDial(current.companyId, current.id);
          const blockers = decision.blockers.filter(blocker => blocker !== "not_pending");
          const status = blockers.includes("consent_missing") ? "awaiting_consent" : blockers.includes("approval_required") ? "awaiting_approval" : "pending";
          await db.update(crmPhoneCallbacks).set({ status, claimToken: null, claimExpiresAt: null, lastBlockers: blockers, lastEvaluatedAt: new Date(), nextAttemptAt: status === "pending" ? new Date(Date.now() + 5 * 60_000) : null, lastErrorCode: "dial_preflight_blocked", updatedAt: new Date() })
            .where(and(eq(crmPhoneCallbacks.id, current.id), eq(crmPhoneCallbacks.status, "dialing"), eq(crmPhoneCallbacks.claimToken, claimToken), isNull(crmPhoneCallbacks.networkStartedAt)));
        }
      }
      return { claimed: true as const, callbackId: claimed.id, status: current?.networkStartedAt ? "dial_unknown" as const : "pending" as const };
    }
  }

  return { connectorStatus, projectSession, sync, listCalls, getSummary, linkContact, schedule, listCallbacks, approve, cancel, authorizeDial, beginDial, recordExecutedReceipt, reconcilePersistedReceipt, refreshConsentedCallbacks, processNext };
}
