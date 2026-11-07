import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyFiles, companyFileVersions, deliverableReviews, documentRevisions, goals, issueDocuments, issueWorkProducts, issues } from "@paperclipai/db";
import { conflict, notFound, forbidden } from "../errors.js";
import { resolveGoalIdForIssue } from "./assignment-costs.js";
import { deriveAssignmentStatus } from "./assignment-status.js";

export function deliverableReviewService(db: Db) {
  return {
    submit: async (companyId: string, input: { goalId?: string | null; issueId?: string | null; targetKind: string; targetId: string; targetVersion: string; summary: string; evidence?: Record<string, unknown> | null }, actor: { userId?: string | null; agentId?: string | null; runId?: string | null }) => {
      if (input.goalId && !(await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.companyId, companyId))).limit(1))[0]) throw notFound("Assignment not found");
      if (input.issueId && !(await db.select().from(issues).where(and(eq(issues.id, input.issueId), eq(issues.companyId, companyId))).limit(1))[0]) throw notFound("Task not found");
      if (!input.goalId && input.issueId) input.goalId = await resolveGoalIdForIssue(db, companyId, input.issueId);
      if (input.goalId && !(await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.companyId, companyId))).limit(1))[0]) throw notFound("Assignment not found");
      if (input.targetKind === "work_product") {
        const [product] = await db.select().from(issueWorkProducts).where(and(eq(issueWorkProducts.id, input.targetId), eq(issueWorkProducts.companyId, companyId)));
        if (!product || (input.issueId && product.issueId !== input.issueId)) throw notFound("Work product not found");
        if (product.updatedAt.toISOString() !== input.targetVersion) throw conflict("Work product changed; submit its latest updatedAt version");
        input.issueId ??= product.issueId;
      } else if (input.targetKind === "company_file_version") {
        const [version] = await db.select().from(companyFileVersions).where(and(eq(companyFileVersions.id, input.targetId), eq(companyFileVersions.companyId, companyId)));
        if (!version || String(version.versionNumber) !== input.targetVersion) throw notFound("Company file version not found");
      } else if (input.targetKind === "document_revision") {
        const [revision] = await db.select().from(documentRevisions).where(and(eq(documentRevisions.id, input.targetId), eq(documentRevisions.companyId, companyId)));
        if (!revision || String(revision.revisionNumber) !== input.targetVersion) throw notFound("Document revision not found");
        if (actor.runId && (!input.issueId || !(await db.select({ id: issueDocuments.id }).from(issueDocuments).where(and(
          eq(issueDocuments.companyId, companyId), eq(issueDocuments.issueId, input.issueId), eq(issueDocuments.documentId, revision.documentId),
        )).limit(1))[0])) throw notFound("Document revision not found for this task");
      }
      const [existing] = await db.select().from(deliverableReviews).where(and(eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.targetKind, input.targetKind), eq(deliverableReviews.targetId, input.targetId), eq(deliverableReviews.targetVersion, input.targetVersion))).orderBy(desc(deliverableReviews.createdAt)).limit(1);
      if (existing) return existing;
      try {
        return (await db.insert(deliverableReviews).values({ companyId, goalId: input.goalId ?? null, issueId: input.issueId ?? null, targetKind: input.targetKind, targetId: input.targetId, targetVersion: input.targetVersion, state: "pending", reviewerAgentId: actor.agentId ?? null, evidence: { ...(input.evidence ?? {}), summary: input.summary } }).returning())[0];
      } catch (error) {
        const [raced] = await db.select().from(deliverableReviews).where(and(eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.targetKind, input.targetKind), eq(deliverableReviews.targetId, input.targetId), eq(deliverableReviews.targetVersion, input.targetVersion), eq(deliverableReviews.state, "pending"))).limit(1);
        if (raced) return raced;
        throw error;
      }
    },
    resolve: async (id: string, input: { state: "accepted" | "changes_requested"; reason?: string; expectedRevision?: string }, actor: { userId?: string | null; agentId?: string | null }) => {
      if (actor.agentId || !actor.userId) throw forbidden("Only a board user can review deliverables");
      // Keep PostgreSQL's full timestamp precision for the compare-and-swap.
      // JS Dates truncate microseconds from defaultNow(), so binding a Date
      // back to `updated_at = ...` would reject an unchanged review.
      const [snapshot] = await db.select({ review: deliverableReviews, revision: sql<string>`${deliverableReviews.updatedAt}::text` }).from(deliverableReviews).where(eq(deliverableReviews.id, id));
      if (!snapshot) throw notFound("Deliverable review not found");
      const { review, revision } = snapshot;
      if (review.state !== "pending") throw conflict("Deliverable review has already been resolved");
      if (input.expectedRevision && review.updatedAt.toISOString() !== input.expectedRevision) throw conflict("Deliverable review changed. Reload before resolving it");
      const postCommitActivityPublications: import("./activity-log.js").ActivityPublication[] = [];
      const postCommitActions: import("./issues.js").IssuePostCommitAction[] = [];
      const resolved = await db.transaction(async (tx) => {
        const [lockedGoal] = review.goalId
          ? await tx.select().from(goals).where(and(eq(goals.id, review.goalId), eq(goals.companyId, review.companyId))).for("update")
          : [];
        const [resolved] = await tx.update(deliverableReviews).set({ state: input.state, reason: input.reason ?? null, reviewerUserId: actor.userId, reviewerAgentId: null, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(deliverableReviews.id, id), eq(deliverableReviews.companyId, review.companyId), eq(deliverableReviews.state, "pending"), sql`${deliverableReviews.updatedAt} = ${revision}::timestamptz`)).returning();
        if (!resolved) throw conflict("Deliverable review changed. Reload before resolving it");
        if (review.targetKind === "work_product") {
          const [product] = await tx.select().from(issueWorkProducts).where(and(eq(issueWorkProducts.id, review.targetId), eq(issueWorkProducts.companyId, review.companyId))).for("update");
          if (!product) throw notFound("Work product not found");
          if (product.updatedAt.toISOString() !== review.targetVersion) throw conflict("Work product changed after this review was submitted");
          await tx.update(issueWorkProducts).set({ reviewState: input.state === "accepted" ? "approved" : "changes_requested", updatedAt: new Date() }).where(and(eq(issueWorkProducts.id, review.targetId), eq(issueWorkProducts.companyId, review.companyId)));
        } else if (review.targetKind === "company_file_version") {
          const [version] = await tx.select().from(companyFileVersions).where(and(eq(companyFileVersions.id, review.targetId), eq(companyFileVersions.companyId, review.companyId))).limit(1);
          if (!version || String(version.versionNumber) !== review.targetVersion) throw conflict("The submitted file version is no longer available");
          const [file] = await tx.select().from(companyFiles).where(and(eq(companyFiles.id, version.fileId), eq(companyFiles.companyId, review.companyId))).for("update").limit(1);
          if (!file || file.deletedAt || file.retentionPurgeStartedAt || file.retentionPurgedAt) throw conflict("The submitted file is deleted or being purged");
        } else if (review.targetKind === "document_revision") {
          const [revision] = await tx.select().from(documentRevisions).where(and(eq(documentRevisions.id, review.targetId), eq(documentRevisions.companyId, review.companyId))).for("share").limit(1);
          if (!revision || String(revision.revisionNumber) !== review.targetVersion) throw conflict("The submitted document revision is no longer available");
        }
        if (input.state === "changes_requested" && review.issueId) {
          const [task] = await tx.select().from(issues).where(and(eq(issues.id, review.issueId), eq(issues.companyId, review.companyId)));
          if (task) {
            const issueSvc = (await import("./issues.js")).issueService(db);
            await issueSvc.addComment(task.id, `Changes requested for deliverable: ${input.reason}`, { userId: actor.userId ?? undefined }, { authorType: "user" }, tx);
            if (["done", "in_review"].includes(task.status)) await issueSvc.update(task.id, { status: "todo", actorUserId: actor.userId, companyGuard: review.companyId }, tx);
          }
        }
        if (input.state === "accepted" && lockedGoal?.rootIssueId) {
          const [rootIssue] = await tx.select().from(issues).where(and(eq(issues.id, lockedGoal.rootIssueId), eq(issues.companyId, review.companyId)));
          if (rootIssue?.status === "in_review") {
            const assignmentReviews = await tx.select().from(deliverableReviews).where(and(eq(deliverableReviews.goalId, lockedGoal.id), eq(deliverableReviews.companyId, review.companyId))).orderBy(desc(deliverableReviews.createdAt));
            if (deriveAssignmentStatus({ goalStatus: lockedGoal.status, issueStatus: "done", reviews: assignmentReviews }) === "accepted") {
              const issueSvc = (await import("./issues.js")).issueService(db);
              await issueSvc.update(rootIssue.id, { status: "done", actorUserId: actor.userId, companyGuard: review.companyId }, tx, postCommitActivityPublications, postCommitActions);
            }
          }
        }
        return resolved;
      });
      if (postCommitActivityPublications.length || postCommitActions.length) {
        const issueServiceModule = await import("./issues.js");
        const { publishActivity } = await import("./activity-log.js");
        for (const publication of postCommitActivityPublications) publishActivity(publication);
        await issueServiceModule.executeIssuePostCommitActions(db, postCommitActions);
      }
      return resolved;
    },
    listByGoal: (id: string) => db.select().from(deliverableReviews).where(eq(deliverableReviews.goalId, id)).orderBy(desc(deliverableReviews.createdAt)),
    listByIssue: (id: string) => db.select().from(deliverableReviews).where(eq(deliverableReviews.issueId, id)).orderBy(desc(deliverableReviews.createdAt)),
    listPendingForCompany: (companyId: string) => db.select().from(deliverableReviews).where(and(eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.state, "pending"))).orderBy(desc(deliverableReviews.createdAt)),
  };
}
