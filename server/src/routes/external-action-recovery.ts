import { Router } from "express";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { externalActions, type Db } from "@paperclipai/db";
import { z } from "zod";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { notFound } from "../errors.js";
import { retryExternalAction } from "../services/external-action-retry.js";
import { logActivity } from "../services/activity-log.js";
import type { GoogleCalendarService } from "../services/calendar/google-calendar.js";

/** Explicit recovery after a process restart; uncertain provider outcomes stay blocked. */
export function externalActionRecoveryRoutes(db: Db, options: { calendar: GoogleCalendarService }) {
  const router = Router();
  router.get("/companies/:companyId/external-actions", async (req, res) => {
    const companyId = z.string().uuid().parse(req.params.companyId);
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const query = z.object({ cursor: z.string().uuid().optional() }).parse(req.query);
    const [cursor] = query.cursor ? await db.select({ id: externalActions.id, createdAt: externalActions.createdAt }).from(externalActions)
      .where(and(eq(externalActions.id, query.cursor), eq(externalActions.companyId, companyId))).limit(1) : [];
    if (query.cursor && !cursor) throw notFound("External action cursor not found");
    const rows = await db.select({
      id: externalActions.id, actionType: externalActions.actionType,
      subjectKind: externalActions.subjectKind, subjectId: externalActions.subjectId,
      status: externalActions.status, approvalId: externalActions.approvalId,
      result: externalActions.result, createdAt: externalActions.createdAt,
    }).from(externalActions).where(and(
      eq(externalActions.companyId, companyId),
      cursor ? or(lt(externalActions.createdAt, cursor.createdAt), and(eq(externalActions.createdAt, cursor.createdAt), lt(externalActions.id, cursor.id))) : undefined,
    )).orderBy(desc(externalActions.createdAt), desc(externalActions.id)).limit(51);
    res.setHeader("Cache-Control", "no-store");
    res.json({ items: rows.slice(0, 50).map(({ result, ...row }) => {
      const reason = (result as { reason?: unknown } | null)?.reason;
      return { ...row, retryable: row.status === "approved" && reason === "executor_unavailable" && ["message", "booking", "stage_change"].includes(row.actionType) };
    }), nextCursor: rows.length > 50 ? rows[49]!.id : null });
  });
  router.post("/companies/:companyId/external-actions/:actionId/retry", async (req, res) => {
    const { companyId, actionId } = z.object({ companyId: z.string().uuid(), actionId: z.string().uuid() }).parse(req.params);
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const [action] = await db.select({ id: externalActions.id }).from(externalActions)
      .where(and(eq(externalActions.id, actionId), eq(externalActions.companyId, companyId))).limit(1);
    if (!action) throw notFound("External action not found");
    const actor = getActorInfo(req);
    // The authority belongs to this current request, never to an expired agent run.
    const source = req.actor.type === "board" ? req.actor.source : "session";
    const result = await retryExternalAction(db, actionId, {
      calendar: options.calendar,
      calendarAuthority: { kind: "board_session", userId: actor.actorId, sessionId: req.actor.type === "board" ? req.actor.sessionId ?? null : null,
        source: source === "local_implicit" || source === "board_key" || source === "mcp_oauth" || source === "cloud_tenant" ? source : "session" },
    });
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId,
      action: "external_action.retry_requested", entityType: "external_action", entityId: actionId,
      details: { status: result.action.status } });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  });
  return router;
}
