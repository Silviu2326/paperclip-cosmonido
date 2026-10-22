import { createHash } from "node:crypto";
import type { Db } from "@paperclipai/db";
import type { CommitmentCandidate, CommitmentsExtractInput } from "@paperclipai/shared";

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
  persist?: (companyId: string, candidates: CommitmentCandidate[], actor: CommitmentActor) => Promise<CommitmentPersistResult>;
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
  async function extract(companyId: string, input: CommitmentsExtractInput, actor: CommitmentActor) {
    const candidates = normalizeCandidates(input.conversationId, input);
    const persisted: CommitmentPersistResult = deps.persist
      ? await deps.persist(companyId, candidates, actor)
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

  return { extract, alertDue };
}

export type CommitmentService = ReturnType<typeof commitmentService>;
