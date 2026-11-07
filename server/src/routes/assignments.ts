import { Router } from "express";
import { eq } from "drizzle-orm";
import { ZodError, type ZodSchema } from "zod";
import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { assignmentListQuerySchema, createAssignmentSchema, updateAssignmentSchema } from "@paperclipai/shared";
import { assignmentService } from "../services/assignments.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { unprocessable } from "../errors.js";
import { resolveGoalIdForIssue } from "../services/assignment-costs.js";
import { canActorReadIssuePrivacy, issueReadSqlCondition, type IssuePrivacyRow } from "../services/authorization.js";
import { projectToolContext } from "../services/project-tool-context.js";

function validateAssignment(schema: ZodSchema) {
  return (req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) => {
    try { req.body = schema.parse(req.body); next(); }
    catch (error) { if (error instanceof ZodError) return next(unprocessable("Validation error", error.issues)); next(error); }
  };
}

export function assignmentRoutes(db: Db) {
  const router = Router(); const svc = assignmentService(db);
  const getReadableAssignment = async (req: import("express").Request, res: import("express").Response, id: string, notFoundMessage: string) => {
    const assignment = await getAccessibleResource(req, res, svc.getById(id), notFoundMessage);
    if (!assignment) return null;
    if (assignment.rootIssue && !(await canActorReadIssuePrivacy(db, req.actor, assignment.rootIssue))) {
      res.status(404).json({ error: notFoundMessage });
      return null;
    }
    return assignment;
  };
  router.get("/companies/:companyId/assignments", async (req, res) => { const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); let filters; try { filters = assignmentListQuerySchema.parse(req.query); } catch (error) { if (error instanceof ZodError) return res.status(422).json({ error: "Validation error", details: error.issues }); throw error; } res.json(await svc.list(companyId, { ...filters, issueReadCondition: await issueReadSqlCondition(db, req.actor) })); });
  router.get("/issues/:id/assignment", async (req, res) => {
    const issueId = req.params.id as string;
    let issue: IssuePrivacyRow | null | undefined;
    if (req.actor.type === "agent") {
      const context = await projectToolContext(db, req.actor, false, "Assignment");
      if (context.issue.id !== issueId) return res.status(404).json({ error: "Task not found" });
      issue = context.issue;
    } else {
      issue = await getAccessibleResource(req, res, db.select({ id: issues.id, companyId: issues.companyId, visibility: issues.visibility, privacyRootIssueId: issues.privacyRootIssueId, responsibleUserId: issues.responsibleUserId, createdByUserId: issues.createdByUserId, assigneeUserId: issues.assigneeUserId, assigneeAgentId: issues.assigneeAgentId }).from(issues).where(eq(issues.id, issueId)).then((rows) => rows[0] ?? null), "Task not found");
      if (!issue) return;
    }
    if (!(await canActorReadIssuePrivacy(db, req.actor, issue))) return res.status(404).json({ error: "Task not found" });
    const goalId = await resolveGoalIdForIssue(db, issue.companyId, issueId);
    if (!goalId) return res.json(null);
    if (typeof req.query.goalId === "string" && req.query.goalId !== goalId) return res.status(400).json({ error: "Current task is not linked to the requested assignment" });
    const assignment = await svc.getById(goalId);
    if (!assignment || assignment.companyId !== issue.companyId) return res.json(null);
    if (assignment.rootIssue && !(await canActorReadIssuePrivacy(db, req.actor, assignment.rootIssue))) return res.json(null);
    res.json(assignment);
  });
  router.post("/companies/:companyId/assignments", validateAssignment(createAssignmentSchema), async (req, res) => {
    assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); const actor = getActorInfo(req);
    const assignment = await svc.create(companyId, req.body, { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId });
    res.status(201).json(assignment);
  });
  router.get("/assignments/:id", async (req, res) => { const result = await getReadableAssignment(req, res, req.params.id as string, "Assignment not found"); if (result) res.json(result); });
  router.patch("/assignments/:id", validateAssignment(updateAssignmentSchema), async (req, res) => { assertBoard(req); const old = await getReadableAssignment(req, res, req.params.id as string, "Assignment not found"); if (!old) return; const updated = await svc.update(old.id, req.body); if (!updated) return res.status(404).json({ error: "Assignment not found" }); const actor = getActorInfo(req); await logActivity(db, { companyId: old.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "assignment.updated", entityType: "goal", entityId: old.id, details: req.body }); res.json(updated); });
  router.post("/assignments/:id/cancel", async (req, res) => { assertBoard(req); const old = await getReadableAssignment(req, res, req.params.id as string, "Assignment not found"); if (!old) return; const actor = getActorInfo(req); const updated = await svc.cancel(old.id, { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId }); if (!updated) return res.status(404).json({ error: "Assignment not found" }); await logActivity(db, { companyId: old.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "assignment.cancelled", entityType: "goal", entityId: old.id }); res.json(updated); });
  return router;
}
