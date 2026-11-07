import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  companyMemberships,
  commitments,
  contacts,
  commercialAutomationCursors,
  conversationMessages,
  conversations,
  crmActivities,
  customerContacts,
  leads,
  opportunities,
  playbookRuns,
  serviceAgreements,
} from "@paperclipai/db";
import type { CommercialTriggerEvent } from "@paperclipai/shared";
import { HttpError } from "../errors.js";
import { autonomyService, type AutonomyServiceDeps } from "./autonomy.js";
import { commercialTriggers, type CommercialTriggerDeps, type WaitingPlaybookRun } from "./commercial-triggers.js";
import { dailyBriefService, type DailyBriefDeps } from "./daily-brief.js";
import { playbookService } from "./playbooks.js";
import { assignmentService } from "./assignments.js";
import { serviceAgreementService, type ServiceAgreementDeps } from "./service-agreements.js";

const NO_REPLY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const LEAD_UNATTENDED_AFTER_MS = 24 * 60 * 60 * 1000;
const COMMITMENT_DUE_HORIZON_MS = 48 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;
const SOURCE_BATCH_LIMIT = 20;
const CURSOR_LEASE_MS = 120_000;
const SOURCE_LANES = ["crm_activity", "inbound_reply", "quiet_conversation", "unattended_lead", "due_commitment"] as const;
type SourceLane = (typeof SOURCE_LANES)[number];
type SourcedTriggerEvent = { lane: SourceLane; sourceId: string; event: CommercialTriggerEvent };
type CursorLease = { lane: SourceLane; lastSourceId: string | null; leaseToken: string };

export interface CommercialAutomationDeps {
  /** Optional authorized channel adapter; see DailyBriefDeps. Missing means no external delivery. */
  dailyBrief?: DailyBriefDeps;
  /** Only callbacks backed by a real agent/run may create a commercial decision. */
  autonomy?: AutonomyServiceDeps;
  agreements?: ServiceAgreementDeps;
  /** WP6's routine/playbook boundary. */
  triggers?: Omit<CommercialTriggerDeps, "findWaitingRuns" | "advanceRun" | "stopSequence" | "isUnsubscribed">;
  now?: () => Date;
}

export interface CommercialAutomationTickResult {
  triggerEvents: number;
  triggerLaneFailures: number;
  advancedRuns: number;
  stoppedRuns: number;
  agreementPeriodsStarted: number;
  renewalTasksCreated: number;
  autonomyProposals: number;
  dailyBriefsAttempted: number;
  dailyBriefsDelivered: number;
  dailyBriefHandoffsCreated: number;
}

function iso(value: Date) { return value.toISOString(); }

/**
 * Durable commercial maintenance. All source scans are bounded. Events are replay-safe:
 * activity/message timestamps fence playbook runs, due commitments are anchored to their due
 * date, and each successful playbook transition is guarded by WP1's step compare-and-set.
 * The process scheduler owns only this `tick` entry point; transport and decision authority
 * remain explicit dependencies.
 */
export function commercialAutomation(db: Db, deps: CommercialAutomationDeps = {}) {
  const autonomy = autonomyService(db, deps.autonomy);
  const playbooks = playbookService(db, {
    resolveAgentAutonomy: async (companyId, agentId, actionType) =>
      (await autonomy.effectiveLevel(companyId, agentId, actionType as Parameters<typeof autonomy.effectiveLevel>[2])).level,
  });
  let activeEvent: CommercialTriggerEvent | undefined;
  const receiptRef = (runId: string, event: CommercialTriggerEvent) => {
    const eventId = typeof event.payload?.eventId === "string"
      ? event.payload.eventId
      : `${event.kind}:${event.subjectKind}:${event.subjectId}:${event.occurredAt}`;
    return `commercial-trigger:${runId}:${eventId}`.slice(0, 500);
  };
  async function hasReceipt(runId: string, event: CommercialTriggerEvent) {
    const ref = receiptRef(runId, event);
    const [row] = await db.select({ id: crmActivities.id }).from(crmActivities)
      .where(and(eq(crmActivities.companyId, event.companyId), eq(crmActivities.externalRef, ref))).limit(1);
    return Boolean(row);
  }
  async function recordReceipt(runId: string, event: CommercialTriggerEvent, outcome: string) {
    const ref = receiptRef(runId, event);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref}, 0))`);
      const [existing] = await tx.select({ id: crmActivities.id }).from(crmActivities)
        .where(and(eq(crmActivities.companyId, event.companyId), eq(crmActivities.externalRef, ref))).limit(1);
      if (existing) return;
      await tx.insert(crmActivities).values({
        companyId: event.companyId,
        subjectKind: event.subjectKind,
        subjectId: event.subjectId,
        kind: "system",
        summary: `Commercial trigger ${outcome}`,
        payload: { eventKind: event.kind, runId, reason: event.payload?.reason ?? null },
        externalRef: ref,
        occurredAt: new Date(event.occurredAt),
      });
    });
  }
  const triggers = commercialTriggers(db, {
    ...deps.triggers,
    findWaitingRuns: async (companyId, subjectKind, subjectId) => {
      const rows = await db.select().from(playbookRuns).where(and(
        eq(playbookRuns.companyId, companyId),
        eq(playbookRuns.subjectKind, subjectKind),
        eq(playbookRuns.subjectId, subjectId),
        eq(playbookRuns.status, "waiting"),
        activeEvent ? lte(playbookRuns.updatedAt, new Date(activeEvent.occurredAt)) : undefined,
        activeEvent?.kind === "no_reply" && typeof activeEvent.payload?.sentAt === "string"
          ? lte(playbookRuns.createdAt, new Date(activeEvent.payload.sentAt))
          : undefined,
      )).orderBy(asc(playbookRuns.nextActionAt), asc(playbookRuns.id)).limit(BATCH_LIMIT);
      const output: WaitingPlaybookRun[] = [];
      for (const run of rows) {
        if (activeEvent && await hasReceipt(run.id, activeEvent)) continue;
        const version = await playbooks.getById(run.playbookId);
        output.push({
          id: run.id,
          currentStepKind: version?.steps[run.currentStepIndex]?.kind ?? "unknown",
          nextActionAt: run.nextActionAt ? iso(run.nextActionAt) : null,
          currentStepIndex: run.currentStepIndex,
        });
      }
      return output;
    },
    advanceRun: async (runId, reason) => {
      const run = await playbooks.getRun(runId);
      if (!run || run.status !== "waiting") return;
      try {
        await playbooks.advance(runId, { outcome: "done", note: reason, expectedStepIndex: run.currentStepIndex }, {});
        if (activeEvent) await recordReceipt(runId, activeEvent, "advanced");
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 409)) throw error;
      }
    },
    stopSequence: async (runId, reason) => {
      const run = await playbooks.getRun(runId);
      if (!run || !["waiting", "running"].includes(run.status)) return;
      try {
        await playbooks.cancel(runId, {});
        if (activeEvent) await recordReceipt(runId, activeEvent, `stopped:${reason}`);
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 409)) throw error;
      }
    },
    isUnsubscribed: async (companyId, subjectKind, subjectId) => {
      let contactId: string | null = null;
      let channel: string | null = null;
      if (subjectKind === "conversation") {
        const [row] = await db.select({ contactId: conversations.contactId, channel: conversations.channel })
          .from(conversations).where(and(eq(conversations.id, subjectId), eq(conversations.companyId, companyId))).limit(1);
        contactId = row?.contactId ?? null;
        channel = row?.channel ?? null;
      } else if (subjectKind === "commitment") {
        const [row] = await db.select({ contactId: commitments.contactId, conversationId: commitments.conversationId }).from(commitments)
          .where(and(eq(commitments.id, subjectId), eq(commitments.companyId, companyId))).limit(1);
        contactId = row?.contactId ?? null;
        if (!contactId && row?.conversationId) {
          const [conversation] = await db.select({ contactId: conversations.contactId, channel: conversations.channel }).from(conversations)
            .where(and(eq(conversations.id, row.conversationId), eq(conversations.companyId, companyId))).limit(1);
          contactId = conversation?.contactId ?? null;
          channel = conversation?.channel ?? null;
        }
      } else if (subjectKind === "lead") {
        const [row] = await db.select({ contactId: leads.contactId }).from(leads)
          .where(and(eq(leads.id, subjectId), eq(leads.companyId, companyId))).limit(1);
        contactId = row?.contactId ?? null;
      } else if (subjectKind === "opportunity") {
        const [row] = await db.select({ contactId: opportunities.primaryContactId }).from(opportunities)
          .where(and(eq(opportunities.id, subjectId), eq(opportunities.companyId, companyId))).limit(1);
        contactId = row?.contactId ?? null;
      } else if (subjectKind === "customer") {
        const [row] = await db.select({ contactId: customerContacts.contactId }).from(customerContacts)
          .where(and(eq(customerContacts.customerId, subjectId), eq(customerContacts.companyId, companyId), eq(customerContacts.isPrimary, true))).limit(1);
        contactId = row?.contactId ?? null;
      }
      if (!contactId) return true;
      const [contact] = await db.select({ consents: contacts.consents, status: contacts.status, preferredChannel: contacts.preferredChannel }).from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId))).limit(1);
      if (!contact || contact.status !== "active") return true;
      channel ??= contact.preferredChannel;
      if (channel === "email" || channel === "whatsapp" || channel === "sms") return contact.consents?.[channel] !== true;
      return true;
    },
  });

  async function process(event: CommercialTriggerEvent) {
    activeEvent = event;
    try {
      return await triggers.handle(event);
    } finally {
      activeEvent = undefined;
    }
  }

  async function claimLane(lane: SourceLane): Promise<CursorLease | null> {
    await db.insert(commercialAutomationCursors).values({ lane }).onConflictDoNothing();
    return db.transaction(async (tx) => {
      const [cursor] = await tx.select().from(commercialAutomationCursors)
        .where(eq(commercialAutomationCursors.lane, lane)).for("update").limit(1);
      if (!cursor) throw new Error(`commercial cursor ${lane} was not initialized`);
      const now = new Date();
      if (cursor.leaseUntil && cursor.leaseUntil.getTime() > now.getTime()) return null;
      const leaseToken = randomUUID();
      const [claimed] = await tx.update(commercialAutomationCursors).set({
        leaseToken,
        leaseUntil: new Date(now.getTime() + CURSOR_LEASE_MS),
        updatedAt: now,
      }).where(and(eq(commercialAutomationCursors.lane, lane), eq(commercialAutomationCursors.updatedAt, cursor.updatedAt))).returning();
      return claimed ? { lane, lastSourceId: claimed.lastSourceId, leaseToken } : null;
    });
  }

  async function advanceCursor(lease: CursorLease, sourceId: string) {
    const now = new Date();
    const previous = lease.lastSourceId === null
      ? isNull(commercialAutomationCursors.lastSourceId)
      : eq(commercialAutomationCursors.lastSourceId, lease.lastSourceId);
    const [advanced] = await db.update(commercialAutomationCursors).set({
      lastSourceId: sourceId,
      leaseUntil: new Date(now.getTime() + CURSOR_LEASE_MS),
      updatedAt: now,
    }).where(and(
      eq(commercialAutomationCursors.lane, lease.lane),
      eq(commercialAutomationCursors.leaseToken, lease.leaseToken),
      previous,
    )).returning({ lane: commercialAutomationCursors.lane });
    if (!advanced) throw new Error(`commercial cursor ${lease.lane} lost its lease or compare-and-set`);
    lease.lastSourceId = sourceId;
  }

  async function releaseLane(lease: CursorLease) {
    await db.update(commercialAutomationCursors).set({ leaseToken: null, leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(commercialAutomationCursors.lane, lease.lane), eq(commercialAutomationCursors.leaseToken, lease.leaseToken)));
  }

  async function collectLaneEvents(lane: SourceLane, at: Date, cursorId: string | null): Promise<SourcedTriggerEvent[]> {
    const page = async <T>(selectAfter: (after: string | null, wrap: boolean) => Promise<T[]>, idOf: (row: T) => string) => {
      let rows = await selectAfter(cursorId, false);
      if (rows.length === 0 && cursorId) rows = await selectAfter(cursorId, true);
      return rows.map((row) => ({ row, sourceId: idOf(row) }));
    };
    if (lane === "crm_activity") {
      const rows = await page((cursor, wrap) => db.select({
        id: crmActivities.id, companyId: crmActivities.companyId, subjectKind: crmActivities.subjectKind,
        subjectId: crmActivities.subjectId, kind: crmActivities.kind, occurredAt: crmActivities.occurredAt,
      }).from(crmActivities).where(and(
        inArray(crmActivities.kind, ["stage_change", "meeting"]),
        inArray(crmActivities.subjectKind, ["lead", "opportunity", "conversation", "customer"]),
        cursor ? (wrap ? lte(crmActivities.id, cursor) : gt(crmActivities.id, cursor)) : undefined,
      )).orderBy(asc(crmActivities.id)).limit(SOURCE_BATCH_LIMIT), (row) => row.id);
      return rows.map(({ row, sourceId }) => ({ lane, sourceId, event: {
        kind: row.kind === "meeting" ? "meeting_held" : "stage_changed",
        companyId: row.companyId,
        subjectKind: row.subjectKind as CommercialTriggerEvent["subjectKind"],
        subjectId: row.subjectId,
        occurredAt: iso(row.occurredAt),
        payload: { eventId: row.id },
      } }));
    }
    if (lane === "inbound_reply") {
      const rows = await page((cursor, wrap) => db.select({
        id: conversationMessages.id, companyId: conversationMessages.companyId,
        conversationId: conversationMessages.conversationId, createdAt: conversationMessages.createdAt,
      }).from(conversationMessages).where(and(
        eq(conversationMessages.direction, "inbound"), eq(conversationMessages.actorKind, "contact"),
        cursor ? (wrap ? lte(conversationMessages.id, cursor) : gt(conversationMessages.id, cursor)) : undefined,
      )).orderBy(asc(conversationMessages.id)).limit(SOURCE_BATCH_LIMIT), (row) => row.id);
      return rows.map(({ row, sourceId }) => ({ lane, sourceId, event: {
        kind: "stage_changed", companyId: row.companyId, subjectKind: "conversation", subjectId: row.conversationId,
        occurredAt: iso(row.createdAt), payload: { reason: "contact_replied", eventId: row.id },
      } }));
    }
    if (lane === "quiet_conversation") {
      const staleOutbound = new Date(at.getTime() - NO_REPLY_AFTER_MS);
      const rows = await page((cursor, wrap) => db.select({
        id: conversations.id, companyId: conversations.companyId,
        lastOutboundAt: conversations.lastOutboundAt, lastInboundAt: conversations.lastInboundAt,
      }).from(conversations).where(and(
        eq(conversations.status, "waiting_them"), isNotNull(conversations.lastOutboundAt),
        lte(conversations.lastOutboundAt, staleOutbound),
        or(isNull(conversations.lastInboundAt), lte(conversations.lastInboundAt, conversations.lastOutboundAt)),
        cursor ? (wrap ? lte(conversations.id, cursor) : gt(conversations.id, cursor)) : undefined,
      )).orderBy(asc(conversations.id)).limit(SOURCE_BATCH_LIMIT), (row) => row.id);
      return rows.flatMap(({ row, sourceId }) => row.lastOutboundAt ? [{ lane, sourceId, event: {
        kind: "no_reply", companyId: row.companyId, subjectKind: "conversation", subjectId: row.id,
        occurredAt: iso(at), payload: {
          afterHours: Math.floor((at.getTime() - row.lastOutboundAt.getTime()) / 3_600_000),
          sentAt: iso(row.lastOutboundAt), eventId: `no_reply:${row.id}:${iso(row.lastOutboundAt)}`,
        },
      } }] : []);
    }
    if (lane === "unattended_lead") {
      const unattendedBefore = new Date(at.getTime() - LEAD_UNATTENDED_AFTER_MS);
      const rows = await page((cursor, wrap) => db.select({ id: leads.id, companyId: leads.companyId, createdAt: leads.createdAt })
        .from(leads).where(and(
          eq(leads.status, "new"), lte(leads.createdAt, unattendedBefore),
          cursor ? (wrap ? lte(leads.id, cursor) : gt(leads.id, cursor)) : undefined,
        )).orderBy(asc(leads.id)).limit(SOURCE_BATCH_LIMIT), (row) => row.id);
      return rows.map(({ row, sourceId }) => ({ lane, sourceId, event: {
        kind: "lead_unattended", companyId: row.companyId, subjectKind: "lead", subjectId: row.id,
        occurredAt: iso(at), payload: { eventId: `lead_unattended:${row.id}:${iso(row.createdAt)}` },
      } }));
    }
    const dueBefore = new Date(at.getTime() + COMMITMENT_DUE_HORIZON_MS);
    const dueAfter = new Date(at.getTime() - NO_REPLY_AFTER_MS);
    const rows = await page((cursor, wrap) => db.select({ id: commitments.id, companyId: commitments.companyId, dueAt: commitments.dueAt })
      .from(commitments).where(and(
        eq(commitments.status, "open"), isNotNull(commitments.dueAt), lte(commitments.dueAt, dueBefore), gte(commitments.dueAt, dueAfter),
        cursor ? (wrap ? lte(commitments.id, cursor) : gt(commitments.id, cursor)) : undefined,
      )).orderBy(asc(commitments.id)).limit(SOURCE_BATCH_LIMIT), (row) => row.id);
    return rows.flatMap(({ row, sourceId }) => row.dueAt ? [{ lane, sourceId, event: {
      kind: "commitment_due_soon", companyId: row.companyId, subjectKind: "commitment", subjectId: row.id,
      occurredAt: iso(at), payload: { eventId: `commitment_due:${row.id}:${iso(row.dueAt)}` },
    } }] : []);
  }

  async function collectEvents(at: Date): Promise<CommercialTriggerEvent[]> {
    const events: CommercialTriggerEvent[] = [];
    for (const lane of SOURCE_LANES) {
      const [cursor] = await db.select({ lastSourceId: commercialAutomationCursors.lastSourceId })
        .from(commercialAutomationCursors).where(eq(commercialAutomationCursors.lane, lane)).limit(1);
      events.push(...(await collectLaneEvents(lane, at, cursor?.lastSourceId ?? null)).map((item) => item.event));
    }
    return events;
  }

  let tickInFlight: Promise<CommercialAutomationTickResult> | null = null;
  async function runTick(at: Date): Promise<CommercialAutomationTickResult> {
    let triggerEvents = 0;
    let triggerLaneFailures = 0;
    let advancedRuns = 0;
    let stoppedRuns = 0;
    for (const lane of SOURCE_LANES) {
      const lease = await claimLane(lane);
      if (!lease) continue;
      try {
        const items = await collectLaneEvents(lane, at, lease.lastSourceId);
        for (const item of items) {
          try {
            const result = await process(item.event);
            advancedRuns += result.advanced;
            stoppedRuns += result.stopped;
            await advanceCursor(lease, item.sourceId);
            triggerEvents += 1;
          } catch {
            // Keep the cursor on the failed source row so the next tick retries it.
            triggerLaneFailures += 1;
            break;
          }
        }
      } catch {
        triggerLaneFailures += 1;
      } finally {
        await releaseLane(lease);
      }
    }

    const companies = await db.selectDistinct({ companyId: serviceAgreements.companyId }).from(serviceAgreements)
      .where(inArray(serviceAgreements.status, ["active", "notice"])).limit(BATCH_LIMIT);
    let agreementPeriodsStarted = 0;
    let renewalTasksCreated = 0;
    for (const { companyId } of companies) {
      const result = await serviceAgreementService(db, deps.agreements).tick(companyId, at);
      agreementPeriodsStarted += result.periodsStarted;
      renewalTasksCreated += result.renewalTasksCreated ?? 0;
    }

    const agentRows = await db.selectDistinct({ companyId: agents.companyId }).from(agents)
      .where(sql`${agents.status} not in ('terminated', 'pending_approval')`).limit(BATCH_LIMIT);
    let autonomyProposals = 0;
    for (const { companyId } of agentRows) autonomyProposals += (await autonomy.proposeRaise(companyId, at)).length;

    const brief = dailyBriefService(db, {
      ...deps.dailyBrief,
      requestDeliveryTask: deps.dailyBrief?.requestDeliveryTask ?? (async (input) => {
        if (!input.deliveryAgentId) return null;
        const [ownerMembership] = await db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
          eq(companyMemberships.companyId, input.companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, input.userId),
          eq(companyMemberships.status, "active"),
        )).limit(1);
        if (!ownerMembership) return null;
        const [agent] = await db.select({ id: agents.id }).from(agents).where(and(
          eq(agents.id, input.deliveryAgentId), eq(agents.companyId, input.companyId), inArray(agents.status, ["active", "idle", "running"]),
        )).limit(1);
        if (!agent) return null;
        const task = await assignmentService(db).create(input.companyId, {
          title: input.subject,
          description: [
            `Canal indicado por el propietario: ${input.channel}.`,
            `Propietario: ${input.userId}.`,
            "Entrega el resumen únicamente por un canal existente y autorizado. Usa message_send y sus gates de consentimiento/autonomía.",
            "No marques el resumen como entregado hasta tener un recibo confirmado del proveedor.",
            "",
            input.markdown,
          ].join("\n"),
          acceptanceCriteria: "- Usar message_send y sus gates existentes si hay destinatario/canal autorizados.\n- Registrar el recibo confirmado o explicar el bloqueo sin declarar entrega.",
          expectedDeliverable: "Recibo confirmado o bloqueo documentado",
          budgetCents: 0,
          projectId: null,
          assigneeAgentId: agent.id,
          idempotencyKey: input.idempotencyKey,
        }, { userId: input.userId, systemActorId: "daily-brief" });
        return { taskId: task.id };
      }),
    });
    const daily = await brief.tick(at);
    return {
      triggerEvents,
      triggerLaneFailures,
      advancedRuns,
      stoppedRuns,
      agreementPeriodsStarted,
      renewalTasksCreated,
      autonomyProposals,
      dailyBriefsAttempted: daily.attempted,
      dailyBriefsDelivered: daily.delivered,
      dailyBriefHandoffsCreated: daily.handoffsCreated,
    };
  }

  async function tick(at = deps.now?.() ?? new Date()): Promise<CommercialAutomationTickResult> {
    if (tickInFlight) return tickInFlight;
    const current = runTick(at);
    tickInFlight = current;
    try {
      return await current;
    } finally {
      if (tickInFlight === current) tickInFlight = null;
    }
  }

  return { tick, collectEvents };
}

export type CommercialAutomation = ReturnType<typeof commercialAutomation>;
