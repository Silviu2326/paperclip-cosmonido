import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { officeDesignChatSchema, putOfficeLayoutSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { forbidden } from "../errors.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { officeLayoutsService } from "../services/office-layouts.js";
import { designOfficeChat } from "../services/office-design-chat.js";

/**
 * Pixel-art office layouts are per user and per company (doc/plans/2026-10-21-oficina-pixel-art.md).
 * Board users only: agents never edit or design an office.
 */
export function officeRoutes(db: Db) {
  const router = Router();
  const svc = officeLayoutsService(db);

  function boardUserId(req: Parameters<typeof assertBoard>[0], companyId: string): string {
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const userId = req.actor.type === "board" ? req.actor.userId : null;
    if (!userId) throw forbidden("Board user required");
    return userId;
  }

  router.get("/companies/:companyId/office/layout", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = boardUserId(req, companyId);
    res.json(await svc.get(companyId, userId));
  });

  router.put("/companies/:companyId/office/layout", validate(putOfficeLayoutSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = boardUserId(req, companyId);
    const actor = getActorInfo(req);
    res.json(await svc.put(companyId, userId, req.body.layout, actor));
  });

  router.delete("/companies/:companyId/office/layout", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = boardUserId(req, companyId);
    const actor = getActorInfo(req);
    res.json(await svc.reset(companyId, userId, actor));
  });

  router.post("/companies/:companyId/office/design-chat", validate(officeDesignChatSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = boardUserId(req, companyId);
    res.json(await designOfficeChat(db, { companyId, userId, body: req.body }));
  });

  return router;
}
