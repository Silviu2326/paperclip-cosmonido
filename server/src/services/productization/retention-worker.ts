import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyRetention, conversationMessages, conversations, retentionEvents, retentionSweeps } from "@paperclipai/db";
import { randomUUID } from "node:crypto";
import type { RetentionFileAdapter } from "./security.js";

const BATCH_SIZE = 100;
const LEASE_MS = 60_000;
const REDACTION = "[content removed by company retention policy]";

/** One caller-safe tick; DB lease tokens fence concurrent processes and each batch commits its cursor with work. */
export function createRetentionWorker(db: Db, input: { fileAdapter?: RetentionFileAdapter; workerId?: string } = {}) {
  const workerId = input.workerId ?? `retention-${randomUUID()}`;

  async function claim() {
    const now = new Date();
    const [candidate] = await db.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
      sql`${retentionSweeps.status} in ('pending','running')`,
      or(isNull(retentionSweeps.leaseExpiresAt), lt(retentionSweeps.leaseExpiresAt, now)),
    )).orderBy(asc(retentionSweeps.createdAt), asc(retentionSweeps.id)).limit(1);
    if (!candidate) return null;
    const leaseToken = `${workerId}:${randomUUID()}`;
    const [claimed] = await db.update(retentionSweeps).set({
      status: "running", leaseOwner: leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      attempts: sql`${retentionSweeps.attempts} + 1`, startedAt: sql`coalesce(${retentionSweeps.startedAt}, ${now})`, updatedAt: now,
    }).where(and(eq(retentionSweeps.id, candidate.id), sql`${retentionSweeps.status} in ('pending','running')`, or(isNull(retentionSweeps.leaseExpiresAt), lt(retentionSweeps.leaseExpiresAt, now)))).returning();
    return claimed ? { sweep: claimed, leaseToken } : null;
  }

  async function advancePhase(sweepId: string, companyId: string, leaseToken: string, policyRevision: number, nextPhase: "files" | "done") {
    return db.transaction(async (tx) => {
      const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
        eq(retentionSweeps.id, sweepId), eq(retentionSweeps.companyId, companyId), eq(retentionSweeps.leaseOwner, leaseToken),
        eq(retentionSweeps.policyRevision, policyRevision), eq(retentionSweeps.status, "running"), gt(retentionSweeps.leaseExpiresAt, new Date()),
      )).for("update").limit(1);
      const [currentPolicy] = await tx.select({ revision: companyRetention.revision }).from(companyRetention).where(and(
        eq(companyRetention.companyId, companyId), eq(companyRetention.revision, policyRevision),
      )).for("share").limit(1);
      if (!owned || !currentPolicy) return false;
      await tx.update(retentionSweeps).set({ phase: nextPhase, status: nextPhase === "done" ? "completed" : "running", leaseOwner: null, leaseExpiresAt: null, finishedAt: nextPhase === "done" ? new Date() : null, updatedAt: new Date() }).where(eq(retentionSweeps.id, sweepId));
      await tx.insert(retentionEvents).values({ companyId, sweepId, kind: nextPhase === "done" ? "sweep_completed" : "sweep_batch", actorType: "system", actorId: workerId, details: { phase: "conversations", nextPhase } });
      return true;
    });
  }

  async function tick() {
    const claimed = await claim();
    if (!claimed) return { status: "idle" as const };
    const { sweep, leaseToken } = claimed;
    const now = new Date();
    const [policy] = await db.select().from(companyRetention).where(eq(companyRetention.companyId, sweep.companyId)).limit(1);
    if (!policy || policy.revision !== sweep.policyRevision) {
      const changed = await db.transaction(async (tx) => {
        const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
          eq(retentionSweeps.id, sweep.id), eq(retentionSweeps.leaseOwner, leaseToken), eq(retentionSweeps.status, "running"), gt(retentionSweeps.leaseExpiresAt, new Date()),
        )).for("update").limit(1);
        const [currentPolicy] = await tx.select({ revision: companyRetention.revision }).from(companyRetention).where(eq(companyRetention.companyId, sweep.companyId)).for("share").limit(1);
        if (!owned || currentPolicy?.revision === sweep.policyRevision) return false;
        await tx.update(retentionSweeps).set({ status: "superseded", phase: "done", leaseOwner: null, leaseExpiresAt: null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(retentionSweeps.id, sweep.id));
        await tx.insert(retentionEvents).values({ companyId: sweep.companyId, sweepId: sweep.id, kind: "sweep_superseded", actorType: "system", actorId: workerId, details: { reason: "policy_revision_changed" } });
        return true;
      });
      return { status: changed ? "superseded" as const : "lease_lost" as const };
    }

    if (sweep.phase === "conversations" && (!policy.conversationsEnabled || !sweep.conversationsCutoff)) {
      const nextPhase = sweep.filesCutoff && policy.filesEnabled ? "files" : "done";
      const advanced = await advancePhase(sweep.id, sweep.companyId, leaseToken, sweep.policyRevision, nextPhase);
      return { status: advanced ? nextPhase === "done" ? "completed" as const : "phase_changed" as const : "lease_lost" as const, phase: nextPhase };
    }

    if (sweep.phase === "conversations" && sweep.conversationsCutoff && policy.conversationsEnabled) {
      const eligibility = and(
        eq(conversations.companyId, sweep.companyId), eq(conversations.status, "closed"), lt(conversations.updatedAt, sweep.conversationsCutoff),
      );
      const [cursorConversation] = sweep.conversationsCursor ? await db.select({ id: conversations.id }).from(conversations)
        .where(and(eligibility, eq(conversations.id, sweep.conversationsCursor))).limit(1) : [];
      const [cursorPendingMessage] = cursorConversation ? await db.select({ id: conversationMessages.id }).from(conversationMessages).where(and(
        eq(conversationMessages.companyId, sweep.companyId), eq(conversationMessages.conversationId, cursorConversation.id),
        lt(conversationMessages.createdAt, sweep.conversationsCutoff),
        sql`(${conversationMessages.body} <> ${REDACTION} or ${conversationMessages.attachments} <> '[]'::jsonb or ${conversationMessages.providerReceipt} is not null)`,
      )).limit(1) : [];
      const [candidate] = cursorPendingMessage ? [cursorConversation!] : await db.select({ id: conversations.id }).from(conversations).where(and(
        eligibility, sweep.conversationsCursor ? gt(conversations.id, sweep.conversationsCursor) : sql`true`,
      )).orderBy(asc(conversations.id)).limit(1);
      if (candidate) {
        const applied = await db.transaction(async (tx) => {
          const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
            eq(retentionSweeps.id, sweep.id), eq(retentionSweeps.leaseOwner, leaseToken), eq(retentionSweeps.policyRevision, sweep.policyRevision),
            eq(retentionSweeps.status, "running"), gt(retentionSweeps.leaseExpiresAt, new Date()),
          )).for("update").limit(1);
          const [currentPolicy] = await tx.select({ revision: companyRetention.revision }).from(companyRetention).where(and(
            eq(companyRetention.companyId, sweep.companyId), eq(companyRetention.revision, sweep.policyRevision), eq(companyRetention.conversationsEnabled, true),
          )).for("share").limit(1);
          if (!owned || !currentPolicy) return false;
          await tx.update(retentionSweeps).set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS), updatedAt: new Date() }).where(eq(retentionSweeps.id, sweep.id));
          const [conv] = await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, candidate.id), eq(conversations.companyId, sweep.companyId), eq(conversations.status, "closed"), lt(conversations.updatedAt, sweep.conversationsCutoff!))).for("update").limit(1);
          let redacted = 0;
          if (conv) {
            const pending = await tx.select({ id: conversationMessages.id }).from(conversationMessages).where(and(
              eq(conversationMessages.companyId, sweep.companyId), eq(conversationMessages.conversationId, candidate.id),
              lt(conversationMessages.createdAt, sweep.conversationsCutoff!),
              sql`(${conversationMessages.body} <> ${REDACTION} or ${conversationMessages.attachments} <> '[]'::jsonb or ${conversationMessages.providerReceipt} is not null)`,
            )).orderBy(asc(conversationMessages.id)).limit(BATCH_SIZE);
            if (pending.length) {
              const rows = await tx.update(conversationMessages).set({ body: REDACTION, attachments: [], providerReceipt: null, updatedAt: new Date() })
                .where(and(eq(conversationMessages.companyId, sweep.companyId), inArray(conversationMessages.id, pending.map((row) => row.id))))
                .returning({ id: conversationMessages.id });
              redacted = rows.length;
            }
          }
          const [remaining] = conv ? await tx.select({ id: conversationMessages.id }).from(conversationMessages).where(and(
            eq(conversationMessages.companyId, sweep.companyId), eq(conversationMessages.conversationId, candidate.id),
            lt(conversationMessages.createdAt, sweep.conversationsCutoff!),
            sql`(${conversationMessages.body} <> ${REDACTION} or ${conversationMessages.attachments} <> '[]'::jsonb or ${conversationMessages.providerReceipt} is not null)`,
          )).limit(1) : [];
          const continueConversation = Boolean(remaining);
          const next = continueConversation ? [] : await tx.select({ id: conversations.id }).from(conversations).where(and(
            eq(conversations.companyId, sweep.companyId), eq(conversations.status, "closed"), lt(conversations.updatedAt, sweep.conversationsCutoff!), gt(conversations.id, candidate.id),
          )).orderBy(asc(conversations.id)).limit(1);
          const nextPhase = continueConversation ? "conversations" : next.length ? "conversations" : sweep.filesCutoff && policy.filesEnabled ? "files" : "done";
          const [stillOwned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
            eq(retentionSweeps.id, sweep.id), eq(retentionSweeps.leaseOwner, leaseToken), eq(retentionSweeps.policyRevision, sweep.policyRevision),
            eq(retentionSweeps.status, "running"), gt(retentionSweeps.leaseExpiresAt, new Date()),
          )).limit(1);
          if (!stillOwned) throw new Error("retention_lease_lost_during_message_batch");
          await tx.update(retentionSweeps).set({
            ...(continueConversation ? {} : { conversationsCursor: candidate.id }), conversationsRedacted: sql`${retentionSweeps.conversationsRedacted} + ${continueConversation ? 0 : conv ? 1 : 0}`,
            messagesRedacted: sql`${retentionSweeps.messagesRedacted} + ${redacted}`, phase: nextPhase,
            status: nextPhase === "done" ? "completed" : "running", finishedAt: nextPhase === "done" ? new Date() : null,
            leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date(),
          }).where(and(eq(retentionSweeps.id, sweep.id), eq(retentionSweeps.leaseOwner, leaseToken)));
          await tx.insert(retentionEvents).values({ companyId: sweep.companyId, sweepId: sweep.id, kind: nextPhase === "done" ? "sweep_completed" : "sweep_batch", actorType: "system", actorId: workerId, details: { phase: "conversations", conversationVisited: candidate.id, conversationRedacted: Boolean(conv) && !continueConversation, messagesRedacted: redacted, nextPhase } });
          return true;
        });
        return { status: applied ? "processed" as const : "lease_lost" as const, phase: "conversations" as const };
      }
      const nextPhase = sweep.filesCutoff && policy.filesEnabled ? "files" : "done";
      const advanced = await advancePhase(sweep.id, sweep.companyId, leaseToken, sweep.policyRevision, nextPhase);
      return { status: advanced ? nextPhase === "done" ? "completed" as const : "phase_changed" as const : "lease_lost" as const, phase: nextPhase };
    }

    if (sweep.phase === "files" && sweep.filesCutoff && policy.filesEnabled) {
      const adapter = input.fileAdapter;
      if (!adapter) {
        const recorded = await db.transaction(async (tx) => {
          const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
            eq(retentionSweeps.id, sweep.id), eq(retentionSweeps.leaseOwner, leaseToken), eq(retentionSweeps.policyRevision, sweep.policyRevision),
            eq(retentionSweeps.status, "running"), gt(retentionSweeps.leaseExpiresAt, new Date()),
          )).for("update").limit(1);
          const [currentPolicy] = await tx.select({ revision: companyRetention.revision, filesEnabled: companyRetention.filesEnabled }).from(companyRetention).where(and(
            eq(companyRetention.companyId, sweep.companyId), eq(companyRetention.revision, sweep.policyRevision), eq(companyRetention.filesEnabled, true),
          )).for("share").limit(1);
          if (!owned || !currentPolicy) return false;
          await tx.update(retentionSweeps).set({ status: "failed", lastError: "retention_file_storage_adapter_missing", failures: sql`${retentionSweeps.failures} + 1`, leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(retentionSweeps.id, sweep.id));
          await tx.insert(retentionEvents).values({ companyId: sweep.companyId, sweepId: sweep.id, kind: "sweep_failed", actorType: "system", actorId: workerId, details: { code: "retention_file_storage_adapter_missing" } });
          return true;
        });
        return { status: recorded ? "blocked" as const : "lease_lost" as const, code: "retention_file_storage_adapter_missing" };
      }
      const result = await adapter.purgeBatch(sweep.companyId, sweep.filesCutoff, sweep.filesCursor, BATCH_SIZE, { sweepId: sweep.id, leaseOwner: leaseToken, policyRevision: sweep.policyRevision });
      const committed = await db.transaction(async (tx) => {
        const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
          eq(retentionSweeps.id, sweep.id), eq(retentionSweeps.leaseOwner, leaseToken), eq(retentionSweeps.policyRevision, sweep.policyRevision),
          eq(retentionSweeps.status, "running"), gt(retentionSweeps.leaseExpiresAt, new Date()),
        )).for("update").limit(1);
        const [currentPolicy] = await tx.select({ revision: companyRetention.revision, filesEnabled: companyRetention.filesEnabled }).from(companyRetention).where(and(
          eq(companyRetention.companyId, sweep.companyId), eq(companyRetention.revision, sweep.policyRevision), eq(companyRetention.filesEnabled, true),
        )).for("share").limit(1);
        if (!owned || !currentPolicy) return false;
        const done = result.done;
        await tx.update(retentionSweeps).set({ filesCursor: result.afterId, filesPurged: sql`${retentionSweeps.filesPurged} + ${result.deleted}`, versionsPurged: sql`${retentionSweeps.versionsPurged} + ${result.versions}`, bytesPurged: sql`${retentionSweeps.bytesPurged} + ${result.bytes}`, protectedSkipped: sql`${retentionSweeps.protectedSkipped} + ${result.protectedSkipped ?? 0}`, phase: done ? "done" : "files", status: done ? "completed" : "running", finishedAt: done ? new Date() : null, leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(retentionSweeps.id, sweep.id));
        await tx.insert(retentionEvents).values({ companyId: sweep.companyId, sweepId: sweep.id, kind: done ? "sweep_completed" : "sweep_batch", actorType: "system", actorId: workerId, details: { phase: "files", processed: result.processed, deleted: result.deleted, versions: result.versions, bytes: result.bytes, protectedSkipped: result.protectedSkipped ?? 0 } });
        return true;
      });
      return { status: committed ? "processed" as const : "lease_lost" as const, phase: "files" as const, processed: committed ? result.processed : 0 };
    }

    const advanced = await advancePhase(sweep.id, sweep.companyId, leaseToken, sweep.policyRevision, "done");
    return { status: advanced ? "completed" as const : "lease_lost" as const };
  }

  return { tick };
}
