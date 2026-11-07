import { readFileSync } from "node:fs";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, autonomyBenchRuns, decisionTrainingExamples } from "@paperclipai/db";
import {
  type AutonomyActionType,
  type AutonomyBenchCase,
  type AutonomyBenchFailure,
  type AutonomyBenchRun,
  type AutonomyBenchStatus,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { costService } from "./costs.js";
import { DEFAULT_AUTONOMY_BENCH_THRESHOLD } from "./autonomy.js";

export const AUTONOMY_BENCH_DIMENSIONS = ["appropriateness", "tone", "facts", "proposed_action"] as const;
export type AutonomyBenchDimension = (typeof AUTONOMY_BENCH_DIMENSIONS)[number];
/** A case scoring below this mean is recorded as a failure. */
export const AUTONOMY_BENCH_FAILURE_SCORE = 0.6;
export const AUTONOMY_BENCH_HEURISTIC_MODEL = "heuristic-v1";
const EXCERPT_LENGTH = 500;

export interface AutonomyBenchJudgement {
  scores: Record<AutonomyBenchDimension, number>;
  costCents: number;
  model: string;
}

/** Candidate-visible replay context. Keep reference answers and labels outside this type. */
export interface AutonomyBenchCandidateInput {
  caseId: string;
  actionType: AutonomyActionType;
  transcript: ReadonlyArray<Readonly<{ role: "contact" | "us" | "system"; text: string; at?: string | null }>>;
}

export interface AutonomyBenchDeps {
  judge?: (c: AutonomyBenchCase, candidate: string, context: { companyId: string; agentId: string }) => Promise<AutonomyBenchJudgement>;
  candidate?: (c: AutonomyBenchCandidateInput) => Promise<string>;
  /** The judge's own invocation ledger is authoritative; avoid a second aggregate charge. */
  judgeAccountsCost?: boolean;
  loadCases?: (companyId: string, actionType: AutonomyActionType, sampleSize: number) => Promise<AutonomyBenchCase[]>;
  defaultThreshold?: number;
}

export interface AutonomyBenchActor {
  userId?: string | null;
  agentId?: string | null;
}

export interface AutonomyBenchListFilters {
  agentId?: string;
  actionType?: AutonomyActionType;
  status?: AutonomyBenchStatus;
  limit?: number;
}

export interface AutonomyBenchRunOptions {
  sampleSize?: number;
  threshold?: number;
}

const FIXTURE_URL = new URL("./fixtures/autonomy-bench-cases.json", import.meta.url);

/** Deterministic fixture cases shipped with the server. Order is stable, so repeated runs match. */
export function loadFixtureCases(actionType: AutonomyActionType, sampleSize: number): AutonomyBenchCase[] {
  const all = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as AutonomyBenchCase[];
  return all.filter((item) => item.actionType === actionType).slice(0, sampleSize);
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function tokens(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Token-set F1 between candidate and reference. Deterministic, no model calls. */
export function tokenOverlapScore(candidate: string, reference: string) {
  const c = new Set(tokens(candidate));
  const r = new Set(tokens(reference));
  if (c.size === 0 && r.size === 0) return 1;
  if (c.size === 0 || r.size === 0) return 0;
  let shared = 0;
  for (const token of c) if (r.has(token)) shared += 1;
  if (shared === 0) return 0;
  const precision = shared / c.size;
  const recall = shared / r.size;
  return (2 * precision * recall) / (precision + recall);
}

function excerpt(text: string) {
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Candidate-side contract deliberately excludes reference material and source provenance. */
export function buildAutonomyBenchCandidateInput(item: AutonomyBenchCase): AutonomyBenchCandidateInput {
  return { caseId: item.caseId, actionType: item.actionType, transcript: item.transcript };
}

/**
 * Builds a replay case from a Sprint 1 decision training example. The snapshot holds the issue comments
 * up to the cut-off; the reference is the decision payload body. Only examples whose payload declares the
 * requested action type are used, because decision payloads do not record an autonomy action type yet.
 */
function caseFromTrainingExample(
  row: typeof decisionTrainingExamples.$inferSelect,
  actionType: AutonomyActionType,
): AutonomyBenchCase | null {
  const payload = (row.snapshot.decision?.payload ?? {}) as Record<string, unknown>;
  if (payload.actionType !== actionType) return null;
  const reference = textOf(payload.body);
  if (!reference) return null;
  const transcript = (row.snapshot.comments ?? []).flatMap((comment) => {
    const text = textOf(comment.body);
    if (!text) return [];
    const isUs = typeof comment.authorAgentId === "string" || typeof comment.authorUserId === "string";
    return [{ role: isUs ? "us" as const : "contact" as const, text, at: typeof comment.createdAt === "string" ? comment.createdAt : null }];
  });
  return {
    caseId: `decision-training:${row.id}`,
    actionType,
    transcript,
    reference: { text: reference, proposedAction: textOf(payload.proposedAction) },
    source: "decision_training_example",
    sourceId: row.id,
  };
}

export function autonomyBench(db: Db, deps: AutonomyBenchDeps = {}) {
  const candidateOf = deps.candidate;
  const judgeOf = deps.judge;
  const loadCases = deps.loadCases ?? (async (companyId: string, actionType: AutonomyActionType, sampleSize: number) => {
    // Closed conversations (Sprint 2) are not available yet, so decision training snapshots are used when
    // they match the action type. Otherwise the deterministic fixtures for that action type are used.
    const rows = await db.select().from(decisionTrainingExamples)
      .where(eq(decisionTrainingExamples.companyId, companyId))
      .orderBy(desc(decisionTrainingExamples.createdAt), desc(decisionTrainingExamples.id))
      .limit(Math.max(sampleSize * 5, sampleSize));
    const fromTraining = rows.flatMap((row) => {
      const item = caseFromTrainingExample(row, actionType);
      return item ? [item] : [];
    }).slice(0, sampleSize);
    return fromTraining.length ? fromTraining : loadFixtureCases(actionType, sampleSize);
  });

  async function evaluate(run: AutonomyBenchRun, companyId: string, agentId: string, actionType: AutonomyActionType, sampleSize: number, threshold: number) {
    const cases = await loadCases(companyId, actionType, sampleSize);
    if (cases.length === 0) throw new Error(`No hay casos para evaluar el tipo de acción "${actionType}"`);

    const failures: AutonomyBenchFailure[] = [];
    const caseScores: number[] = [];
    let costCents = 0;
    let judgeModel: string = AUTONOMY_BENCH_HEURISTIC_MODEL;
    for (const item of cases) {
      // These callbacks must come from a runtime adapter. Falling back to the
      // expected answer or token overlap would produce a passing score without
      // evaluating the agent.
      // Do not let the candidate adapter observe the reference, source, or row
      // identity. Only the pre-answer context is part of replay input.
      const candidate = await candidateOf!(buildAutonomyBenchCandidateInput(item));
      const judgement = await judgeOf!(item, candidate, { companyId, agentId });
      if (!judgement.model?.trim() || judgement.model === AUTONOMY_BENCH_HEURISTIC_MODEL) {
        throw new Error("The configured autonomy judge must identify a real model; heuristic scores cannot qualify an autonomy grant.");
      }
      judgeModel = judgement.model;
      costCents += judgement.costCents;
      const scores = AUTONOMY_BENCH_DIMENSIONS.map((dimension) => clampScore(judgement.scores[dimension]));
      const caseScore = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      caseScores.push(caseScore);
      if (caseScore < AUTONOMY_BENCH_FAILURE_SCORE) {
        let weakest = 0;
        for (let index = 1; index < scores.length; index += 1) if (scores[index]! < scores[weakest]!) weakest = index;
        failures.push({
          caseId: item.caseId,
          dimension: AUTONOMY_BENCH_DIMENSIONS[weakest]!,
          expected: excerpt(item.reference.text),
          actual: excerpt(candidate),
          score: round3(scores[weakest]!),
          note: null,
        });
      }
    }
    const score = round3(caseScores.reduce((sum, value) => sum + value, 0) / caseScores.length);
    const totalCostCents = round3(costCents);

    if (!deps.judgeAccountsCost) {
      await costService(db).createEvent(companyId, {
        agentId,
        usageKind: "autonomy_bench",
        provider: "paperclip",
        biller: "paperclip",
        model: judgeModel,
        costCents: totalCostCents,
        occurredAt: new Date(),
        idempotencyKey: `autonomy-bench:${run.id}`,
      });
    }

    const [finished] = await db.update(autonomyBenchRuns).set({
      status: "done",
      score,
      threshold,
      casesEvaluated: cases.length,
      failures,
      costCents: totalCostCents,
      judgeModel,
      error: null,
      finishedAt: new Date(),
    }).where(eq(autonomyBenchRuns.id, run.id)).returning();
    return finished as unknown as AutonomyBenchRun;
  }

  return {
    async run(companyId: string, agentId: string, actionType: AutonomyActionType, options: AutonomyBenchRunOptions, actor: AutonomyBenchActor): Promise<AutonomyBenchRun> {
      if (!candidateOf || !judgeOf) {
        throw unprocessable(
          "The autonomy bench is unavailable until a real agent replay adapter and model judge are configured. No bench run was created.",
          { code: "autonomy_bench_evaluator_unconfigured" },
        );
      }
      const [agent] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)));
      if (!agent) throw notFound("Agent not found");
      const sampleSize = options.sampleSize ?? 20;
      const threshold = options.threshold ?? deps.defaultThreshold ?? DEFAULT_AUTONOMY_BENCH_THRESHOLD;

      // The running check and the insert share one transaction and an advisory lock, so two requests cannot both start.
      const started = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`autonomy-bench:${companyId}:${agentId}:${actionType}`}, 0))`);
        const [running] = await tx.select({ id: autonomyBenchRuns.id }).from(autonomyBenchRuns).where(and(
          eq(autonomyBenchRuns.companyId, companyId),
          eq(autonomyBenchRuns.agentId, agentId),
          eq(autonomyBenchRuns.actionType, actionType),
          eq(autonomyBenchRuns.status, "running"),
        )).limit(1);
        if (running) throw conflict("Ya hay un banco de pruebas en curso para este agente y tipo de acción", { code: "autonomy_bench_running", runId: running.id });
        const [row] = await tx.insert(autonomyBenchRuns).values({
          companyId,
          agentId,
          actionType,
          sampleSize,
          status: "running",
          threshold,
          createdByUserId: actor.userId ?? null,
        }).returning();
        return row as unknown as AutonomyBenchRun;
      });

      try {
        return await evaluate(started, companyId, agentId, actionType, sampleSize, threshold);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const [failed] = await db.update(autonomyBenchRuns).set({
          status: "failed",
          error: message.slice(0, 2000),
          finishedAt: new Date(),
        }).where(eq(autonomyBenchRuns.id, started.id)).returning();
        return failed as unknown as AutonomyBenchRun;
      }
    },

    async list(companyId: string, filters: AutonomyBenchListFilters = {}): Promise<AutonomyBenchRun[]> {
      const conditions = [eq(autonomyBenchRuns.companyId, companyId)];
      if (filters.agentId) conditions.push(eq(autonomyBenchRuns.agentId, filters.agentId));
      if (filters.actionType) conditions.push(eq(autonomyBenchRuns.actionType, filters.actionType));
      if (filters.status) conditions.push(eq(autonomyBenchRuns.status, filters.status));
      const rows = await db.select().from(autonomyBenchRuns)
        .where(and(...conditions))
        .orderBy(desc(autonomyBenchRuns.createdAt), desc(autonomyBenchRuns.id))
        .limit(Math.min(filters.limit ?? 20, 100));
      return rows as unknown as AutonomyBenchRun[];
    },

    async getById(id: string): Promise<AutonomyBenchRun | null> {
      const [row] = await db.select().from(autonomyBenchRuns).where(eq(autonomyBenchRuns.id, id));
      return (row as unknown as AutonomyBenchRun | undefined) ?? null;
    },
  };
}

export type AutonomyBench = ReturnType<typeof autonomyBench>;
