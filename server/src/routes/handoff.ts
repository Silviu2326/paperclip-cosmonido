import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import type { z } from "zod";
import { handoffFromOpportunitySchema, handoffFromProposalSchema } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { handoffService, type HandoffActor } from "../services/handoff.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw unprocessable("Invalid request body", parsed.error.issues);
  return parsed.data;
}

function actorOf(req: Request): HandoffActor {
  const info = getActorInfo(req);
  return info.actorType === "agent" ? { agentId: info.agentId ?? info.actorId } : { userId: info.actorId };
}

/** Sprint 3 WP9: sale to delivery handoff. Mutations are idempotent per source; partial receipts answer 202. */
export function handoffRoutes(db: Db) {
  const router = Router();
  const svc = handoffService(db);

  router.post("/companies/:companyId/handoffs/from-proposal", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = parseBody(handoffFromProposalSchema, req.body);
    const receipt = await svc.fromProposal(companyId, input, actorOf(req));
    res.status(receipt.status === "complete" ? 201 : 202).json(receipt);
  });

  router.post("/companies/:companyId/handoffs/from-opportunity", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = parseBody(handoffFromOpportunitySchema, req.body);
    const receipt = await svc.fromOpportunity(companyId, input, actorOf(req));
    res.status(receipt.status === "complete" ? 201 : 202).json(receipt);
  });

  router.get("/companies/:companyId/handoffs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.list(companyId));
  });

  router.get("/handoffs/:id", async (req, res) => {
    const receipt = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Handoff receipt not found");
    if (!receipt) return;
    res.json(receipt);
  });

  router.post("/handoffs/:id/retry", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Handoff receipt not found");
    if (!existing) return;
    const receipt = await svc.retry(id, actorOf(req));
    res.status(receipt.status === "complete" ? 200 : 202).json(receipt);
  });

  return router;
}
