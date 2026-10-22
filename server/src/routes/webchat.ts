import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { conversations } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { webchatService } from "../services/conversations/transports/webchat.js";
import { webchatSettingsInputSchema, webchatSettingsService } from "../services/conversations/webchat-settings.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

// Web chat administration (pista F), board and agent access with company checks:
//   GET  /companies/:companyId/webchat/settings     active, greeting, brand color
//   PUT  /companies/:companyId/webchat/settings     saves them (board only)
//   POST /conversations/:conversationId/webchat-handoff   the webchat_handoff tool

export function webchatRoutes(db: Db) {
  const router = Router();
  const settings = webchatSettingsService(db);

  router.get("/companies/:companyId/webchat/settings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await settings.get(companyId));
  });

  router.put("/companies/:companyId/webchat/settings", validate(webchatSettingsInputSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const saved = await settings.upsert(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "webchat.settings_updated",
      entityType: "company",
      entityId: companyId,
      details: { active: saved.active, brandColor: saved.brandColor },
    });
    res.json(saved);
  });

  router.post("/conversations/:conversationId/webchat-handoff", async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const [row] = await db
      .select({ companyId: conversations.companyId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!row) throw notFound("Conversation not found");
    assertCompanyAccess(req, row.companyId);
    const actor = getActorInfo(req);
    const updated = await webchatService(db).handoff(row.companyId, conversationId, {
      userId: actor.actorType === "user" ? actor.actorId : null,
      agentId: actor.agentId,
    });
    res.json(updated);
  });

  return router;
}
