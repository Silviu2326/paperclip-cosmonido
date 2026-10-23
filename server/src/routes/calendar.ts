import { Router, type Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { bookingTypes } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { accessService } from "../services/access.js";
import { conflict, forbidden, unprocessable } from "../errors.js";
import { bookingService } from "../services/calendar/booking.js";
import type { CalendarConnectorAuthority, GoogleCalendarService } from "../services/calendar/google-calendar.js";
import {
  availabilityQuerySchema,
  bookSchema,
  createBookingTypeSchema,
  listEventsQuerySchema,
  rescheduleSchema,
} from "../services/calendar/schemas.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

// Sprint 2 pista H (Agenda). Public booking lives in routes/public/booking.ts.
//   GET   /companies/:companyId/calendar/booking-types
//   POST  /companies/:companyId/calendar/booking-types
//   GET   /companies/:companyId/calendar/availability?bookingTypeId|slug&from&to
//   GET   /companies/:companyId/calendar/events?status&from&limit
//   POST  /companies/:companyId/calendar/events            (book for a company member)
//   GET   /calendar/events/:id
//   POST  /calendar/events/:id/reschedule
//   POST  /calendar/events/:id/cancel

/** Gate actor for the signed-in caller: the agent itself, or the board user. */
function gateActor(req: Request): { userId?: string; agentId?: string } {
  const info = getActorInfo(req);
  if (info.actorType === "agent") return info.agentId ? { agentId: info.agentId } : {};
  return { userId: info.actorId };
}

export function calendarRoutes(db: Db, options: { calendar?: GoogleCalendarService } = {}) {
  const router = Router();
  const svc = bookingService(db, { calendar: options.calendar });
  const access = accessService(db);

  function executionAuthority(req: Request): CalendarConnectorAuthority {
    const info = getActorInfo(req);
    if (info.actorType === "agent") {
      if (!info.agentId || !info.runId) throw unprocessable("Calendar provider calls need an authenticated active agent run.");
      return { kind: "agent_real_run", agentId: info.agentId, runId: info.runId };
    }
    const source = req.actor.type === "board" ? req.actor.source : "session";
    return {
      kind: "board_session",
      userId: info.actorId,
      sessionId: info.sessionId,
      source: source === "local_implicit" || source === "board_key" || source === "mcp_oauth" || source === "cloud_tenant" ? source : "session",
    };
  }

  router.get("/companies/:companyId/calendar/booking-types", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.listTypes(companyId));
  });

  router.post(
    "/companies/:companyId/calendar/booking-types",
    validate(createBookingTypeSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      // Booking types bind a public endpoint to a host and a provider connection.
      // Agents may book through configured types, but may not publish/change that authority.
      assertBoard(req);
      assertCompanyAccess(req, companyId);
      const body = req.body as { publicExecutionEnabled?: boolean };
      let delegator: { userId: string } | undefined;
      if (body.publicExecutionEnabled) {
        if (!req.actor.userId) throw forbidden("A signed-in company administrator must authorize public calendar execution.");
        if (!req.actor.isInstanceAdmin &&
          !(await access.canUser(companyId, req.actor.userId, "users:manage_permissions"))) {
          throw forbidden("Company permission management authority is required to delegate public calendar execution.");
        }
        delegator = { userId: req.actor.userId };
      }
      const row = await svc.createType(companyId, req.body, delegator);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "calendar.booking_type.created",
        entityType: "booking_type",
        entityId: row.id,
        details: { slug: row.slug, name: row.name },
      });
      const { delegatedByUserId: _delegatedByUserId, ...view } = row;
      res.status(201).json(view);
    },
  );

  router.post("/companies/:companyId/calendar/booking-types/:bookingTypeId/public-execution/revoke", async (req, res) => {
    const companyId = req.params.companyId as string;
    const bookingTypeId = req.params.bookingTypeId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const userId = req.actor.userId;
    if (!userId || (!req.actor.isInstanceAdmin &&
        !(await access.canUser(companyId, userId, "users:manage_permissions")))) {
      throw forbidden("Company permission management authority is required to revoke public calendar execution.");
    }
    const expectedDelegatedAt = req.body?.expectedDelegatedAt;
    const expectedDate = typeof expectedDelegatedAt === "string" ? new Date(expectedDelegatedAt) : null;
    if (!expectedDate || !Number.isFinite(expectedDate.getTime())) throw unprocessable("A delegation revision timestamp is required.");
    const [revoked] = await db.update(bookingTypes).set({
      publicExecutionEnabled: false,
      delegatedByUserId: null,
      delegatedAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(bookingTypes.id, bookingTypeId),
      eq(bookingTypes.companyId, companyId),
      eq(bookingTypes.publicExecutionEnabled, true),
      eq(bookingTypes.delegatedAt, expectedDate),
      isNull(bookingTypes.archivedAt),
    )).returning({ id: bookingTypes.id });
    if (!revoked) throw conflict("The booking type delegation changed; reload before revoking it.");
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId,
      action: "calendar.public_execution.revoked", entityType: "booking_type", entityId: bookingTypeId,
    });
    res.json({ bookingTypeId, publicExecutionEnabled: false });
  });

  router.get("/companies/:companyId/calendar/availability", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = availabilityQuerySchema.parse(req.query);
    res.json(await svc.availability({
      companyId,
      ref: { bookingTypeId: query.bookingTypeId, slug: query.slug },
      from: new Date(query.from),
      to: new Date(query.to),
      authority: executionAuthority(req),
    }));
  });

  router.get("/companies/:companyId/calendar/events", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = listEventsQuerySchema.parse(req.query);
    res.json(await svc.listEvents({
      companyId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      limit: query.limit,
    }));
  });

  router.post(
    "/companies/:companyId/calendar/events",
    validate(bookSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const body = req.body as { bookingTypeId?: string; slug?: string; startsAt: string; attendee: { name: string; email: string; phone?: string | null }; customerId?: string | null; opportunityId?: string | null };
      const outcome = await svc.book({
        companyId,
        ref: { bookingTypeId: body.bookingTypeId, slug: body.slug },
        startsAt: new Date(body.startsAt),
        attendee: body.attendee,
        customerId: body.customerId ?? null,
        opportunityId: body.opportunityId ?? null,
        actor: gateActor(req),
        authority: executionAuthority(req),
      });
      res.status(outcome.created ? 201 : 200).json(outcome);
    },
  );

  router.get("/calendar/events/:id", async (req, res) => {
    const id = req.params.id as string;
    const event = await getAccessibleResource(
      req,
      res,
      svc.findEventById(id),
      "Calendar event not found",
    );
    if (!event) return;
    res.json(event);
  });

  router.post("/calendar/events/:id/reschedule", validate(rescheduleSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.findEventById(id), "Calendar event not found");
    if (!existing) return;
    const outcome = await svc.reschedule({
      companyId: existing.companyId,
      eventId: existing.id,
      startsAt: new Date(req.body.startsAt),
      actor: gateActor(req),
      authority: executionAuthority(req),
    });
    res.json(outcome);
  });

  router.post("/calendar/events/:id/cancel", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.findEventById(id), "Calendar event not found");
    if (!existing) return;
    const outcome = await svc.cancel({ companyId: existing.companyId, eventId: existing.id, actor: gateActor(req), authority: executionAuthority(req) });
    res.json(outcome);
  });

  return router;
}
