import { Router } from "express";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { ZodError, type ZodSchema } from "zod";
import type { Db } from "@paperclipai/db";
import { createDeliverableReviewSchema, resolveDeliverableReviewSchema } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { deliverableReviewService } from "../services/deliverable-reviews.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { issueService } from "../services/issues.js";
import { assignmentService } from "../services/assignments.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { resolveGoalIdForIssue } from "../services/assignment-costs.js";
import { agentVisibleFileCondition, loadAgentHiddenFolderIds } from "../services/company-files.js";
import { companyFileVersions, companyFiles } from "@paperclipai/db";

function validateReview(schema: ZodSchema) {
  return (req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) => {
    try { req.body = schema.parse(req.body); next(); }
    catch (error) { if (error instanceof ZodError) return next(unprocessable("Validation error", error.issues)); next(error); }
  };
}

export function deliverableReviewRoutes(db: Db) {
  const router = Router(); const svc = deliverableReviewService(db);
  router.post("/companies/:companyId/deliverable-reviews", validateReview(createDeliverableReviewSchema), async (req, res) => {
    const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); const actor = getActorInfo(req);
    let input = req.body as typeof req.body & { issueId?: string | null; goalId?: string | null };
    let runId: string | null = null;
    if (req.actor.type === "agent") {
      const context = await projectToolContext(db, req.actor, true, "Deliverable review");
      if (context.run.companyId !== companyId || input.issueId && input.issueId !== context.issue.id) return res.status(404).json({ error: "Task not found" });
      const goalId = await resolveGoalIdForIssue(db, companyId, context.issue.id);
      if (input.goalId && input.goalId !== goalId) return res.status(404).json({ error: "Assignment not found" });
      input = { ...input, issueId: context.issue.id, goalId };
      runId = context.run.id;
      if (input.targetKind === "company_file_version") {
        const hiddenFolderIds = await loadAgentHiddenFolderIds(db, companyId);
        const visibility = agentVisibleFileCondition(hiddenFolderIds);
        const [target] = await db.select({ file: companyFiles }).from(companyFileVersions).innerJoin(companyFiles, and(eq(companyFiles.id, companyFileVersions.fileId), eq(companyFiles.companyId, companyFileVersions.companyId))).where(and(
          eq(companyFileVersions.id, input.targetId), eq(companyFileVersions.companyId, companyId), isNull(companyFiles.deletedAt),
          or(eq(companyFiles.audienceKind, "company"), ...(context.issue.projectId ? [and(eq(companyFiles.audienceKind, "project"), eq(companyFiles.audienceId, context.issue.projectId))] : [])),
          or(isNull(companyFiles.validUntil), gte(companyFiles.validUntil, new Date())), visibility,
        ));
        if (!target || !target.file.contextRole) return res.status(404).json({ error: "Context file version not found" });
      }
    }
    const review = await svc.submit(companyId, input, { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId, runId });
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "deliverable.submitted", entityType: "deliverable_review", entityId: review.id, details: { targetKind: review.targetKind, targetId: review.targetId, targetVersion: review.targetVersion } }); res.status(201).json(review);
  });
  router.post("/deliverable-reviews/:id/resolve", validateReview(resolveDeliverableReviewSchema), async (req, res) => {
    assertBoard(req); const [candidate] = await db.select().from((await import("@paperclipai/db")).deliverableReviews).where((await import("drizzle-orm")).eq((await import("@paperclipai/db")).deliverableReviews.id, req.params.id as string));
    if (!candidate) return res.status(404).json({ error: "Deliverable review not found" }); assertCompanyAccess(req, candidate.companyId); const actor = getActorInfo(req);
    const review = await svc.resolve(candidate.id, req.body, { userId: actor.actorId, agentId: actor.agentId }); await logActivity(db, { companyId: review.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: req.body.state === "accepted" ? "deliverable.accepted" : "deliverable.changes_requested", entityType: "deliverable_review", entityId: review.id, details: { reason: review.reason } }); res.json(review);
  });
  router.get("/goals/:id/deliverable-reviews", async (req, res) => { const assignment = await getAccessibleResource(req, res, assignmentService(db).getById(req.params.id as string), "Goal not found"); if (!assignment) return; res.json(await svc.listByGoal(assignment.id)); });
  router.get("/issues/:id/deliverable-reviews", async (req, res) => { const issue = await getAccessibleResource(req, res, issueService(db).getById(req.params.id as string), "Task not found"); if (!issue) return; res.json(await svc.listByIssue(issue.id)); });
  router.get("/companies/:companyId/deliverable-reviews", async (req, res) => { assertCompanyAccess(req, req.params.companyId as string); res.json(await svc.listPendingForCompany(req.params.companyId as string)); });
  return router;
}
