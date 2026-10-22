import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { notFound } from "../errors.js";
import {
  CHANNEL_KINDS,
  CHANNEL_PROVIDERS,
  customerChannelService,
} from "../services/customer-channels/accounts.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

// Private settings for customer channel accounts (Sprint 2 pistas D/E). Board only: these accounts
// hold references to company secrets, and agents must not change them.

const secretName = z.string().trim().min(1).max(128);
const e164 = /^\+[1-9]\d{7,14}$/;

const approvedTemplate = z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(10),
});

const createCustomerChannelSchema = z
  .object({
    provider: z.enum(CHANNEL_PROVIDERS),
    kind: z.enum(CHANNEL_KINDS),
    label: z.string().trim().min(1).max(120),
    externalAccountId: z.string().trim().min(1).max(64),
    providerAccountSid: z.string().trim().regex(/^AC[a-zA-Z0-9]{32}$/).nullable().optional(),
    verifySecretName: secretName,
    challengeSecretName: secretName.nullable().optional(),
    tokenSecretName: secretName,
    approvedTemplates: z.array(approvedTemplate).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "twilio" && !e164.test(value.externalAccountId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["externalAccountId"], message: "Twilio numbers must be E.164, for example +34600000000" });
    }
  });

const updateCustomerChannelSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    providerAccountSid: z.string().trim().regex(/^AC[a-zA-Z0-9]{32}$/).nullable().optional(),
    verifySecretName: secretName.optional(),
    challengeSecretName: secretName.nullable().optional(),
    tokenSecretName: secretName.optional(),
    approvedTemplates: z.array(approvedTemplate).max(50).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

export function customerChannelRoutes(db: Db) {
  const router = Router();
  const svc = customerChannelService(db);

  router.get("/companies/:companyId/customer-channels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.list(companyId));
  });

  router.post("/companies/:companyId/customer-channels", validate(createCustomerChannelSchema), async (req, res) => {
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

  router.patch("/customer-channels/:id", validate(updateCustomerChannelSchema), async (req, res) => {
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
