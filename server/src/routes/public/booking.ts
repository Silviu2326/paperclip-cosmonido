import type { Router } from "express";
import type { Db } from "@paperclipai/db";
import { bookingService, bookingPublicView } from "../../services/calendar/booking.js";
import { bookingTypeSlugSchema, publicBookingSchema } from "../../services/calendar/schemas.js";
import { z } from "zod";
import { notFound } from "../../errors.js";

// Public booking (pista H), mounted under /p/:companySlug by public-surface.ts.
//   GET  /book/:slug?from&to   free slots for the booking type
//   POST /book/:slug           book a slot with name, email and phone
//
// The company is resolved by public-surface.ts into res.locals.publicCompanyId
// (same key as PUBLIC_COMPANY_LOCALS_KEY; kept as a literal to avoid an import cycle).

const PUBLIC_COMPANY_KEY = "publicCompanyId";

const publicRangeSchema = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
});

function companyIdOf(res: { locals: Record<string, unknown> }): string {
  const companyId = res.locals[PUBLIC_COMPANY_KEY];
  if (typeof companyId !== "string") throw notFound("Company not found");
  return companyId;
}

export function registerPublicBookingRoutes(router: Router, db: Db): void {
  const svc = bookingService(db);

  router.get("/book/:slug", async (req, res) => {
    const companyId = companyIdOf(res);
    const slug = bookingTypeSlugSchema.safeParse(req.params.slug);
    if (!slug.success) throw notFound("Booking type not found");
    const range = publicRangeSchema.parse(req.query);
    const from = new Date(range.from);
    const to = new Date(range.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({ error: "from and to must be ISO 8601 date-times" });
      return;
    }
    const result = await svc.availability({ companyId, ref: { slug: slug.data }, from, to });
    res.json(result);
  });

  router.post("/book/:slug", async (req, res) => {
    const companyId = companyIdOf(res);
    const slug = bookingTypeSlugSchema.safeParse(req.params.slug);
    if (!slug.success) throw notFound("Booking type not found");
    const body = publicBookingSchema.parse(req.body);
    const outcome = await svc.book({
      companyId,
      ref: { slug: slug.data },
      startsAt: new Date(body.startsAt),
      attendee: { name: body.name, email: body.email, phone: body.phone ?? null },
      actor: {},
    });
    const event = outcome.event;
    const type = await svc.getType(companyId, { slug: slug.data }).catch(() => null);
    res.status(outcome.created ? 201 : 200).json({
      eventId: event.id,
      status: event.status,
      confirmed: event.status === "confirmed",
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      bookingType: type ? bookingPublicView(type) : null,
    });
  });
}
