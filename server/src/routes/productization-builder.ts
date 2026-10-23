import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { builderCloneRequestSchema, builderDraftRequestSchema, builderConfigurationPreviewRequestSchema, copilotProposalRequestSchema, copilotApplyPlanRequestSchema, copilotApplyChangeRequestSchema, copilotSandboxRequestSchema } from "@paperclipai/shared/productization/description-builder";
import { validate } from "../middleware/validate.js";
import { productizationBusinessExtractionService } from "../services/productization/business-extraction.js";
import { productizationConnectionHealthService } from "../services/productization/connection-health.js";
import { productizationDescriptionBuilderService } from "../services/productization/description-builder.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { productizationConfigurationCopilotService } from "../services/productization/configuration-copilot.js";
import { accessService } from "../services/access.js";
import type { BudgetServiceHooks } from "../services/budgets.js";
import { forbidden } from "../errors.js";
import { canManageAiConnections } from "./ai-connections.js";

const compareQuerySchema = z.object({
  leftDraftId: z.string().uuid(), leftVersion: z.coerce.number().int().positive(),
  rightDraftId: z.string().uuid(), rightVersion: z.coerce.number().int().positive(),
}).strict();

export function productizationBuilderRoutes(db: Db, options: { budgetHooks?: BudgetServiceHooks } = {}) {
  const router = Router();
  const builder = productizationDescriptionBuilderService(db);
  const connections = productizationConnectionHealthService(db);
  const extraction = productizationBusinessExtractionService(db);
  const copilot = productizationConfigurationCopilotService(db, options);
  const access = accessService(db);
  const authorize = (req: import("express").Request, companyId: string) => { assertBoard(req); assertCompanyAccess(req, companyId); };

  router.get("/companies/:companyId/productization/builder/connections", async (req, res) => {
    const companyId = req.params.companyId as string;
    authorize(req, companyId);
    res.json({ connections: await connections.list(companyId), serverNow: new Date().toISOString() });
  });

  router.get("/companies/:companyId/productization/builder/url-extraction", async (req, res) => {
    const companyId = req.params.companyId as string;
    authorize(req, companyId);
    res.json(await extraction.availability(companyId));
  });

  router.post("/companies/:companyId/productization/builder/drafts", validate(builderDraftRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorize(req, companyId);
    res.json(await builder.saveDraft(companyId, req.body, getActorInfo(req)));
  });

  router.post("/companies/:companyId/productization/builder/drafts/:draftId/clone", validate(builderCloneRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorize(req, companyId);
    res.json(await builder.clone(companyId, req.params.draftId as string, req.body.sourceVersion, req.body.expectedRevision, getActorInfo(req)));
  });

  router.get("/companies/:companyId/productization/builder/compare", async (req, res) => {
    const companyId = req.params.companyId as string;
    authorize(req, companyId);
    const query = compareQuerySchema.parse(req.query);
    res.json(await builder.compare(companyId, query.leftDraftId, query.leftVersion, query.rightDraftId, query.rightVersion));
  });

  router.post("/companies/:companyId/productization/builder/configuration-preview", validate(builderConfigurationPreviewRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorize(req, companyId);
    const actor = getActorInfo(req);
    res.json(await builder.configurationPreview(companyId, req.body.draftId, req.body.version, req.body.expectedRevision, actor.actorType === "user" ? actor.actorId : null));
  });

  const authorizeModel = async (req: import("express").Request, companyId: string) => {
    authorize(req, companyId);
    if (!(await canManageAiConnections(db, req, companyId))) throw forbidden("Manage connections permission is required for model proposals");
  };
  const authorizeApply = async (req: import("express").Request, companyId: string) => {
    authorize(req, companyId);
    if (req.actor.type !== "board") throw forbidden("Board user required");
    if (req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin && !(await access.canUser(companyId, req.actor.userId, "tasks:assign"))) throw forbidden("Missing permission: tasks:assign");
  };
  async function withModelDeadline<T>(req: import("express").Request, res: import("express").Response, work: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => { if (!res.writableEnded) abort(); };
    const timer = setTimeout(abort, 30_000); timer.unref?.();
    req.once("aborted", abort); res.once("close", close);
    try { return await work(controller.signal); }
    finally { clearTimeout(timer); req.off("aborted", abort); res.off("close", close); }
  }
  router.get("/companies/:companyId/productization/builder/copilot", async (req, res) => {
    const companyId = req.params.companyId as string; authorize(req, companyId);
    res.set("Cache-Control", "no-store").json(await copilot.availability(companyId, { actor: req.actor }));
  });
  router.post("/companies/:companyId/productization/builder/copilot/propose", validate(copilotProposalRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string; await authorizeModel(req, companyId);
    res.json(await withModelDeadline(req, res, signal => copilot.propose(companyId, req.body, getActorInfo(req), { actor: req.actor }, { signal })));
  });
  router.post("/companies/:companyId/productization/builder/copilot/plan", validate(copilotApplyPlanRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string; await authorizeApply(req, companyId);
    res.json(await copilot.planApplication(companyId, req.body, getActorInfo(req)));
  });
  router.post("/companies/:companyId/productization/builder/copilot/apply", validate(copilotApplyChangeRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string; await authorizeApply(req, companyId);
    res.json(await copilot.applyChange(companyId, req.body, getActorInfo(req)));
  });
  router.post("/companies/:companyId/productization/builder/copilot/sandbox", validate(copilotSandboxRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string; await authorizeModel(req, companyId);
    res.json(await withModelDeadline(req, res, signal => copilot.sandbox(companyId, req.body, getActorInfo(req), { actor: req.actor }, { signal })));
  });
  return router;
}
