import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { agents, commitments, conversations, type Db } from "@paperclipai/db";
import type { CommitmentCandidate, CommitmentsExtractInput } from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { assignmentService } from "./assignments.js";

export interface CommitmentActor {
  agentId?: string | null;
  runId?: string | null;
  userId?: string | null;
}

export interface CommitmentPersistResult {
  created: number;
  existing: number;
  /** Set when persistence is not available yet; the candidates are still returned to the caller. */
  unavailable?: string;
}

export interface CommitmentServiceDeps {
  persist?: (
    companyId: string,
    candidates: CommitmentCandidate[],
    actor: CommitmentActor,
    context: { conversationId: string },
  ) => Promise<CommitmentPersistResult>;
  alert?: (companyId: string, commitment: { id: string; dueAt: string }) => Promise<void>;
}

export const COMMITMENTS_UNAVAILABLE_REASON = "commitments table arrives with Sprint 2";

/** Lowercases, collapses whitespace and strips trailing punctuation so cosmetic edits share one fingerprint. */
export function normalizeCommitmentText(what: string): string {
  return what
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\p{P}\p{S}]+$/u, "")
    .trim();
}

/** sha256 of conversationId, who and the normalized text, joined with "|". Stable across whitespace and case. */
export function fingerprintCommitment(conversationId: string, who: "us" | "them", what: string): string {
  return createHash("sha256")
    .update(`${conversationId}|${who}|${normalizeCommitmentText(what)}`)
    .digest("hex");
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Normalizes agent-proposed candidates: one entry per fingerprint (the highest confidence wins), ISO due dates.
 * Pure: no persistence.
 */
export function normalizeCandidates(conversationId: string, input: CommitmentsExtractInput): CommitmentCandidate[] {
  const byFingerprint = new Map<string, CommitmentCandidate>();
  for (const candidate of input.candidates) {
    const fingerprint = fingerprintCommitment(conversationId, candidate.who, candidate.what);
    const next: CommitmentCandidate = {
      who: candidate.who,
      what: candidate.what.trim(),
      dueAt: toIsoOrNull(candidate.dueAt),
      confidence: candidate.confidence,
      fingerprint,
      evidence: candidate.evidence ?? null,
    };
    const current = byFingerprint.get(fingerprint);
    if (!current) {
      byFingerprint.set(fingerprint, next);
      continue;
    }
    // Keep the most confident proposal, but do not lose a due date that another duplicate carried.
    const winner = next.confidence > current.confidence ? next : current;
    byFingerprint.set(fingerprint, { ...winner, dueAt: winner.dueAt ?? current.dueAt ?? next.dueAt });
  }
  return [...byFingerprint.values()];
}

/**
 * Commitments whose due date has passed and that have not alerted yet. The caller records alertedAt
 * after alerting so each commitment alerts exactly once.
 */
export function dueAlerts(
  commitments: Array<{ id: string; dueAt: Date | string | null; alertedAt?: Date | string | null }>,
  now: Date,
): string[] {
  const nowMs = now.getTime();
  return commitments
    .filter((commitment) => {
      if (commitment.alertedAt) return false;
      if (!commitment.dueAt) return false;
      const dueMs = new Date(commitment.dueAt).getTime();
      return !Number.isNaN(dueMs) && dueMs <= nowMs;
    })
    .map((commitment) => commitment.id);
}

export function commitmentService(db: Db, deps: CommitmentServiceDeps = {}) {
  const assignments = assignmentService(db);

  async function extract(companyId: string, input: CommitmentsExtractInput, actor: CommitmentActor) {
    const candidates = normalizeCandidates(input.conversationId, input);
    const persisted: CommitmentPersistResult = deps.persist
      ? await deps.persist(companyId, candidates, actor, { conversationId: input.conversationId })
      : { created: 0, existing: 0, unavailable: COMMITMENTS_UNAVAILABLE_REASON };
    return { candidates, persisted };
  }

  /** Alerts for commitments due now. The caller passes the commitments it loaded and persists alertedAt for the returned ids. */
  async function alertDue(
    companyId: string,
    commitments: Array<{ id: string; dueAt: Date | string | null; alertedAt?: Date | string | null }>,
    now: Date = new Date(),
  ): Promise<string[]> {
    const ids = dueAlerts(commitments, now);
    if (deps.alert) {
      for (const id of ids) {
        const commitment = commitments.find((item) => item.id === id)!;
        await deps.alert(companyId, { id, dueAt: new Date(commitment.dueAt as Date | string).toISOString() });
      }
    }
    return ids;
  }

  /**
   * Confirms a detected commitment. Confirming an internal promise creates exactly one
   * assigned follow-up; replaying the confirmation uses the same assignment key. The
   * confirming board user is the authority for this transition, while company agent
   * membership is rechecked before assigning work.
   */
  async function confirm(companyId: string, commitmentId: string, actor: { userId: string }) {
    let newlyConfirmed = false;
    const commitment = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`commitment-confirm:${companyId}:${commitmentId}`}, 0))`);
      const [current] = await tx.select().from(commitments)
        .where(and(eq(commitments.id, commitmentId), eq(commitments.companyId, companyId)))
        .for("update").limit(1);
      if (!current) throw notFound("Commitment not found");
      if (current.status === "proposed") {
        const [updated] = await tx.update(commitments).set({ status: "open", updatedAt: new Date() })
          .where(and(eq(commitments.id, current.id), eq(commitments.companyId, companyId), eq(commitments.status, "proposed")))
          .returning();
        if (!updated) throw conflict("Commitment changed while confirming", { code: "version_conflict" });
        newlyConfirmed = true;
        return updated;
      }
      if (current.status !== "open") throw conflict(`Commitment is already ${current.status}`, { code: "already_resolved" });
      return current;
    });

    if (newlyConfirmed) {
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: actor.userId,
        action: "commitment.confirmed",
        entityType: "commitment",
        entityId: commitment.id,
        details: { who: commitment.who },
      });
    }

    if (commitment.who !== "us") return { commitment, assignment: null };

    const [conversation] = commitment.conversationId
      ? await db.select({ assignedAgentId: conversations.assignedAgentId }).from(conversations)
        .where(and(eq(conversations.id, commitment.conversationId), eq(conversations.companyId, companyId))).limit(1)
      : [];
    const [agent] = conversation?.assignedAgentId
      ? await db.select({ id: agents.id }).from(agents).where(and(
        eq(agents.id, conversation.assignedAgentId),
        eq(agents.companyId, companyId),
        inArray(agents.status, ["active", "idle", "running"]),
      )).limit(1)
      : [];
    if (!agent) throw unprocessable("El compromiso no tiene un agente responsable activo y autorizado en su conversación");
    const assignment = await assignments.create(companyId, {
      title: `Seguimiento: ${commitment.what}`.slice(0, 200),
      description: `Seguimiento creado al confirmar el compromiso.\nCompromiso: ${commitment.what}${commitment.dueAt ? `\nVence: ${commitment.dueAt.toISOString()}` : ""}`,
      acceptanceCriteria: `- Registrar el resultado del compromiso: ${commitment.what}`,
      expectedDeliverable: null,
      budgetCents: 0,
      projectId: null,
      assigneeAgentId: agent.id,
      idempotencyKey: `confirmed-commitment:${commitment.id}`,
    }, { userId: actor.userId });
    return { commitment, assignment };
  }

  return { extract, alertDue, confirm };
}

export type CommitmentService = ReturnType<typeof commitmentService>;
