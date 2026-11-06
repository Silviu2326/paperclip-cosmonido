import { Router, type Request } from "express";
import {
  createCustomerChannelAccountSchema,
  updateCustomerChannelAccountSchema,
} from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { notFound } from "../errors.js";
import { customerChannelService } from "../services/customer-channels/accounts.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

// Private settings for customer channel accounts (Sprint 2 pistas D/E). Board only: these accounts
// hold references to company secrets, and agents must not change them.

export function customerChannelRoutes(db: Db) {
  const router = Router();
  const svc = customerChannelService(db);

  router.get("/companies/:companyId/customer-channels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.list(companyId));
  });

  router.post("/companies/:companyId/customer-channels", validate(createCustomerChannelAccountSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const account = await svc.create(companyId, req.body, getActorInfo(req));
    res.status(201).json(account);
  });

  async function loadForRequest(req: Request, id: string) {
    const row = await svc.findById(id);
    if (!row) throw notFound("Channel account not found");
    assertCompanyAccess(req, row.companyId);
    assertBoard(req);
    return row;
  }

  router.patch("/customer-channels/:id", validate(updateCustomerChannelAccountSchema), async (req, res) => {
    const id = req.params.id as string;
    const row = await loadForRequest(req, id);
    res.json(await svc.update(row.companyId, id, req.body, getActorInfo(req)));
  });

  router.delete("/customer-channels/:id", async (req, res) => {
    const id = req.params.id as string;
    const row = await loadForRequest(req, id);
    await svc.remove(row.companyId, id, getActorInfo(req));
    res.status(204).end();
  });

  router.post("/customer-channels/:id/test", async (req, res) => {
    const id = req.params.id as string;
    const row = await loadForRequest(req, id);
    res.json(await svc.test(row.companyId, id, getActorInfo(req)));
  });

  return router;
}
