import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import type { z } from "zod";
import {
  createServiceAgreementSchema,
  updateServiceAgreementSchema,
  upsellSuggestSchema,
} from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { serviceAgreementService } from "../services/service-agreements.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unprocessable("Invalid request body", parsed.error.issues);
  return parsed.data;
}

/** Sprint 3 WP10: recurring service agreements, periods and renewals. Creating and changing agreements is board work. */
export function serviceAgreementRoutes(db: Db) {
  const router = Router();
  const svc = serviceAgreementService(db);

  async function audit(req: Request, companyId: string, action: string, entityId: string, details: Record<string, unknown>) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action,
      entityType: "agreement",
      entityId,
      details,
    });
  }

  router.get("/companies/:companyId/service-agreements", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.list(companyId));
  });

  router.post("/companies/:companyId/service-agreements", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const input = parseBody(createServiceAgreementSchema, req.body);
    const actor = getActorInfo(req);
    const agreement = await svc.create(companyId, input, { userId: actor.actorType === "user" ? actor.actorId : null });
    await audit(req, companyId, "agreement.created", agreement.id, { title: agreement.title, periodKind: agreement.periodKind });
    res.status(201).json(agreement);
  });

  router.get("/service-agreements/:id", async (req, res) => {
    const agreement = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Service agreement not found");
    if (!agreement) return;
    res.json(agreement);
  });

  router.patch("/service-agreements/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Service agreement not found");
    if (!existing) return;
    const input = parseBody(updateServiceAgreementSchema, req.body);
    const agreement = await svc.update(id, input);
    if (!agreement) {
      res.status(404).json({ error: "Service agreement not found" });
      return;
    }
    await audit(req, agreement.companyId, "agreement.updated", agreement.id, { fields: Object.keys(input) });
    res.json(agreement);
  });

  router.post("/service-agreements/:id/cancel", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Service agreement not found");
    if (!existing) return;
    const agreement = await svc.cancel(id);
    if (!agreement) {
      res.status(404).json({ error: "Service agreement not found" });
      return;
    }
    await audit(req, agreement.companyId, "agreement.cancelled", agreement.id, {});
    res.json(agreement);
  });

  router.get("/service-agreements/:id/periods", async (req, res) => {
    const id = req.params.id as string;
    const agreement = await getAccessibleResource(req, res, svc.getById(id), "Service agreement not found");
    if (!agreement) return;
    res.json(await svc.listPeriods(id));
  });

  router.post("/companies/:companyId/service-agreements/tick", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const result = await svc.tick(companyId);
    res.json(result);
  });

  /** A suggestion only. Agents may record it; nothing is sold or sent. */
  router.post("/companies/:companyId/upsell-suggestions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = parseBody(upsellSuggestSchema, req.body);
    const info = getActorInfo(req);
    const actor = info.actorType === "agent" ? { agentId: info.agentId ?? info.actorId } : { userId: info.actorId };
    res.status(201).json(await svc.recordUpsell(companyId, input, actor));
  });

  return router;
}
