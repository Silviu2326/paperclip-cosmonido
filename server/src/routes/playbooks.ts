import { Router, type Request, type Response } from "express";
import { z, ZodError, type ZodSchema } from "zod";
import type { Db } from "@paperclipai/db";
import {
  advancePlaybookRunSchema,
  createPlaybookSchema,
  playbookListQuerySchema,
  playbookRunListQuerySchema,
  startPlaybookRunSchema,
  updatePlaybookSchema,
} from "@paperclipai/shared";
import { playbookService, listPlaybookTemplates , type PlaybookServiceDeps } from "../services/playbooks.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo, hasCompanyAccess } from "./authz.js";
import { forbidden, unprocessable } from "../errors.js";

function parseWith<T>(schema: ZodSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw unprocessable("Validation error", error.issues);
    throw error;
  }
}

const fromTemplateSchema = z.object({ templateKey: z.string().trim().min(1).max(80) });

export function playbookRoutes(db: Db, deps: PlaybookServiceDeps = {}) {
  const router = Router();
  const svc = playbookService(db, deps);

  async function audit(req: Request, companyId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> | null = null) {
    const info = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: info.actorType,
      actorId: info.actorId,
      agentId: info.agentId,
      action,
      entityType,
      entityId,
      details,
    });
  }

  function serviceActor(req: Request) {
    const info = getActorInfo(req);
    return { agentId: info.agentId, userId: info.actorType === "user" ? info.actorId : null };
  }

  /** Loads a run the caller may see. Agents may only act on runs assigned to them. */
  async function loadRunFor(req: Request, res: Response, id: string) {
    const run = await svc.getRun(id);
    if (!run || !hasCompanyAccess(req, run.companyId)) {
      res.status(404).json({ error: "Playbook run not found" });
      return null;
    }
    assertCompanyAccess(req, run.companyId);
    const info = getActorInfo(req);
    if (info.actorType === "agent" && run.agentId && run.agentId !== info.agentId) {
      throw forbidden("Playbook run belongs to another agent");
    }
    return run;
  }

  router.get("/companies/:companyId/playbooks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = parseWith(playbookListQuerySchema, req.query);
    res.json(await svc.list(companyId, query));
  });

  router.get("/companies/:companyId/playbooks/templates", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(listPlaybookTemplates());
  });

  router.post("/companies/:companyId/playbooks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const body = parseWith(createPlaybookSchema, req.body);
    const playbook = await svc.create(companyId, body, serviceActor(req));
    await audit(req, companyId, "playbook.created", "playbook", playbook.id, { key: playbook.key, version: playbook.version });
    res.status(201).json(playbook);
  });

  router.post("/companies/:companyId/playbooks/from-template", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const body = parseWith(fromTemplateSchema, req.body);
    const playbook = await svc.createFromTemplate(companyId, body.templateKey, serviceActor(req));
    await audit(req, companyId, "playbook.created", "playbook", playbook.id, { key: playbook.key, version: playbook.version, templateKey: body.templateKey });
    res.status(201).json(playbook);
  });

  router.get("/playbooks/:id", async (req, res) => {
    const id = req.params.id as string;
    const playbook = await getAccessibleResource(req, res, svc.getById(id), "Playbook not found");
    if (!playbook) return;
    res.json(playbook);
  });

  router.patch("/playbooks/:id", async (req, res) => {
    const id = req.params.id as string;
    assertBoard(req);
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Playbook not found");
    if (!existing) return;
    const body = parseWith(updatePlaybookSchema, req.body);
    const playbook = await svc.update(id, body, serviceActor(req));
    await audit(req, playbook.companyId, "playbook.updated", "playbook", playbook.id, { key: playbook.key, version: playbook.version });
    res.json(playbook);
  });

  router.post("/playbooks/:id/publish", async (req, res) => {
    const id = req.params.id as string;
    assertBoard(req);
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Playbook not found");
    if (!existing) return;
    const playbook = await svc.publishVersion(id, serviceActor(req));
    await audit(req, playbook.companyId, "playbook.published", "playbook", playbook.id, { key: playbook.key, version: playbook.version });
    res.json(playbook);
  });

  router.post("/playbooks/:id/new-draft", async (req, res) => {
    const id = req.params.id as string;
    assertBoard(req);
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Playbook not found");
    if (!existing) return;
    const draft = await svc.newDraftFrom(id, serviceActor(req));
    await audit(req, draft.companyId, "playbook.created", "playbook", draft.id, { key: draft.key, version: draft.version, sourcePlaybookId: id });
    res.status(201).json(draft);
  });

  router.post("/playbooks/:id/archive", async (req, res) => {
    const id = req.params.id as string;
    assertBoard(req);
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Playbook not found");
    if (!existing) return;
    const playbook = await svc.archive(id, serviceActor(req));
    await audit(req, playbook.companyId, "playbook.archived", "playbook", playbook.id, { key: playbook.key, version: playbook.version });
    res.json(playbook);
  });

  router.get("/companies/:companyId/playbook-usage", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.usage(companyId));
  });

  router.get("/companies/:companyId/playbook-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = parseWith(playbookRunListQuerySchema, req.query);
    res.json(await svc.listRuns(companyId, query));
  });

  router.post("/companies/:companyId/playbook-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = parseWith(startPlaybookRunSchema, req.body);
    const info = getActorInfo(req);
    // An agent always starts runs as itself; a board caller names the agent in the body.
    if (info.actorType === "agent") {
      if (body.agentId && body.agentId !== info.agentId) throw forbidden("Agents can only start playbook runs for themselves");
      body.agentId = info.agentId;
    }
    const run = await svc.start(companyId, body, serviceActor(req));
    await audit(req, companyId, "playbook.run_started", "playbook_run", run.id, {
      playbookId: run.playbookId,
      playbookVersion: run.playbookVersion,
      subjectKind: run.subjectKind,
      subjectId: run.subjectId,
    });
    res.status(201).json(run);
  });

  router.get("/playbook-runs/:id", async (req, res) => {
    const run = await loadRunFor(req, res, req.params.id as string);
    if (!run) return;
    res.json(run);
  });

  router.post("/playbook-runs/:id/advance", async (req, res) => {
    const run = await loadRunFor(req, res, req.params.id as string);
    if (!run) return;
    const body = parseWith(advancePlaybookRunSchema, req.body);
    const updated = await svc.advance(run.id, body, serviceActor(req));
    await audit(req, run.companyId, "playbook.run_advanced", "playbook_run", run.id, {
      stepIndex: run.currentStepIndex,
      outcome: body.outcome,
      note: body.note ?? null,
      status: updated.status,
    });
    res.json(updated);
  });

  router.post("/playbook-runs/:id/pause", async (req, res) => {
    assertBoard(req);
    const run = await loadRunFor(req, res, req.params.id as string);
    if (!run) return;
    const updated = await svc.pause(run.id, serviceActor(req));
    await audit(req, run.companyId, "playbook.run_paused", "playbook_run", run.id);
    res.json(updated);
  });

  router.post("/playbook-runs/:id/resume", async (req, res) => {
    assertBoard(req);
    const run = await loadRunFor(req, res, req.params.id as string);
    if (!run) return;
    const updated = await svc.resume(run.id, serviceActor(req));
    await audit(req, run.companyId, "playbook.run_resumed", "playbook_run", run.id);
    res.json(updated);
  });

  router.post("/playbook-runs/:id/cancel", async (req, res) => {
    assertBoard(req);
    const run = await loadRunFor(req, res, req.params.id as string);
    if (!run) return;
    const updated = await svc.cancel(run.id, serviceActor(req));
    await audit(req, run.companyId, "playbook.run_cancelled", "playbook_run", run.id);
    res.json(updated);
  });

  return router;
}

