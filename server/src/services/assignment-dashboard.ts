import { deriveAssignmentStatus as deriveProductAssignmentStatus } from "./assignment-status.js";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { DashboardActiveAssignment, DashboardAssignmentSections, DashboardNeedsYouItem, DashboardSection } from "@paperclipai/shared";
import { activityLog, agents, approvals, decisions, deliverableReviews, goals, issues, type Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { assignmentCostService } from "./assignment-costs.js";

const ACTIVE_ASSIGNMENT_LIMIT = 10;
const NEEDS_YOU_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DerivedAssignmentStatus =
  | "planned" | "in_progress" | "awaiting_review" | "changes_requested" | "accepted" | "cancelled";

/**
 * Only the newest review of each target counts: a later `accepted` supersedes an
 * older `changes_requested` and a new `pending` supersedes both. Rows are
 * grouped by target (kind + id), not by version, so a resubmission replaces the
 * earlier verdict on the same deliverable.
 */
export function latestReviewStates(
  reviews: Array<{ targetKind: string; targetId: string; state: string; createdAt: Date | string }>,
): string[] {
  const latest = new Map<string, { state: string; at: number }>();
  for (const review of reviews) {
    const key = `${review.targetKind}:${review.targetId}`;
    const at = new Date(review.createdAt).getTime();
    const current = latest.get(key);
    if (!current || at >= current.at) latest.set(key, { state: review.state, at });
  }
  return [...latest.values()].map((entry) => entry.state);
}

/**
 * Assignment status from the goal, the root task and `latestReviewStates`.
 * Pure on purpose: `assignments.ts` should import this instead of keeping its own
 * copy of the rules (same precedence: cancelled, awaiting review, changes
 * requested, accepted, planned, in progress).
 */
export function deriveAssignmentStatus(input: {
  goalStatus: string; rootIssueStatus: string | null; reviewStates: string[];
}): DerivedAssignmentStatus {
  return deriveProductAssignmentStatus({ goalStatus: input.goalStatus, issueStatus: input.rootIssueStatus,
    reviews: input.reviewStates.map((state, index) => ({ state, targetKind: "summary", targetId: String(index) })) });
}

/** A section that fails must not take the dashboard down with it. */
async function section<T extends object>(name: string, build: () => Promise<T>): Promise<DashboardSection<T>> {
  try {
    return (await build()) as DashboardSection<T>;
  } catch (error) {
    // Details stay in the server log; database errors can carry SQL and ids.
    logger.warn({ err: error, section: name }, "dashboard section failed");
    return { error: "Section unavailable" };
  }
}

export function utcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function utcWeekStart(now: Date) {
  const day = utcDayStart(now);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS);
}

export function assignmentDashboardService(db: Db) {
  const costs = assignmentCostService(db);

  async function activeAssignments(companyId: string) {
    const goalRows = await db
      .select({
        id: goals.id, title: goals.title, status: goals.status, budgetCents: goals.budgetCents,
        assigneeAgentId: goals.assigneeAgentId, assigneeName: agents.name,
        rootIssueId: goals.rootIssueId, rootIssueStatus: issues.status, updatedAt: goals.updatedAt,
      })
      .from(goals)
      .leftJoin(agents, and(eq(agents.id, goals.assigneeAgentId), eq(agents.companyId, companyId)))
      .leftJoin(issues, and(eq(issues.id, goals.rootIssueId), eq(issues.companyId, companyId)))
      .where(and(eq(goals.companyId, companyId), eq(goals.kind, "assignment"), ne(goals.status, "cancelled"),
        sql`coalesce(${issues.status}, '') <> 'cancelled'`,
        sql`not (coalesce(${issues.status}, '') = 'done'
          and exists (select 1 from deliverable_reviews r where r.company_id = ${companyId} and r.goal_id = ${goals.id})
          and not exists (select 1 from (
            select distinct on (r.target_kind, r.target_id) r.state from deliverable_reviews r
            where r.company_id = ${companyId} and r.goal_id = ${goals.id}
            order by r.target_kind, r.target_id, r.created_at desc, r.id desc
          ) latest where latest.state <> 'accepted'))`))
      .orderBy(desc(goals.updatedAt))
      .limit(ACTIVE_ASSIGNMENT_LIMIT);
    if (goalRows.length === 0) return { items: [] as DashboardActiveAssignment[] };

    const goalIds = goalRows.map((row) => row.id);
    const rootIds = goalRows.flatMap((row) => (row.rootIssueId ? [row.rootIssueId] : []));
    const [reviewRows, eventRows, spend] = await Promise.all([
      db.select({
        goalId: deliverableReviews.goalId, targetKind: deliverableReviews.targetKind,
        targetId: deliverableReviews.targetId, state: deliverableReviews.state, createdAt: deliverableReviews.createdAt,
      })
        .from(deliverableReviews)
        .where(and(eq(deliverableReviews.companyId, companyId), inArray(deliverableReviews.goalId, goalIds))),
      rootIds.length === 0 ? Promise.resolve([]) : db.execute(sql`
        with recursive assignment_tasks(root_id, issue_id, depth) as (
          select g.root_issue_id, g.root_issue_id, 0 from goals g
          where g.company_id = ${companyId} and g.id in (${sql.join(goalIds.map(id => sql`${id}::uuid`), sql`, `)})
            and g.root_issue_id is not null
          union all
          select t.root_id, i.id, t.depth + 1 from assignment_tasks t join issues i on i.parent_id = t.issue_id
          where i.company_id = ${companyId} and t.depth < 64
        )
        select t.root_id as "entityId", max(a.created_at) as "createdAt" from assignment_tasks t
        join activity_log a on a.entity_id = t.issue_id::text and a.entity_type = 'issue' and a.company_id = ${companyId}
        group by t.root_id
      `).then(result => (Array.isArray(result) ? result : (result as unknown as { rows: unknown[] }).rows).map(value => {
        const row = value as { entityId: string; createdAt: Date | string };
        return { entityId: row.entityId, createdAt: new Date(row.createdAt) };
      })),
      costs.byGoal(companyId, { allTime: true }),
    ]);

    const reviewsByGoal = new Map<string, typeof reviewRows>();
    for (const row of reviewRows) {
      if (row.goalId) reviewsByGoal.set(row.goalId, [...(reviewsByGoal.get(row.goalId) ?? []), row]);
    }
    const lastEvent = new Map(eventRows.map((row) => [row.entityId, row.createdAt]));
    const spendByGoal = new Map(spend.rows.map((row) => [row.goalId, row.costCents]));

    const items: DashboardActiveAssignment[] = [];
    for (const row of goalRows) {
      const status = deriveAssignmentStatus({
        goalStatus: row.status, rootIssueStatus: row.rootIssueStatus, reviewStates: latestReviewStates(reviewsByGoal.get(row.id) ?? []),
      });
      if (status === "accepted" || status === "cancelled") continue;
      const eventAt = row.rootIssueId ? lastEvent.get(row.rootIssueId) : null;
      items.push({
        id: row.id, title: row.title, status,
        assigneeAgentId: row.assigneeAgentId, assigneeName: row.assigneeName,
        rootIssueId: row.rootIssueId,
        spendCents: spendByGoal.get(row.id) ?? 0,
        budgetCents: row.budgetCents,
        lastEventAt: (eventAt ?? row.updatedAt).toISOString(),
        href: `/assignments/${row.id}`,
      });
      if (items.length >= ACTIVE_ASSIGNMENT_LIMIT) break;
    }
    return { items };
  }

  async function needsYou(companyId: string) {
    const now = new Date();
    const [approvalRows, decisionRows, reviewRows, approvalCount, decisionCount, reviewCount] = await Promise.all([
      db.select({ id: approvals.id, type: approvals.type, createdAt: approvals.createdAt }).from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
        .orderBy(asc(approvals.createdAt)).limit(NEEDS_YOU_LIMIT),
      db.select({ id: decisions.id, title: decisions.title, createdAt: decisions.createdAt }).from(decisions)
        .where(and(eq(decisions.companyId, companyId), eq(decisions.status, "open"), gt(decisions.expiresAt, now)))
        .orderBy(asc(decisions.createdAt)).limit(NEEDS_YOU_LIMIT),
      db.select({
        id: deliverableReviews.id, goalId: deliverableReviews.goalId, issueId: deliverableReviews.issueId,
        targetKind: deliverableReviews.targetKind, targetVersion: deliverableReviews.targetVersion,
        createdAt: deliverableReviews.createdAt, goalTitle: goals.title, issueTitle: issues.title,
      }).from(deliverableReviews)
        .leftJoin(goals, and(eq(goals.id, deliverableReviews.goalId), eq(goals.companyId, companyId)))
        .leftJoin(issues, and(eq(issues.id, deliverableReviews.issueId), eq(issues.companyId, companyId)))
        .where(and(eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.state, "pending")))
        .orderBy(asc(deliverableReviews.createdAt)).limit(NEEDS_YOU_LIMIT),
      db.select({ count: sql<number>`count(*)::int` }).from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending"))),
      db.select({ count: sql<number>`count(*)::int` }).from(decisions)
        .where(and(eq(decisions.companyId, companyId), eq(decisions.status, "open"), gt(decisions.expiresAt, now))),
      db.select({ count: sql<number>`count(*)::int` }).from(deliverableReviews)
        .where(and(eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.state, "pending"))),
    ]);

    const items: DashboardNeedsYouItem[] = [
      ...approvalRows.map((row): DashboardNeedsYouItem => ({
        kind: "approval", id: row.id, title: row.type, createdAt: row.createdAt.toISOString(), href: `/approvals/${row.id}`,
      })),
      ...decisionRows.map((row): DashboardNeedsYouItem => ({
        kind: "decision", id: row.id, title: row.title, createdAt: row.createdAt.toISOString(), href: "/decisions",
      })),
      ...reviewRows.map((row): DashboardNeedsYouItem => ({
        kind: "deliverable_review", id: row.id,
        title: row.goalTitle ?? row.issueTitle ?? `${row.targetKind} ${row.targetVersion}`,
        createdAt: row.createdAt.toISOString(),
        href: row.goalId ? `/assignments/${row.goalId}` : row.issueId ? `/issues/${row.issueId}` : "/artifacts",
      })),
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      items,
      counts: {
        approvals: Number(approvalCount[0]?.count ?? 0),
        decisions: Number(decisionCount[0]?.count ?? 0),
        deliverableReviews: Number(reviewCount[0]?.count ?? 0),
      },
    };
  }

  return {
    activeAssignments,
    needsYou,
    /** Every section is built independently; a failure only marks its own key. */
    sections: async (companyId: string, now = new Date()): Promise<DashboardAssignmentSections> => {
      const [activeAssignmentsSection, needsYouSection, costsToday, costsThisWeek] = await Promise.all([
        section("activeAssignments", () => activeAssignments(companyId)),
        section("needsYou", () => needsYou(companyId)),
        section("costsToday", () => costs.coverage(companyId, utcDayStart(now), now)),
        section("costsThisWeek", () => costs.coverage(companyId, utcWeekStart(now), now)),
      ]);
      return {
        activeAssignments: activeAssignmentsSection,
        needsYou: needsYouSection,
        costsToday,
        costsThisWeek,
      };
    },
  };
}
