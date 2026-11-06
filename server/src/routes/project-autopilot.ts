import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { autopilotConfigSchema, autopilotPlansSchema, autopilotReportSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { accessService } from "../services/access.js";
import { projectService } from "../services/projects.js";
import { projectAutopilotService } from "../services/project-autopilot.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, hasCompanyAccess, getActorInfo } from "./authz.js";
import { forbidden } from "../errors.js";

export function projectAutopilotRoutes(db: Db, service = projectAutopilotService(db)): Router {
  const router = Router();
  const projects = projectService(db);
  const access = accessService(db);
  async function project(req: Request, write = false) {
    if (!z.string().uuid().safeParse(req.params.projectId).success) return null;
    const value = await projects.getById(String(req.params.projectId));
    if (!value || !hasCompanyAccess(req, value.companyId)) return null;
    assertCompanyAccess(req, value.companyId);
    const decision = await access.decide({ actor: req.actor, action: "project:read", resource: { type: "project", companyId: value.companyId, projectId: value.id } });
    if (!decision.allowed) return null;
    if (write) {
      assertBoard(req);
      const assign = await access.decide({ actor: req.actor, action: "tasks:assign", resource: { type: "company", companyId: value.companyId } });
      if (!assign.allowed) throw forbidden(assign.explanation);
    }
    return value;
  }
  async function audit(req: Request, companyId: string, projectId: string, action: string) {
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, ...actor, action: `autopilot.${action}`, entityType: "project", entityId: projectId });
  }
  async function resultAuthority(req: Request, projectId: string, issueId: string) {
    const context = await projectToolContext(db, req.actor, true, "Autonomy");
    if (context.issue.id !== issueId || context.issue.projectId !== projectId || context.issue.assigneeAgentId !== req.actor.agentId) {
      throw forbidden("Only the authenticated run assigned to the active project task may submit its result");
    }
    return context;
  }
  router.get("/projects/:projectId/autopilot", async (req, res) => {
    const value = await project(req);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    res.json(await service.get(value.id));
  });
  router.put("/projects/:projectId/autopilot", validate(z.object({ config: autopilotConfigSchema, expectedRevision: z.number().int().positive().optional() }).strict()), async (req, res) => {
    const value = await project(req, true);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    const userId = req.actor.source === "local_implicit" ? "local-board" : req.actor.userId;
    if (!userId) throw forbidden("A responsible user is required");
    const result = await service.configure(value.id, value.companyId, req.body.config, userId, req.body.expectedRevision);
    await audit(req, value.companyId, value.id, "configured");
    res.json(result);
  });
  router.post("/projects/:projectId/autopilot/discover", async (req, res) => {
    const value = await project(req, true);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    const result = await service.requestCycle(value.id);
    await audit(req, value.companyId, value.id, "discovery_requested");
    res.json(result);
  });
  router.post("/projects/:projectId/autopilot/select", validate(z.object({ planId: z.enum(["essential", "balanced", "ambitious"]) }).strict()), async (req, res) => {
    const value = await project(req, true);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    const result = await service.selectPlan(value.id, req.body.planId);
    await audit(req, value.companyId, value.id, "plan_selected");
    res.json(result);
  });
  router.post("/projects/:projectId/autopilot/feedback", validate(z.object({ text: z.string().trim().min(1).max(4000) }).strict()), async (req, res) => {
    const value = await project(req, true);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    const result = await service.feedback(value.id, req.body.text);
    await audit(req, value.companyId, value.id, "feedback_saved");
    res.json(result);
  });
  router.post("/projects/:projectId/autopilot/plans", validate(autopilotPlansSchema), async (req, res) => {
    const value = await project(req);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    await resultAuthority(req, value.id, req.body.issueId);
    const result = await service.submitPlans(value.id, req.body);
    await audit(req, value.companyId, value.id, "plans_received");
    res.json(result);
  });
  router.post("/projects/:projectId/autopilot/reports", validate(autopilotReportSchema), async (req, res) => {
    const value = await project(req);
    if (!value) return void res.status(404).json({ error: "Project not found" });
    const context = await resultAuthority(req, value.id, req.body.issueId);
    const result = await service.submitReport(value.id, req.body, req.actor.agentId!, context.run.id);
    await audit(req, value.companyId, value.id, "report_received");
    res.json(result);
  });
  return router;
}
