import { and, asc, desc, eq, gte, isNull, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, autonomyBenchRuns, autonomyPolicies, autonomyShadowStats, routines, routineTriggers } from "@paperclipai/db";
import {
  AUTONOMY_ACTION_TYPES,
  AUTONOMY_LEVEL_RANK,
  minAutonomyLevel,
  type AutonomyActionType,
  type AutonomyBenchRun,
  type AutonomyEffectiveLevel,
  type AutonomyLevel,
  type AutonomyMatrixCell,
  type AutonomyPolicy,
  type AutonomyShadowStats,
  type GrantAutonomyInput,
  type RecordShadowOutcomeInput,
  type RevokeAutonomyInput,
} from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

/** Score an agent-specific bench must reach before its level can be raised above draft_only. */
export const DEFAULT_AUTONOMY_BENCH_THRESHOLD = 0.85;
/** Shadow statistics window used by the matrix and by raise proposals. */
export const AUTONOMY_STATS_WINDOW_DAYS = 14;
/** Raise proposal thresholds: enough drafts and a high share sent without edits. */
export const AUTONOMY_RAISE_MIN_DRAFTS = 20;
export const AUTONOMY_RAISE_MIN_UNCHANGED_RATIO = 0.9;

export interface AutonomyServiceDeps {
  /** Sprint 2 cancels queued messages for the agent and action type here. */
  onRevoke?: (input: { companyId: string; agentId: string | null; actionType: AutonomyActionType }) => Promise<void>;
  /** Sprint 3 WP5 creates a `raise_autonomy` decision here. Returns null when no decision was created. */
  createRaiseDecision?: (input: {
    companyId: string;
    agentId: string;
    actionType: AutonomyActionType;
    fromLevel: AutonomyLevel;
    toLevel: AutonomyLevel;
    stats: AutonomyShadowStats;
  }) => Promise<{ decisionId: string } | null>;
}

export interface AutonomyActor {
  userId?: string | null;
  agentId?: string | null;
}

export interface RaiseProposal {
  agentId: string;
  actionType: AutonomyActionType;
  fromLevel: AutonomyLevel;
  toLevel: AutonomyLevel;
  decisionId: string;
}

type PolicyRow = typeof autonomyPolicies.$inferSelect;
type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Helpers run on the pool or inside a transaction; only the query builder surface is used. */
type Queryable = Pick<Db | DbTransaction, "select" | "insert" | "update" | "execute">;

function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** First day (UTC, inclusive) of a window that covers `windowDays` days ending today. */
export function autonomyWindowStart(now: Date, windowDays: number) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return utcDateString(start);
}

function nextLevelOf(level: AutonomyLevel): AutonomyLevel | null {
  if (level === "send_direct") return null;
  return level === "draft_only" ? "send_with_approval" : "send_direct";
}

function emptyStats(agentId: string, actionType: AutonomyActionType, windowDays: number): AutonomyShadowStats {
  return { agentId, actionType, drafts: 0, sentUnchanged: 0, edited: 0, rejected: 0, unchangedRatio: null, windowDays };
}

/**
 * Pure resolution rule shared by effectiveLevel and the matrix.
 * Agent level: min(company grant or send_direct, agent grant or draft_only).
 * Without an agent grant the agent stays at draft_only, so agent autonomy must be granted explicitly.
 * Company-wide only (agentId null): the company grant or the draft_only default.
 */
function resolveLevel(
  companyId: string,
  agentId: string | null,
  actionType: AutonomyActionType,
  companyPolicy: PolicyRow | null,
  agentPolicy: PolicyRow | null,
): AutonomyEffectiveLevel {
  if (!agentId) {
    return {
      companyId, agentId, actionType,
      level: (companyPolicy?.level as AutonomyLevel | undefined) ?? "draft_only",
      source: companyPolicy ? "company" : "default",
      policyId: companyPolicy?.id ?? null,
    };
  }
  const companyLevel = (companyPolicy?.level as AutonomyLevel | undefined) ?? "send_direct";
  const agentLevel = (agentPolicy?.level as AutonomyLevel | undefined) ?? "draft_only";
  const level = minAutonomyLevel(companyLevel, agentLevel);
  // The agent side wins ties, so an agent-specific grant is reported as its own source.
  if (AUTONOMY_LEVEL_RANK[agentLevel] <= AUTONOMY_LEVEL_RANK[companyLevel]) {
    return { companyId, agentId, actionType, level, source: agentPolicy ? "agent" : "default", policyId: agentPolicy?.id ?? null };
  }
  return { companyId, agentId, actionType, level, source: "company", policyId: companyPolicy?.id ?? null };
}

async function activePolicy(db: Queryable, companyId: string, agentId: string | null, actionType: AutonomyActionType) {
  const [row] = await db.select().from(autonomyPolicies).where(and(
    eq(autonomyPolicies.companyId, companyId),
    agentId ? eq(autonomyPolicies.agentId, agentId) : isNull(autonomyPolicies.agentId),
    eq(autonomyPolicies.actionType, actionType),
    isNull(autonomyPolicies.revokedAt),
  )).orderBy(desc(autonomyPolicies.grantedAt), desc(autonomyPolicies.createdAt)).limit(1);
  return row ?? null;
}

async function assertAgentInCompany(db: Queryable, companyId: string, agentId: string) {
  const [row] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)));
  if (!row) throw notFound("Agent not found");
}

function lockKey(companyId: string, agentId: string | null, actionType: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`autonomy:${companyId}:${agentId ?? "company"}:${actionType}`}, 0))`;
}

async function aggregateStats(db: Queryable, companyId: string, windowDays: number, now: Date) {
  const rows = await db
    .select({
      agentId: autonomyShadowStats.agentId,
      actionType: autonomyShadowStats.actionType,
      drafts: sql<number>`coalesce(sum(${autonomyShadowStats.drafts}), 0)::int`,
      sentUnchanged: sql<number>`coalesce(sum(${autonomyShadowStats.sentUnchanged}), 0)::int`,
      edited: sql<number>`coalesce(sum(${autonomyShadowStats.edited}), 0)::int`,
      rejected: sql<number>`coalesce(sum(${autonomyShadowStats.rejected}), 0)::int`,
    })
    .from(autonomyShadowStats)
    .where(and(eq(autonomyShadowStats.companyId, companyId), gte(autonomyShadowStats.periodStart, autonomyWindowStart(now, windowDays))))
    .groupBy(autonomyShadowStats.agentId, autonomyShadowStats.actionType);
  const byKey = new Map<string, AutonomyShadowStats>();
  for (const row of rows) {
    const drafts = Number(row.drafts);
    const sentUnchanged = Number(row.sentUnchanged);
    byKey.set(`${row.agentId}|${row.actionType}`, {
      agentId: row.agentId,
      actionType: row.actionType as AutonomyActionType,
      drafts,
      sentUnchanged,
      edited: Number(row.edited),
      rejected: Number(row.rejected),
      unchangedRatio: drafts > 0 ? sentUnchanged / drafts : null,
      windowDays,
    });
  }
  return byKey;
}

async function requirePassingBench(
  db: Queryable,
  companyId: string,
  agentId: string,
  actionType: AutonomyActionType,
  benchRunId: string | null | undefined,
) {
  const hint = "Run the autonomy bench first (POST /companies/:companyId/autonomy/bench) and pass its benchRunId";
  if (!benchRunId) throw conflict(`Raising this agent above draft_only needs a passing bench. ${hint}.`, { code: "autonomy_bench_required" });
  const [run] = await db.select().from(autonomyBenchRuns).where(and(
    eq(autonomyBenchRuns.id, benchRunId),
    eq(autonomyBenchRuns.companyId, companyId),
    eq(autonomyBenchRuns.agentId, agentId),
    eq(autonomyBenchRuns.actionType, actionType),
  ));
  const threshold = run?.threshold ?? DEFAULT_AUTONOMY_BENCH_THRESHOLD;
  if (!run || run.status !== "done" || run.score == null || run.score < threshold) {
    throw conflict(
      run && run.status === "done"
        ? `The bench scored ${run.score ?? "n/a"}, below the threshold ${threshold}. Improve the agent and run the bench again.`
        : `No passing bench for this agent and action type. ${hint}.`,
      { code: "autonomy_bench_required", benchRunId },
    );
  }
}

export function autonomyService(db: Db, deps: AutonomyServiceDeps = {}) {
  async function buildMatrix(companyId: string, now: Date): Promise<AutonomyMatrixCell[]> {
    const agentRows = await db.select({ id: agents.id }).from(agents)
      .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")))
      .orderBy(asc(agents.name), asc(agents.id));
    const activeRows = await db.select().from(autonomyPolicies).where(and(eq(autonomyPolicies.companyId, companyId), isNull(autonomyPolicies.revokedAt)));
    const benchRows = await db.selectDistinctOn([autonomyBenchRuns.agentId, autonomyBenchRuns.actionType])
      .from(autonomyBenchRuns)
      .where(eq(autonomyBenchRuns.companyId, companyId))
      .orderBy(asc(autonomyBenchRuns.agentId), asc(autonomyBenchRuns.actionType), desc(autonomyBenchRuns.createdAt));
    const stats = await aggregateStats(db, companyId, AUTONOMY_STATS_WINDOW_DAYS, now);

    const companyPolicies = new Map<string, PolicyRow>();
    const agentPolicies = new Map<string, PolicyRow>();
    for (const row of activeRows) {
      if (row.agentId) agentPolicies.set(`${row.agentId}|${row.actionType}`, row);
      else companyPolicies.set(row.actionType, row);
    }
    const benches = new Map<string, AutonomyBenchRun>();
    for (const row of benchRows) benches.set(`${row.agentId}|${row.actionType}`, row as unknown as AutonomyBenchRun);

    const cells: AutonomyMatrixCell[] = [];
    for (const agent of agentRows) {
      for (const actionType of AUTONOMY_ACTION_TYPES) {
        const key = `${agent.id}|${actionType}`;
        const effective = resolveLevel(companyId, agent.id, actionType, companyPolicies.get(actionType) ?? null, agentPolicies.get(key) ?? null);
        const latestBench = benches.get(key) ?? null;
        const threshold = latestBench?.threshold ?? DEFAULT_AUTONOMY_BENCH_THRESHOLD;
        const canRaise = latestBench?.status === "done"
          && latestBench.score != null
          && latestBench.score >= threshold
          && effective.level !== "send_direct";
        cells.push({
          agentId: agent.id,
          actionType,
          level: effective.level,
          source: effective.source,
          policyId: effective.policyId,
          stats: stats.get(key) ?? emptyStats(agent.id, actionType, AUTONOMY_STATS_WINDOW_DAYS),
          latestBench,
          canRaise,
          nextLevel: nextLevelOf(effective.level),
        });
      }
    }
    return cells;
  }

  return {
    async effectiveLevel(companyId: string, agentId: string | null, actionType: AutonomyActionType): Promise<AutonomyEffectiveLevel> {
      const companyPolicy = await activePolicy(db, companyId, null, actionType);
      const agentPolicy = agentId ? await activePolicy(db, companyId, agentId, actionType) : null;
      return resolveLevel(companyId, agentId, actionType, companyPolicy, agentPolicy);
    },

    async grant(companyId: string, input: GrantAutonomyInput, actor: AutonomyActor): Promise<AutonomyPolicy> {
      const agentId = input.agentId ?? null;
      if (agentId) await assertAgentInCompany(db, companyId, agentId);
      return db.transaction(async (tx) => {
        await tx.execute(lockKey(companyId, agentId, input.actionType));
        const current = await activePolicy(tx, companyId, agentId, input.actionType);
        const currentLevel = (current?.level as AutonomyLevel | undefined) ?? "draft_only";
        const raising = AUTONOMY_LEVEL_RANK[input.level] > AUTONOMY_LEVEL_RANK[currentLevel];
        if (agentId && input.level !== "draft_only" && raising) {
          await requirePassingBench(tx, companyId, agentId, input.actionType, input.benchRunId);
        }
        const now = new Date();
        await tx.update(autonomyPolicies).set({ revokedAt: now, revokedByUserId: actor.userId ?? null, revokedReason: "superseded" }).where(and(
          eq(autonomyPolicies.companyId, companyId),
          agentId ? eq(autonomyPolicies.agentId, agentId) : isNull(autonomyPolicies.agentId),
          eq(autonomyPolicies.actionType, input.actionType),
          isNull(autonomyPolicies.revokedAt),
        ));
        const [row] = await tx.insert(autonomyPolicies).values({
          companyId,
          agentId,
          actionType: input.actionType,
          level: input.level,
          grantedByUserId: actor.userId ?? null,
          grantedByAgentId: actor.agentId ?? null,
          grantedAt: now,
          reason: input.reason ?? null,
          benchRunId: input.benchRunId ?? null,
        }).returning();
        return row as unknown as AutonomyPolicy;
      });
    },

    async revoke(companyId: string, input: RevokeAutonomyInput, actor: AutonomyActor): Promise<{ policy: AutonomyPolicy; triggersDisabled: number }> {
      const agentId = input.agentId ?? null;
      if (agentId) await assertAgentInCompany(db, companyId, agentId);
      const result = await db.transaction(async (tx) => {
        await tx.execute(lockKey(companyId, agentId, input.actionType));
        const active = await activePolicy(tx, companyId, agentId, input.actionType);
        if (!active) throw notFound("No active autonomy grant for this agent and action type");
        const now = new Date();
        const [revoked] = await tx.update(autonomyPolicies).set({
          revokedAt: now,
          revokedByUserId: actor.userId ?? null,
          revokedReason: input.reason,
        }).where(eq(autonomyPolicies.id, active.id)).returning();
        // Playbook routines are the queued work this service owns. Routines do not record an
        // action type yet, so the cancellation covers every playbook routine assigned to the agent.
        const pending = await tx.select({ id: routineTriggers.id }).from(routineTriggers)
          .innerJoin(routines, eq(routines.id, routineTriggers.routineId))
          .where(and(
            eq(routineTriggers.companyId, companyId),
            eq(routines.companyId, companyId),
            eq(routines.originKind, "playbook"),
            eq(routineTriggers.enabled, true),
            eq(routineTriggers.archived, false),
            ...(agentId ? [eq(routines.assigneeAgentId, agentId)] : []),
          ));
        let triggersDisabled = 0;
        if (pending.length) {
          const updated = await tx.update(routineTriggers)
            .set({ enabled: false, updatedAt: now })
            .where(inArray(routineTriggers.id, pending.map((row) => row.id)))
            .returning({ id: routineTriggers.id });
          triggersDisabled = updated.length;
        }
        return { policy: revoked as unknown as AutonomyPolicy, triggersDisabled };
      });
      await deps.onRevoke?.({ companyId, agentId, actionType: input.actionType });
      return result;
    },

    async recordShadowOutcome(companyId: string, input: RecordShadowOutcomeInput) {
      await assertAgentInCompany(db, companyId, input.agentId);
      const periodStart = utcDateString(input.occurredAt ?? new Date());
      const inc = (outcome: RecordShadowOutcomeInput["outcome"]) => (input.outcome === outcome ? 1 : 0);
      // ON CONFLICT DO UPDATE with increments in SQL, so concurrent outcomes never lose counts.
      const [row] = await db.insert(autonomyShadowStats).values({
        companyId,
        agentId: input.agentId,
        actionType: input.actionType,
        periodStart,
        drafts: 1,
        sentUnchanged: inc("sent_unchanged"),
        edited: inc("edited"),
        rejected: inc("rejected"),
      }).onConflictDoUpdate({
        target: [autonomyShadowStats.companyId, autonomyShadowStats.agentId, autonomyShadowStats.actionType, autonomyShadowStats.periodStart],
        set: {
          drafts: sql`${autonomyShadowStats.drafts} + 1`,
          sentUnchanged: sql`${autonomyShadowStats.sentUnchanged} + ${inc("sent_unchanged")}`,
          edited: sql`${autonomyShadowStats.edited} + ${inc("edited")}`,
          rejected: sql`${autonomyShadowStats.rejected} + ${inc("rejected")}`,
          updatedAt: new Date(),
        },
      }).returning();
      return row!;
    },

    async stats(companyId: string, agentId: string, actionType: AutonomyActionType, windowDays = AUTONOMY_STATS_WINDOW_DAYS, now = new Date()): Promise<AutonomyShadowStats> {
      const [row] = await db
        .select({
          drafts: sql<number>`coalesce(sum(${autonomyShadowStats.drafts}), 0)::int`,
          sentUnchanged: sql<number>`coalesce(sum(${autonomyShadowStats.sentUnchanged}), 0)::int`,
          edited: sql<number>`coalesce(sum(${autonomyShadowStats.edited}), 0)::int`,
          rejected: sql<number>`coalesce(sum(${autonomyShadowStats.rejected}), 0)::int`,
        })
        .from(autonomyShadowStats)
        .where(and(
          eq(autonomyShadowStats.companyId, companyId),
          eq(autonomyShadowStats.agentId, agentId),
          eq(autonomyShadowStats.actionType, actionType),
          gte(autonomyShadowStats.periodStart, autonomyWindowStart(now, windowDays)),
        ));
      const drafts = Number(row?.drafts ?? 0);
      const sentUnchanged = Number(row?.sentUnchanged ?? 0);
      return {
        agentId,
        actionType,
        drafts,
        sentUnchanged,
        edited: Number(row?.edited ?? 0),
        rejected: Number(row?.rejected ?? 0),
        unchangedRatio: drafts > 0 ? sentUnchanged / drafts : null,
        windowDays,
      };
    },

    async history(companyId: string, agentId: string | null, actionType: AutonomyActionType): Promise<AutonomyPolicy[]> {
      const rows = await db.select().from(autonomyPolicies).where(and(
        eq(autonomyPolicies.companyId, companyId),
        agentId ? eq(autonomyPolicies.agentId, agentId) : isNull(autonomyPolicies.agentId),
        eq(autonomyPolicies.actionType, actionType),
      )).orderBy(desc(autonomyPolicies.grantedAt), desc(autonomyPolicies.createdAt));
      return rows as unknown as AutonomyPolicy[];
    },

    matrix(companyId: string, now = new Date()): Promise<AutonomyMatrixCell[]> {
      return buildMatrix(companyId, now);
    },

    /**
     * Proposes raising autonomy for cells whose shadow drafts pass the thresholds.
     * Skips a cell when a grant was made today (UTC) or when a bench is still running for it.
     */
    async proposeRaise(companyId: string, now = new Date()): Promise<RaiseProposal[]> {
      const cells = await buildMatrix(companyId, now);
      const dayStart = new Date(`${utcDateString(now)}T00:00:00.000Z`);
      const proposals: RaiseProposal[] = [];
      for (const cell of cells) {
        if (!cell.nextLevel) continue;
        const { stats } = cell;
        if (stats.drafts < AUTONOMY_RAISE_MIN_DRAFTS) continue;
        if (stats.unchangedRatio === null || stats.unchangedRatio < AUTONOMY_RAISE_MIN_UNCHANGED_RATIO) continue;
        const [grantedToday] = await db.select({ id: autonomyPolicies.id }).from(autonomyPolicies).where(and(
          eq(autonomyPolicies.companyId, companyId),
          eq(autonomyPolicies.agentId, cell.agentId),
          eq(autonomyPolicies.actionType, cell.actionType),
          isNull(autonomyPolicies.revokedAt),
          gte(autonomyPolicies.grantedAt, dayStart),
        )).limit(1);
        if (grantedToday) continue;
        const [running] = await db.select({ id: autonomyBenchRuns.id }).from(autonomyBenchRuns).where(and(
          eq(autonomyBenchRuns.companyId, companyId),
          eq(autonomyBenchRuns.agentId, cell.agentId),
          eq(autonomyBenchRuns.actionType, cell.actionType),
          eq(autonomyBenchRuns.status, "running"),
        )).limit(1);
        if (running) continue;
        const created = await deps.createRaiseDecision?.({
          companyId,
          agentId: cell.agentId,
          actionType: cell.actionType,
          fromLevel: cell.level,
          toLevel: cell.nextLevel,
          stats,
        });
        if (created) {
          proposals.push({ agentId: cell.agentId, actionType: cell.actionType, fromLevel: cell.level, toLevel: cell.nextLevel, decisionId: created.decisionId });
        }
      }
      return proposals;
    },
  };
}

export type AutonomyService = ReturnType<typeof autonomyService>;
