import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, goals, issueCreateIdempotencyKeys, issues, projects, deliverableReviews } from "@paperclipai/db";
import { issueService } from "./issues.js";
import { conflict, notFound } from "../errors.js";
import { createHash } from "node:crypto";
import { productizationEntitlementsService } from "./productization/entitlements.js";
import { logActivity, publishActivity, type ActivityPublication } from "./activity-log.js";

export { deriveAssignmentStatus } from "./assignment-status.js";
import { deriveAssignmentStatus } from "./assignment-status.js";

export function assignmentService(db: Db) {
  const getById = async (id: string) => {
    const [row] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.kind, "assignment")));
    if (!row) return null;
    const rootIssue = row.rootIssueId ? (await db.select().from(issues).where(and(eq(issues.id, row.rootIssueId), eq(issues.companyId, row.companyId))))[0] ?? null : null;
    const reviews = await db.select().from(deliverableReviews).where(and(eq(deliverableReviews.goalId, id), eq(deliverableReviews.companyId, row.companyId))).orderBy(desc(deliverableReviews.createdAt));
    const assignmentStatus = deriveAssignmentStatus({ goalStatus: row.status, issueStatus: rootIssue?.status, reviews });
    return { ...row, assignmentStatus, rootIssue };
  };
  return {
    getById,
    list: async (companyId: string, options: { limit?: number; cursor?: string; status?: string; issueReadCondition?: SQL<boolean> } = {}) => {
      const limit = Math.min(options.limit ?? 50, 100);
      const initialCursor = options.cursor ? (await db.select({ id: goals.id, createdAt: goals.createdAt }).from(goals).where(and(eq(goals.id, options.cursor), eq(goals.companyId, companyId), eq(goals.kind, "assignment"))))[0] : null;
      if (options.cursor && !initialCursor) return [];
      let cursor = initialCursor;
      const output: Array<Awaited<ReturnType<typeof getById>> & {}> = [];
      while (output.length < limit) {
        const cursorCondition = cursor ? or(lt(goals.createdAt, cursor.createdAt), and(eq(goals.createdAt, cursor.createdAt), lt(goals.id, cursor.id))) : undefined;
        const rows: (typeof goals.$inferSelect)[] = options.issueReadCondition
          ? (await db.select({ goal: goals }).from(goals)
            .leftJoin(issues, and(eq(issues.id, goals.rootIssueId), eq(issues.companyId, goals.companyId)))
            .where(and(
              eq(goals.companyId, companyId),
              eq(goals.kind, "assignment"),
              cursorCondition,
              or(isNull(issues.id), options.issueReadCondition),
            ))
            .orderBy(desc(goals.createdAt), desc(goals.id))
            .limit(options.status ? 100 : limit)).map(row => row.goal)
          : await db.select().from(goals)
            .where(and(eq(goals.companyId, companyId), eq(goals.kind, "assignment"), cursorCondition))
            .orderBy(desc(goals.createdAt), desc(goals.id))
            .limit(options.status ? 100 : limit);
        if (!rows.length) break;
        cursor = { id: rows[rows.length - 1]!.id, createdAt: rows[rows.length - 1]!.createdAt };
        const rootIds = rows.flatMap((row) => row.rootIssueId ? [row.rootIssueId] : []);
        const [tasks, reviews] = await Promise.all([
          rootIds.length ? db.select().from(issues).where(and(inArray(issues.id, rootIds), eq(issues.companyId, companyId))) : Promise.resolve([]),
          db.select().from(deliverableReviews).where(inArray(deliverableReviews.goalId, rows.map((row) => row.id))).orderBy(desc(deliverableReviews.createdAt)),
        ]);
        const taskById = new Map(tasks.map((task) => [task.id, task]));
        const reviewsByGoal = new Map<string, typeof reviews>();
        for (const review of reviews) reviewsByGoal.set(review.goalId!, [...(reviewsByGoal.get(review.goalId!) ?? []), review]);
        for (const row of rows) {
          const rootIssue = row.rootIssueId ? taskById.get(row.rootIssueId) ?? null : null;
          const assignmentStatus = deriveAssignmentStatus({ goalStatus: row.status, issueStatus: rootIssue?.status, reviews: reviewsByGoal.get(row.id) });
          if (!options.status || assignmentStatus === options.status) output.push({ ...row, rootIssue, assignmentStatus });
          if (output.length >= limit) break;
        }
        if (!options.status || rows.length < 100) break;
      }
      return output;
    },
    create: async (companyId: string, data: { title: string; description?: string | null; acceptanceCriteria: string; expectedDeliverable?: string | null; budgetCents: number; status?: string; priority?: string; workMode?: string; visibility?: "open" | "private"; projectId?: string | null; assigneeAgentId: string; idempotencyKey: string }, actor: { userId?: string | null; agentId?: string | null; systemActorId?: string }) => {
      const publications: ActivityPublication[] = [];
      const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`assignment:${companyId}:${data.idempotencyKey}`}, 0))`);
      // Domain admission covers board routes and scheduled/installed assignments.
      // Quota and assignment settle in the same transaction, including uncertain ACKs.
      const entitlements = productizationEntitlementsService(tx as unknown as Db);
      const reservation = await entitlements.reserveForCompany({ companyId, metric: "jobs_per_month", quantity: 1, idempotencyKey: `assignment:${companyId}:${data.idempotencyKey}`, requestFingerprint: createHash("sha256").update(JSON.stringify(data)).digest("hex") });
      const [key] = await tx.select().from(issueCreateIdempotencyKeys).where(and(eq(issueCreateIdempotencyKeys.companyId, companyId), eq(issueCreateIdempotencyKeys.idempotencyKey, data.idempotencyKey)));
      if (key) {
        const [existing] = await tx.select().from(goals).where(and(eq(goals.companyId, companyId), eq(goals.rootIssueId, key.issueId), eq(goals.kind, "assignment")));
        if (existing) {
          const rootIssue = (await tx.select().from(issues).where(eq(issues.id, key.issueId)))[0] ?? null;
          const reviews = await tx.select().from(deliverableReviews).where(eq(deliverableReviews.goalId, existing.id));
          await entitlements.commit(reservation);
          return { ...existing, assignmentStatus: deriveAssignmentStatus({ goalStatus: existing.status, issueStatus: rootIssue?.status, reviews }), rootIssue };
        }
        throw conflict("Idempotency key already belongs to another task");
      }
      const [agent] = await tx.select().from(agents).where(and(eq(agents.id, data.assigneeAgentId), eq(agents.companyId, companyId)));
      if (!agent) throw notFound("Assignee agent not found in this company");
      if (data.projectId && !(await tx.select().from(projects).where(and(eq(projects.id, data.projectId), eq(projects.companyId, companyId))).limit(1))[0]) throw notFound("Project not found in this company");
      const [goal] = await tx.insert(goals).values({ companyId, title: data.title, description: data.description ?? null, kind: "assignment", level: "task", status: "active", acceptanceCriteria: data.acceptanceCriteria, expectedDeliverable: data.expectedDeliverable ?? null, budgetCents: data.budgetCents, projectId: data.projectId ?? null, assigneeAgentId: data.assigneeAgentId }).returning();
      const issue = await issueService(db).create(companyId, { title: data.title, description: [data.description, `Acceptance criteria:\n${data.acceptanceCriteria}`, data.expectedDeliverable ? `Expected deliverable:\n${data.expectedDeliverable}` : null].filter(Boolean).join("\n\n"), status: data.status ?? "todo", priority: data.priority ?? "medium", workMode: data.workMode ?? "standard", visibility: data.visibility ?? "open", assigneeAgentId: data.assigneeAgentId, projectId: data.projectId ?? null, goalId: goal.id, createdByUserId: actor.userId ?? undefined, createdByAgentId: actor.agentId ?? undefined, idempotencyKey: data.idempotencyKey }, tx as never);
      const [updated] = await tx.update(goals).set({ rootIssueId: issue.id, updatedAt: new Date() }).where(eq(goals.id, goal.id)).returning();
      await entitlements.commit(reservation);
      await logActivity(tx as unknown as Db, { companyId, actorType: actor.systemActorId ? "system" : actor.userId ? "user" : actor.agentId ? "agent" : "system", actorId: actor.systemActorId ?? actor.userId ?? actor.agentId ?? "assignment-service", agentId: actor.agentId ?? null, responsibleUserIdOverride: actor.userId, action: "assignment.created", entityType: "goal", entityId: goal.id, details: { title: data.title, rootIssueId: issue.id } }, publications);
      return { ...updated, assignmentStatus: "in_progress" as const, rootIssue: issue };
      });
      for (const publication of publications) publishActivity(publication);
      return result;
    },
    update: async (id: string, data: Record<string, unknown>) => {
      const existing = await getById(id);
      if (!existing) return null;
      const updatedId = await db.transaction(async (tx) => {
        if (typeof data.assigneeAgentId === "string" && !(await tx.select().from(agents).where(and(eq(agents.id, data.assigneeAgentId), eq(agents.companyId, existing.companyId))).limit(1))[0]) throw notFound("Assignee agent not found in this company");
        if (typeof data.projectId === "string" && !(await tx.select().from(projects).where(and(eq(projects.id, data.projectId), eq(projects.companyId, existing.companyId))).limit(1))[0]) throw notFound("Project not found in this company");
        const [row] = await tx.update(goals).set({ ...data, updatedAt: new Date() } as Partial<typeof goals.$inferInsert>).where(and(eq(goals.id, id), eq(goals.companyId, existing.companyId), eq(goals.kind, "assignment"))).returning();
        if (!row) return null;
        if (row.rootIssueId) await issueService(db).update(row.rootIssueId, { ...(typeof data.assigneeAgentId === "string" ? { assigneeAgentId: data.assigneeAgentId } : {}), ...(typeof data.projectId === "string" || data.projectId === null ? { projectId: data.projectId as string | null } : {}), ...(typeof data.title === "string" ? { title: data.title } : {}), ...(typeof data.description === "string" || data.description === null ? { description: data.description as string | null } : {}), companyGuard: row.companyId }, tx);
        return row.id;
      });
      return updatedId ? getById(updatedId) : null;
    },
    cancel: async (id: string, actor: { userId?: string | null; agentId?: string | null } = {}) => {
      const current = await getById(id);
      if (!current) return null;
      const updatedId = await db.transaction(async (tx) => {
        const [row] = await tx.update(goals).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(goals.id, id), eq(goals.companyId, current.companyId), eq(goals.kind, "assignment"))).returning();
        if (!row) return null;
        if (row.rootIssueId) await issueService(db).update(row.rootIssueId, { status: "cancelled", actorUserId: actor.userId ?? undefined, actorAgentId: actor.agentId ?? undefined, companyGuard: row.companyId }, tx);
        return row.id;
      });
      return updatedId ? getById(updatedId) : null;
    },
  };
}
