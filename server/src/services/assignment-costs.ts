import { eq, sql, type SQL } from "drizzle-orm";
import { normalizeCents } from "@paperclipai/shared";
import type {
  AssignmentCostTotals,
  GoalCostByAgent,
  GoalCostByDeliverable,
  GoalCostByProvider,
  GoalCostReport,
  GoalCostRow,
  GoalCostSummary,
} from "@paperclipai/shared";
import { goals, type Db } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { withAccountingReadSnapshot } from "./accounting-transaction.js";
import { resolveCostDateRange, type CostDateRange } from "./cost-date-range.js";
import { issueReadSqlCondition, type AuthorizationActor } from "./authorization.js";

const MAX_TREE_DEPTH = 64;

type Row = Record<string, unknown>;

function rowsOf(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

const num = (value: unknown) => Number(value ?? 0);
const str = (value: unknown) => (typeof value === "string" ? value : null);

const EMPTY_TOTALS: AssignmentCostTotals = {
  eventCount: 0, estimatedEventCount: 0, unpricedEventCount: 0,
  costCents: 0, costCentsExact: "0.0000000", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
};

const EXACT_SCALE = 7;

/** Exact decimal text (scale 7) to integer units, so sums never touch floats. */
function exactUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^[-+]/, "").split(".");
  const units = BigInt((whole || "0") + fraction.padEnd(EXACT_SCALE, "0").slice(0, EXACT_SCALE));
  return negative ? -units : units;
}

function exactText(units: bigint): string {
  const digits = (units < 0n ? -units : units).toString().padStart(EXACT_SCALE + 1, "0");
  return `${units < 0n ? "-" : ""}${digits.slice(0, -EXACT_SCALE)}.${digits.slice(-EXACT_SCALE)}`;
}

/** `costCents` is always the exact sum rendered as a number, never a second float aggregate. */
function totalsFrom(row: Row | undefined): AssignmentCostTotals {
  if (!row) return { ...EMPTY_TOTALS };
  const costCentsExact = normalizeCents(String(row.cost_cents_exact ?? "0"));
  return {
    eventCount: num(row.event_count),
    estimatedEventCount: num(row.estimated_event_count),
    unpricedEventCount: num(row.unpriced_event_count),
    costCents: Number(costCentsExact),
    costCentsExact,
    inputTokens: num(row.input_tokens),
    cachedInputTokens: num(row.cached_input_tokens),
    outputTokens: num(row.output_tokens),
  };
}

function addTotals(a: AssignmentCostTotals, b: AssignmentCostTotals): AssignmentCostTotals {
  const costCentsExact = exactText(exactUnits(a.costCentsExact) + exactUnits(b.costCentsExact));
  return {
    eventCount: a.eventCount + b.eventCount,
    estimatedEventCount: a.estimatedEventCount + b.estimatedEventCount,
    unpricedEventCount: a.unpricedEventCount + b.unpricedEventCount,
    costCents: Number(costCentsExact),
    costCentsExact,
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** Aggregates shared by every report. Columns come from the `ev` CTE below. */
const TOTAL_COLUMNS = sql`
  count(*)::int AS event_count,
  count(*) FILTER (WHERE ev.cost_status = 'estimated')::int AS estimated_event_count,
  count(*) FILTER (WHERE ev.cost_status = 'unpriced' AND ev.billing_type <> 'subscription_included')::int AS unpriced_event_count,
  coalesce(sum(ev.cost_cents), 0)::text AS cost_cents_exact,
  coalesce(sum(ev.ordinary_input_tokens), 0)::double precision AS input_tokens,
  coalesce(sum(ev.cached_input_tokens), 0)::double precision AS cached_input_tokens,
  coalesce(sum(ev.output_tokens), 0)::double precision AS output_tokens`;

/**
 * Common table expressions mapping every cost event to ONE effective goal.
 *
 * Receipts are immutable, so nothing is rewritten here. The effective goal of
 * an event is, in order: its stored assignment goal, the assignment whose task
 * tree contains the event's task (nearest root wins, so nested assignments
 * never count twice), then whatever goal the receipt stored.
 */
function eventScope(companyId: string, range?: CostDateRange): SQL {
  const bounds: SQL[] = [];
  if (range?.from) bounds.push(sql`AND ce.occurred_at >= ${range.from.toISOString()}::timestamptz`);
  if (range?.to) bounds.push(sql`AND ce.occurred_at <= ${range.to.toISOString()}::timestamptz`);
  return sql`
    tree(issue_id, goal_id, depth) AS (
      SELECT g.root_issue_id, g.id, 0 FROM goals g
      WHERE g.company_id = ${companyId} AND g.kind = 'assignment' AND g.root_issue_id IS NOT NULL
      UNION
      SELECT i.id, t.goal_id, t.depth + 1 FROM issues i
      JOIN tree t ON i.parent_id = t.issue_id
      WHERE i.company_id = ${companyId} AND t.depth < ${MAX_TREE_DEPTH}
    ),
    issue_goal AS (
      SELECT DISTINCT ON (issue_id) issue_id, goal_id FROM tree ORDER BY issue_id, depth ASC, goal_id ASC
    ),
    ev AS (
      SELECT ce.id, ce.agent_id, ce.issue_id, ce.provider, ce.usage_kind, ce.cost_status, ce.billing_type,
        ce.cost_cents, ce.cached_input_tokens, ce.output_tokens,
        CASE WHEN ce.receipt_hash IS NULL AND ce.provider = 'openai' AND ce.model NOT LIKE 'openai/_%'
          THEN greatest(0, ce.input_tokens - ce.cached_input_tokens) ELSE ce.input_tokens END AS ordinary_input_tokens,
        coalesce(CASE WHEN eg.kind = 'assignment' THEN ce.goal_id END, ig.goal_id, ce.goal_id) AS eff_goal_id
      FROM cost_events ce
      LEFT JOIN goals eg ON eg.id = ce.goal_id AND eg.company_id = ce.company_id
      LEFT JOIN issue_goal ig ON ig.issue_id = ce.issue_id
      WHERE ce.company_id = ${companyId} ${sql.join(bounds, sql` `)}
    )`;
}

/**
 * Nearest assignment for a task: walk up from the task to the first ancestor
 * (inclusive) that is an assignment's root task or points at an assignment.
 * Falls back to the task's own goal. Used to stamp new receipts.
 */
export async function resolveGoalIdForIssue(db: Pick<Db, "execute">, companyId: string, issueId: string): Promise<string | null> {
  const rows = rowsOf(await db.execute(sql`
    WITH RECURSIVE up(id, parent_id, goal_id, depth) AS (
      SELECT i.id, i.parent_id, i.goal_id, 0 FROM issues i WHERE i.id = ${issueId} AND i.company_id = ${companyId}
      UNION ALL
      SELECT p.id, p.parent_id, p.goal_id, up.depth + 1 FROM issues p
      JOIN up ON p.id = up.parent_id
      WHERE p.company_id = ${companyId} AND up.depth < ${MAX_TREE_DEPTH}
    )
    SELECT goal_id FROM (
      SELECT g.id AS goal_id, 0 AS rank, up.depth FROM up
      JOIN goals g ON g.company_id = ${companyId} AND g.kind = 'assignment' AND (g.root_issue_id = up.id OR g.id = up.goal_id)
      UNION ALL
      SELECT g.id, 1, up.depth FROM up
      JOIN goals g ON g.company_id = ${companyId} AND g.id = up.goal_id AND up.depth = 0
    ) candidates
    ORDER BY rank ASC, depth ASC LIMIT 1`));
  return str(rows[0]?.goal_id);
}

export function assignmentCostService(db: Db) {
  return {
    /** Unscoped lookup for route authorization; callers must check company access on the result. */
    findGoal: async (goalId: string) => {
      const [goal] = await db.select({ id: goals.id, companyId: goals.companyId }).from(goals).where(eq(goals.id, goalId));
      return goal ?? null;
    },

    /** Company-scoped report per goal. Events without any goal are `unattributed`. */
    byGoal: (companyId: string, range: CostDateRange | undefined, actor: AuthorizationActor): Promise<GoalCostReport> =>
      withAccountingReadSnapshot(db, companyId, async (tx) => {
        const bounds = resolveCostDateRange(range);
        const scope = eventScope(companyId, bounds);
        const issueReadCondition = await issueReadSqlCondition(tx, actor);
        const visibleGoals = rowsOf(await tx.execute(sql`
          SELECT g.id FROM goals g
          LEFT JOIN issues ON issues.id = g.root_issue_id AND issues.company_id = g.company_id
          WHERE g.company_id = ${companyId} AND g.kind = 'assignment'
            AND (g.root_issue_id IS NULL OR ${issueReadCondition})`));
        const visibleGoalIds = new Set(visibleGoals.map(row => String(row.id)));
        const [allTotals] = rowsOf(await tx.execute(sql`WITH RECURSIVE ${scope} SELECT ${TOTAL_COLUMNS} FROM ev`));
        const grouped = rowsOf(await tx.execute(sql`
          WITH RECURSIVE ${scope}
          SELECT ev.eff_goal_id AS goal_id, g.title, g.kind, g.status, g.budget_cents, ${TOTAL_COLUMNS}
          FROM ev LEFT JOIN goals g ON g.id = ev.eff_goal_id AND g.company_id = ${companyId}
          GROUP BY ev.eff_goal_id, g.title, g.kind, g.status, g.budget_cents`));
        // Assignments with no spend still belong in the report: budget is visible before the first event.
        const assignments = rowsOf(await tx.execute(sql`
          SELECT id, title, kind, status, budget_cents FROM goals WHERE company_id = ${companyId} AND kind = 'assignment'`));

        let unattributed = { ...EMPTY_TOTALS };
        const rows = new Map<string, GoalCostRow>();
        for (const row of grouped) {
          const goalId = str(row.goal_id);
          const totals = totalsFrom(row);
          if (!goalId || !str(row.title)) { unattributed = addTotals(unattributed, totals); continue; }
          if (String(row.kind) === "assignment" && !visibleGoalIds.has(goalId)) {
            // Keep company-level financial totals while suppressing all private
            // task attribution (including identifiers and titles).
            unattributed = addTotals(unattributed, totals);
            continue;
          }
          rows.set(goalId, {
            goalId, title: String(row.title), kind: String(row.kind), status: String(row.status),
            budgetCents: row.budget_cents == null ? null : num(row.budget_cents), ...totals,
          });
        }
        for (const row of assignments) {
          const goalId = String(row.id);
          if (!visibleGoalIds.has(goalId)) continue;
          if (rows.has(goalId)) continue;
          rows.set(goalId, {
            goalId, title: String(row.title), kind: String(row.kind), status: String(row.status),
            budgetCents: row.budget_cents == null ? null : num(row.budget_cents), ...EMPTY_TOTALS,
          });
        }
        const sorted = [...rows.values()].sort((a, b) => b.costCents - a.costCents || a.title.localeCompare(b.title));
        const total = totalsFrom(allTotals);
        return { companyId, rows: sorted, unattributed, total };
      }),

    /** All-time spend of one goal, including its descendant tasks. */
    goalSummary: (companyId: string, goalId: string, actor: AuthorizationActor): Promise<GoalCostSummary> =>
      withAccountingReadSnapshot(db, companyId, async (tx) => {
        const issueReadCondition = await issueReadSqlCondition(tx, actor);
        const goal = rowsOf(await tx.execute(sql`
          SELECT g.id, g.title, g.kind, g.budget_cents FROM goals g
          LEFT JOIN issues ON issues.id = g.root_issue_id AND issues.company_id = g.company_id
          WHERE g.id = ${goalId} AND g.company_id = ${companyId}
            AND (g.root_issue_id IS NULL OR ${issueReadCondition})`))[0];
        if (!goal) throw notFound("Goal not found");
        const scope = eventScope(companyId);
        const only = sql`WHERE ev.eff_goal_id = ${goalId}`;
        const [totalRows, agentRows, providerRows, deliverableRows] = await Promise.all([
          tx.execute(sql`WITH RECURSIVE ${scope} SELECT ${TOTAL_COLUMNS} FROM ev ${only}`),
          tx.execute(sql`WITH RECURSIVE ${scope}
            SELECT ev.agent_id, a.name AS agent_name, ${TOTAL_COLUMNS}
            FROM ev LEFT JOIN agents a ON a.id = ev.agent_id AND a.company_id = ${companyId}
            ${only} GROUP BY ev.agent_id, a.name ORDER BY sum(ev.cost_cents) DESC, a.name`),
          tx.execute(sql`WITH RECURSIVE ${scope}
            SELECT ev.provider, ev.usage_kind, ${TOTAL_COLUMNS} FROM ev
            ${only} GROUP BY ev.provider, ev.usage_kind ORDER BY sum(ev.cost_cents) DESC, ev.provider`),
          // One work product per task (primary, then newest) so a task with several
          // work products can never be counted more than once.
          tx.execute(sql`WITH RECURSIVE ${scope},
            wp AS (
              SELECT DISTINCT ON (issue_id) issue_id, id, title FROM issue_work_products
              WHERE company_id = ${companyId} ORDER BY issue_id, is_primary DESC, created_at DESC, id ASC
            )
            SELECT wp.id AS work_product_id, wp.title, ev.issue_id, ${TOTAL_COLUMNS}
            FROM ev LEFT JOIN wp ON wp.issue_id = ev.issue_id
            ${only} GROUP BY wp.id, wp.title, ev.issue_id ORDER BY sum(ev.cost_cents) DESC`),
        ]);
        const total = totalsFrom(rowsOf(totalRows)[0]);
        const byAgent: GoalCostByAgent[] = rowsOf(agentRows).map((row) => ({
          agentId: str(row.agent_id), agentName: str(row.agent_name), ...totalsFrom(row),
        }));
        const byProvider: GoalCostByProvider[] = rowsOf(providerRows).map((row) => ({
          provider: String(row.provider), usageKind: String(row.usage_kind), ...totalsFrom(row),
        }));
        // Tasks without a work product share one explicit bucket instead of one row per task.
        const deliverables = new Map<string, GoalCostByDeliverable>();
        for (const row of rowsOf(deliverableRows)) {
          const workProductId = str(row.work_product_id);
          const key = workProductId ?? "none";
          const totals = totalsFrom(row);
          const existing = deliverables.get(key);
          deliverables.set(key, existing
            ? { ...existing, ...addTotals(existing, totals) }
            : { workProductId, title: str(row.title), issueId: workProductId ? str(row.issue_id) : null, ...totals });
        }
        const budgetCents = goal.budget_cents == null ? null : num(goal.budget_cents);
        // Compare in exact units: fractional-cent spend must not hide an overrun.
        const budgetUnits = budgetCents == null ? null : BigInt(Math.trunc(budgetCents)) * 10n ** BigInt(EXACT_SCALE);
        const spentUnits = exactUnits(total.costCentsExact);
        return {
          companyId, goalId, title: String(goal.title), kind: String(goal.kind), budgetCents,
          remainingBudgetCents: budgetUnits == null ? null : Number(exactText(budgetUnits > spentUnits ? budgetUnits - spentUnits : 0n)),
          overBudget: budgetUnits != null && spentUnits > budgetUnits,
          total,
          byAgent,
          byProvider,
          byDeliverable: [...deliverables.values()].sort((a, b) => b.costCents - a.costCents),
          unattributed: totalsFrom(rowsOf(agentRows).find((row) => str(row.agent_id) === null)),
        };
      }),

    /**
     * Spend in a window split into assignment-attributed and unattributed, plus
     * whether pricing is complete (no unpriced events, no runs awaiting accounting).
     */
    coverage: (companyId: string, from: Date, to: Date) =>
      withAccountingReadSnapshot(db, companyId, async (tx) => {
        const scope = eventScope(companyId, { from, to });
        const [split] = rowsOf(await tx.execute(sql`
          WITH RECURSIVE ${scope}
          SELECT count(*)::int AS event_count,
            coalesce(sum(ev.cost_cents), 0)::text AS spend_cents,
            coalesce(sum(ev.cost_cents) FILTER (WHERE g.kind = 'assignment'), 0)::text AS assignment_cents,
            count(*) FILTER (WHERE ev.cost_status = 'unpriced' AND ev.billing_type <> 'subscription_included')::int AS unpriced_event_count
          FROM ev LEFT JOIN goals g ON g.id = ev.eff_goal_id AND g.company_id = ${companyId}`));
        const [pending] = rowsOf(await tx.execute(sql`
          SELECT count(*)::int AS pending_run_count FROM heartbeat_runs
          WHERE company_id = ${companyId} AND cost_accounting_pending = true
            AND status IN ('succeeded', 'failed', 'timed_out', 'cancelled', 'interrupted')
            AND coalesce(finished_at, created_at) >= ${from.toISOString()}::timestamptz
            AND coalesce(finished_at, created_at) <= ${to.toISOString()}::timestamptz`));
        const spendUnits = exactUnits(String(split?.spend_cents ?? "0"));
        const assignmentUnits = exactUnits(String(split?.assignment_cents ?? "0"));
        const spendCents = Number(exactText(spendUnits));
        const assignmentCents = Number(exactText(assignmentUnits));
        return {
          spendCents,
          eventCount: num(split?.event_count),
          assignmentCents,
          unattributedCents: Number(exactText(spendUnits > assignmentUnits ? spendUnits - assignmentUnits : 0n)),
          coveragePercent: spendUnits > 0n ? Number((Number((assignmentUnits * 10000n) / spendUnits) / 100).toFixed(2)) : null,
          pricingComplete: num(split?.unpriced_event_count) === 0 && num(pending?.pending_run_count) === 0,
          from: from.toISOString(),
          to: to.toISOString(),
        };
      }),
  };
}
