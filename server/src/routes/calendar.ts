import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { bookingService } from "../services/calendar/booking.js";
import type { GoogleCalendarService } from "../services/calendar/google-calendar.js";
import {
  availabilityQuerySchema,
  bookSchema,
  createBookingTypeSchema,
  listEventsQuerySchema,
  rescheduleSchema,
} from "../services/calendar/schemas.js";
import { assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

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
      assertCompanyAccess(req, companyId);
      const row = await svc.createType(companyId, req.body);
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
      res.status(201).json(row);
    },
  );

  router.get("/companies/:companyId/calendar/availability", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = availabilityQuerySchema.parse(req.query);
    res.json(await svc.availability({
      companyId,
      ref: { bookingTypeId: query.bookingTypeId, slug: query.slug },
      from: new Date(query.from),
      to: new Date(query.to),
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
    });
    res.json(outcome);
  });

  router.post("/calendar/events/:id/cancel", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.findEventById(id), "Calendar event not found");
    if (!existing) return;
    const outcome = await svc.cancel({ companyId: existing.companyId, eventId: existing.id, actor: gateActor(req) });
    res.json(outcome);
  });

  return router;
}
