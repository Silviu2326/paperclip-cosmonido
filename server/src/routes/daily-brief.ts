import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { updateDailyBriefPreferenceSchema } from "@paperclipai/shared";
import { forbidden, unprocessable } from "../errors.js";
import { dailyBriefService } from "../services/daily-brief.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import type { Request } from "express";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Per-user preferences for the daily owner brief. Only a board user can read
 * or change their own preference; agents get 403. Validation failures are 422
 * (not the generic 400 that validate() produces) so the UI can show field errors.
 */
export function dailyBriefRoutes(db: Db) {
  const router = Router();
  const svc = dailyBriefService(db);

  function requireOwnerUserId(req: Request, companyId: string): string {
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const userId = req.actor.type === "board" ? req.actor.userId : null;
    if (!userId) throw forbidden("Daily brief preferences require a signed-in user");
    return userId;
  }

  router.get("/companies/:companyId/daily-brief/preferences", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireOwnerUserId(req, companyId);
    res.json(await svc.getPreference(companyId, userId));
  });

  router.patch("/companies/:companyId/daily-brief/preferences", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireOwnerUserId(req, companyId);
    const parsed = updateDailyBriefPreferenceSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw unprocessable("Validation error", parsed.error.issues);
    }
    const preference = await svc.updatePreference(companyId, userId, parsed.data);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "daily_brief.preferences_updated",
      entityType: "daily_brief_preference",
      entityId: preference.id,
      details: parsed.data,
    });

    res.json(preference);
  });

  router.get("/companies/:companyId/daily-brief/preview", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireOwnerUserId(req, companyId);
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    if (date !== undefined && !DATE_PATTERN.test(date)) {
      throw unprocessable("date must be YYYY-MM-DD", { date });
    }
    const preference = await svc.getPreference(companyId, userId);
    const brief = await svc.compose(companyId, userId, {
      ...(date ? { date } : {}),
      timezone: preference.timezone,
    });
    res.json(brief);
  });

  return router;
}
