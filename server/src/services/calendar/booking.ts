import { and, asc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  bookingTypes,
  calendarEvents,
  crmActivities,
  customers,
  opportunities,
} from "@paperclipai/db";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { logActivity, type LogActivityInput } from "../activity-log.js";
import { normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";
import { gateExternalAction, type ExternalActionActor, type ExternalActionResult } from "../external-action-gate.js";
import { resolveBookingContact, type BookingAttendee } from "./adapters.js";
import {
  googleCalendarService,
  type BusyInterval,
  type GoogleCalendarService,
  type ProviderEventOutcome,
} from "./google-calendar.js";
import {
  assertValidTimeZone,
  candidateSlots,
  freeSlots,
  isSlotFree,
  parseWeeklyHours,
  type TimeInterval,
} from "./slots.js";
import type { CreateBookingTypeInput } from "./schemas.js";

const MINUTE_MS = 60_000;

export type BookingRef = { bookingTypeId?: string; slug?: string };
export type BookingTypeRow = typeof bookingTypes.$inferSelect;
export type CalendarEventRow = typeof calendarEvents.$inferSelect;

export interface BookingOutcome {
  event: CalendarEventRow;
  /** False when an earlier request with the same idempotency key already booked. */
  created: boolean;
  mode: "draft" | "approval" | "direct" | null;
  actionStatus: string | null;
}

export interface EventView extends CalendarEventRow {
  customerName: string | null;
  opportunityTitle: string | null;
  bookingTypeName: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/** Maps the gate actor to the activity-log actor. Public bookings without a host are logged as system. */
function activityActor(actor: ExternalActionActor): Pick<LogActivityInput, "actorType" | "actorId" | "agentId"> {
  if (actor.agentId) return { actorType: "agent", actorId: actor.agentId, agentId: actor.agentId };
  if (actor.userId) return { actorType: "user", actorId: actor.userId, agentId: null };
  return { actorType: "system", actorId: "public-booking", agentId: null };
}

export function bookingPublicView(type: BookingTypeRow) {
  return {
    id: type.id,
    slug: type.slug,
    name: type.name,
    durationMinutes: type.durationMinutes,
    timezone: type.timezone,
  };
}

/**
 * Booking types, slot availability, and the booking lifecycle. Every outbound
 * change to the provider calendar goes through gateExternalAction with
 * actionType 'booking'. A booking exists locally as `proposed` until the
 * provider confirms it with a receipt.
 */
export function bookingService(db: Db, options: { calendar?: GoogleCalendarService; now?: () => number } = {}) {
  const calendar = options.calendar ?? googleCalendarService(db);
  const now = options.now ?? (() => Date.now());

  async function loadType(companyId: string, ref: BookingRef, { includeArchived = false } = {}) {
    if (!ref.bookingTypeId && !ref.slug) throw unprocessable("Indica bookingTypeId o slug");
    const conditions = [eq(bookingTypes.companyId, companyId)];
    if (!includeArchived) conditions.push(isNull(bookingTypes.archivedAt));
    if (ref.bookingTypeId) conditions.push(eq(bookingTypes.id, ref.bookingTypeId));
    if (ref.slug) conditions.push(eq(bookingTypes.slug, ref.slug));
    const [row] = await db.select().from(bookingTypes).where(and(...conditions)).limit(1);
    if (!row) throw notFound("Tipo de reserva no encontrado");
    return row;
  }

  async function loadEventRow(companyId: string, eventId: string): Promise<CalendarEventRow> {
    const [row] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.companyId, companyId)))
      .limit(1);
    if (!row) throw notFound("Evento no encontrado");
    return row;
  }

  function requireConnection(connectionId: string | null | undefined): string {
    if (!connectionId) {
      throw unprocessable("Este tipo de reserva no tiene Google Calendar asignado. Asígnale una conexión en Agenda.");
    }
    return connectionId;
  }

  async function localBusy(
    companyId: string,
    bookingTypeId: string,
    range: TimeInterval,
    excludeEventId?: string,
  ): Promise<BusyInterval[]> {
    const conditions = [
      eq(calendarEvents.companyId, companyId),
      eq(calendarEvents.bookingTypeId, bookingTypeId),
      inArray(calendarEvents.status, ["proposed", "confirmed"]),
      lt(calendarEvents.startsAt, new Date(range.end)),
      gte(calendarEvents.endsAt, new Date(range.start)),
    ];
    if (excludeEventId) conditions.push(ne(calendarEvents.id, excludeEventId));
    const rows = await db
      .select({ startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt, externalId: calendarEvents.externalId })
      .from(calendarEvents)
      .where(and(...conditions));
    return rows.map((row) => ({
      start: row.startsAt.getTime(),
      end: row.endsAt.getTime(),
      externalId: row.externalId,
    }));
  }

  /**
   * Busy intervals around `range`, widened by the buffer so that a candidate at
   * the edge of the range still sees meetings that end just before it.
   */
  async function busyFor(
    type: BookingTypeRow,
    range: TimeInterval,
    exclude?: { eventId?: string; externalId?: string | null },
  ): Promise<BusyInterval[]> {
    const buffer = type.bufferMinutes * MINUTE_MS;
    const widened = { start: range.start - buffer, end: range.end + buffer };
    const connectionId = requireConnection(type.connectionId);
    const remote = await calendar.freeBusy({
      companyId: type.companyId,
      connectionId,
      from: widened.start,
      to: widened.end,
    });
    const local = await localBusy(type.companyId, type.id, widened, exclude?.eventId);
    const ownExternal = exclude?.externalId ?? null;
    return [
      ...remote.filter((busy) => !(ownExternal && busy.externalId === ownExternal)),
      ...local,
    ];
  }

  /** True when exactly [start, start + duration) is a bookable slot for this type. */
  async function assertSlotBookable(
    type: BookingTypeRow,
    startMs: number,
    exclude?: { eventId?: string; externalId?: string | null },
  ): Promise<void> {
    if (startMs < now()) throw unprocessable("Elige un hueco futuro");
    const interval = { start: startMs, end: startMs + type.durationMinutes * MINUTE_MS };
    const candidates = candidateSlots({
      from: interval.start,
      to: interval.end,
      timeZone: type.timezone,
      weeklyHours: parseWeeklyHours(type.weeklyHours),
      durationMinutes: type.durationMinutes,
    });
    if (!candidates.some((candidate) => candidate.start === startMs)) {
      throw conflict("Ese hueco no está en el horario de la reserva");
    }
    const busy = await busyFor(type, interval, exclude);
    if (!isSlotFree({ interval, busy, bufferMinutes: type.bufferMinutes, now: now() })) {
      throw conflict("Ese hueco ya no está disponible");
    }
  }

  async function applyProviderOutcome(
    eventId: string,
    outcome: ProviderEventOutcome,
    extra: Partial<typeof calendarEvents.$inferInsert> = {},
  ) {
    await db
      .update(calendarEvents)
      .set({
        externalId: outcome.externalId,
        status: outcome.status,
        meetingLink: outcome.meetingLink,
        providerReceipt: outcome.receipt,
        updatedAt: new Date(),
        ...extra,
      })
      .where(eq(calendarEvents.id, eventId));
  }

  async function reload(companyId: string, eventId: string) {
    return loadEventRow(companyId, eventId);
  }

  async function findByIdempotencyKey(companyId: string, idempotencyKey: string) {
    const [row] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.companyId, companyId), eq(calendarEvents.idempotencyKey, idempotencyKey)))
      .limit(1);
    return row ?? null;
  }

  return {
    // ---- booking types

    async listTypes(companyId: string) {
      return db
        .select()
        .from(bookingTypes)
        .where(and(eq(bookingTypes.companyId, companyId), isNull(bookingTypes.archivedAt)))
        .orderBy(asc(bookingTypes.name));
    },

    async getType(companyId: string, ref: BookingRef) {
      return loadType(companyId, ref);
    },

    async createType(companyId: string, input: CreateBookingTypeInput): Promise<BookingTypeRow> {
      try {
        assertValidTimeZone(input.timezone);
      } catch (error) {
        throw unprocessable(error instanceof Error ? error.message : "Zona horaria no válida");
      }
      let weeklyHours;
      try {
        weeklyHours = parseWeeklyHours(input.weeklyHours);
      } catch (error) {
        throw unprocessable(error instanceof Error ? error.message : "Horario semanal no válido");
      }
      if (input.connectionId) {
        await calendar.assertCalendarConnection(companyId, input.connectionId);
      }
      try {
        const [row] = await db
          .insert(bookingTypes)
          .values({
            companyId,
            slug: input.slug,
            name: input.name,
            durationMinutes: input.durationMinutes,
            bufferMinutes: input.bufferMinutes,
            timezone: input.timezone,
            weeklyHours,
            hostAgentId: input.hostAgentId ?? null,
            hostUserId: input.hostUserId ?? null,
            connectionId: input.connectionId ?? null,
          })
          .returning();
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict("Ya existe un tipo de reserva con ese enlace");
        throw error;
      }
    },

    // ---- availability

    /** Free slots in [from, to): weekly hours, buffer, provider freeBusy and local holds. */
    async availability(input: { companyId: string; ref: BookingRef; from: Date; to: Date }) {
      const type = await loadType(input.companyId, input.ref);
      const range = { start: input.from.getTime(), end: input.to.getTime() };
      const candidates = candidateSlots({
        from: range.start,
        to: range.end,
        timeZone: type.timezone,
        weeklyHours: parseWeeklyHours(type.weeklyHours),
        durationMinutes: type.durationMinutes,
      });
      if (candidates.length === 0) return { bookingType: bookingPublicView(type), slots: [] };
      const busy = await busyFor(type, range);
      const free = freeSlots({ candidates, busy, bufferMinutes: type.bufferMinutes, now: now() });
      return {
        bookingType: bookingPublicView(type),
        slots: free.map((slot) => ({ start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString() })),
      };
    },

    // ---- booking lifecycle

    /**
     * Books a slot. Idempotent on (booking slug, attendee email, start): a repeat
     * returns the existing event and does not call the gate again.
     */
    async book(input: {
      companyId: string;
      ref: BookingRef;
      startsAt: Date;
      attendee: BookingAttendee;
      customerId?: string | null;
      opportunityId?: string | null;
      actor: ExternalActionActor;
    }): Promise<BookingOutcome> {
      const type = await loadType(input.companyId, input.ref);
      const connectionId = requireConnection(type.connectionId);
      // Anonymous visitors have no actor: the host of the booking type acts instead,
      // so an agent host's autonomy level applies. Without a host the company acts directly.
      const actor: ExternalActionActor = input.actor.agentId || input.actor.userId
        ? input.actor
        : { agentId: type.hostAgentId, userId: type.hostUserId };
      const email = normalizeEmail(input.attendee.email);
      if (!email) throw unprocessable("El correo del asistente no es válido");
      const phone = normalizePhoneE164(input.attendee.phone ?? null);
      const idempotencyKey = `booking:${type.slug}:${email}:${input.startsAt.toISOString()}`;

      const existing = await findByIdempotencyKey(input.companyId, idempotencyKey);
      if (existing) return { event: existing, created: false, mode: null, actionStatus: null };

      const startMs = input.startsAt.getTime();
      await assertSlotBookable(type, startMs);
      const endsAt = new Date(startMs + type.durationMinutes * MINUTE_MS);
      const contactId = await resolveBookingContact(db, input.companyId, { ...input.attendee, email, phone }, activityActor(actor));

      let event: CalendarEventRow;
      try {
        [event] = await db
          .insert(calendarEvents)
          .values({
            companyId: input.companyId,
            provider: "google_calendar",
            connectionId,
            bookingTypeId: type.id,
            hostAgentId: type.hostAgentId,
            hostUserId: type.hostUserId,
            contactId,
            customerId: input.customerId ?? null,
            opportunityId: input.opportunityId ?? null,
            kind: "meeting",
            title: `${type.name} · ${input.attendee.name.trim()}`,
            startsAt: input.startsAt,
            endsAt,
            status: "proposed",
            attendeeName: input.attendee.name.trim(),
            attendeeEmail: email,
            attendeePhone: phone,
            idempotencyKey,
          })
          .returning();
      } catch (error) {
        if (isUniqueViolation(error)) {
          const raced = await findByIdempotencyKey(input.companyId, idempotencyKey);
          if (raced) return { event: raced, created: false, mode: null, actionStatus: null };
        }
        throw error;
      }

      const gated = await gateExternalAction(db, {
        companyId: input.companyId,
        actionType: "booking",
        actor,
        subjectKind: "calendar_event",
        subjectId: event.id,
        payload: {
          bookingTypeId: type.id,
          startsAt: input.startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          attendeeEmail: email,
          title: event.title,
        },
        idempotencyKey,
        execute: async (): Promise<ExternalActionResult> => {
          const outcome = await calendar.createEvent({
            companyId: input.companyId,
            connectionId,
            title: event.title,
            description: `Reserva ${type.name} con ${input.attendee.name.trim()}`,
            startsAt: input.startsAt,
            endsAt,
            attendeeEmail: email,
            requestId: idempotencyKey,
          });
          await applyProviderOutcome(event.id, outcome);
          return { externalId: outcome.externalId, status: outcome.status };
        },
      });

      await db
        .update(calendarEvents)
        .set({ externalActionId: gated.action.id, updatedAt: new Date() })
        .where(eq(calendarEvents.id, event.id));

      await logActivity(db, {
        companyId: input.companyId,
        ...activityActor(actor),
        action: "calendar.booking.created",
        entityType: "calendar_event",
        entityId: event.id,
        details: { bookingTypeId: type.id, mode: gated.mode, actionStatus: gated.action.status },
      });

      if (contactId) {
        await db.insert(crmActivities).values({
          companyId: input.companyId,
          subjectKind: "contact",
          subjectId: contactId,
          kind: "meeting",
          actorUserId: actor.userId ?? null,
          actorAgentId: actor.agentId ?? null,
          summary: `Reunión reservada: ${type.name} (${input.startsAt.toISOString()})`,
          externalRef: event.id,
        });
      }

      return {
        event: await reload(input.companyId, event.id),
        created: true,
        mode: gated.mode,
        actionStatus: gated.action.status,
      };
    },

    async reschedule(input: { companyId: string; eventId: string; startsAt: Date; actor: ExternalActionActor }): Promise<BookingOutcome> {
      const event = await loadEventRow(input.companyId, input.eventId);
      if (event.status === "cancelled") throw conflict("La reserva está cancelada");
      if (!event.bookingTypeId) throw unprocessable("La reserva no pertenece a un tipo de reserva");
      const type = await loadType(input.companyId, { bookingTypeId: event.bookingTypeId }, { includeArchived: true });
      const connectionId = requireConnection(event.connectionId ?? type.connectionId);

      const startMs = input.startsAt.getTime();
      await assertSlotBookable(type, startMs, { eventId: event.id, externalId: event.externalId });
      const endsAt = new Date(startMs + type.durationMinutes * MINUTE_MS);

      const gated = await gateExternalAction(db, {
        companyId: input.companyId,
        actionType: "booking",
        actor: input.actor,
        subjectKind: "calendar_event",
        subjectId: event.id,
        payload: { startsAt: input.startsAt.toISOString(), endsAt: endsAt.toISOString(), reschedule: true },
        idempotencyKey: `reschedule:${event.id}:${input.startsAt.toISOString()}`,
        execute: async (): Promise<ExternalActionResult> => {
          const outcome = event.externalId
            ? await calendar.updateEvent({
                companyId: input.companyId,
                connectionId,
                externalId: event.externalId,
                startsAt: input.startsAt,
                endsAt,
              })
            : await calendar.createEvent({
                companyId: input.companyId,
                connectionId,
                title: event.title,
                startsAt: input.startsAt,
                endsAt,
                attendeeEmail: event.attendeeEmail ?? "",
                requestId: `reschedule:${event.id}:${input.startsAt.toISOString()}`,
              });
          await applyProviderOutcome(event.id, outcome, { startsAt: input.startsAt, endsAt });
          return { externalId: outcome.externalId, status: outcome.status };
        },
      });

      await logActivity(db, {
        companyId: input.companyId,
        ...activityActor(input.actor),
        action: "calendar.booking.rescheduled",
        entityType: "calendar_event",
        entityId: event.id,
        details: { mode: gated.mode, actionStatus: gated.action.status, startsAt: input.startsAt.toISOString() },
      });
      return {
        event: await reload(input.companyId, event.id),
        created: false,
        mode: gated.mode,
        actionStatus: gated.action.status,
      };
    },

    async cancel(input: { companyId: string; eventId: string; actor: ExternalActionActor }): Promise<BookingOutcome> {
      const event = await loadEventRow(input.companyId, input.eventId);
      if (event.status === "cancelled") {
        return { event, created: false, mode: null, actionStatus: null };
      }
      const connectionId = event.connectionId ?? null;

      const gated = await gateExternalAction(db, {
        companyId: input.companyId,
        actionType: "booking",
        actor: input.actor,
        subjectKind: "calendar_event",
        subjectId: event.id,
        payload: { cancel: true, externalId: event.externalId },
        idempotencyKey: `cancel:${event.id}`,
        execute: async (): Promise<ExternalActionResult> => {
          if (!event.externalId) {
            // Never reached the provider: cancelling locally is the whole change.
            await db
              .update(calendarEvents)
              .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
              .where(eq(calendarEvents.id, event.id));
            return { status: "cancelled", externalId: null };
          }
          const outcome = await calendar.cancelEvent({
            companyId: input.companyId,
            connectionId: requireConnection(connectionId),
            externalId: event.externalId,
          });
          const cancelled = outcome.status === "cancelled";
          await db
            .update(calendarEvents)
            .set({
              providerReceipt: outcome.receipt ?? event.providerReceipt,
              status: cancelled ? "cancelled" : event.status,
              cancelledAt: cancelled ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(calendarEvents.id, event.id));
          return { status: outcome.status, externalId: event.externalId };
        },
      });

      await logActivity(db, {
        companyId: input.companyId,
        ...activityActor(input.actor),
        action: "calendar.booking.cancel_requested",
        entityType: "calendar_event",
        entityId: event.id,
        details: { mode: gated.mode, actionStatus: gated.action.status },
      });
      return {
        event: await reload(input.companyId, event.id),
        created: false,
        mode: gated.mode,
        actionStatus: gated.action.status,
      };
    },

    /** Reminder as a CRM activity. Sending it over a channel belongs to the S3 playbook. */
    /**
     * Re-issues the provider create for a booking whose approved action lost its executor
     * (process restart). Same request id as the original, so the provider can deduplicate.
     */
    async retryCreate(input: { companyId: string; eventId: string; requestId: string }): Promise<ExternalActionResult> {
      const event = await loadEventRow(input.companyId, input.eventId);
      if (event.externalId) throw conflict("La reserva ya existe en Google Calendar");
      if (event.status === "cancelled") throw conflict("La reserva está cancelada");
      const type = event.bookingTypeId
        ? await loadType(input.companyId, { bookingTypeId: event.bookingTypeId }, { includeArchived: true })
        : null;
      const connectionId = requireConnection(event.connectionId ?? type?.connectionId);
      const outcome = await calendar.createEvent({
        companyId: input.companyId,
        connectionId,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        attendeeEmail: event.attendeeEmail ?? "",
        requestId: input.requestId,
      });
      await applyProviderOutcome(event.id, outcome);
      return { externalId: outcome.externalId, status: outcome.status };
    },

    async recordReminder(input: { companyId: string; eventId: string; actor: ExternalActionActor }) {
      const event = await loadEventRow(input.companyId, input.eventId);
      if (!event.contactId) throw unprocessable("La reserva no tiene contacto al que recordar");
      const [activity] = await db
        .insert(crmActivities)
        .values({
          companyId: input.companyId,
          subjectKind: "contact",
          subjectId: event.contactId,
          kind: "task",
          actorUserId: input.actor.userId ?? null,
          actorAgentId: input.actor.agentId ?? null,
          summary: `Recordatorio de reunión: ${event.title} (${event.startsAt.toISOString()})`,
          externalRef: event.id,
        })
        .returning();
      return activity;
    },

    // ---- queries for routes and UI

    async listEvents(input: { companyId: string; status?: string; from?: Date; limit: number }): Promise<EventView[]> {
      const conditions = [eq(calendarEvents.companyId, input.companyId)];
      if (input.status) conditions.push(eq(calendarEvents.status, input.status));
      conditions.push(gte(calendarEvents.startsAt, input.from ?? new Date(now())));
      const rows = await db
        .select({
          event: calendarEvents,
          customerName: customers.name,
          opportunityTitle: opportunities.title,
          bookingTypeName: bookingTypes.name,
        })
        .from(calendarEvents)
        .leftJoin(customers, eq(customers.id, calendarEvents.customerId))
        .leftJoin(opportunities, eq(opportunities.id, calendarEvents.opportunityId))
        .leftJoin(bookingTypes, eq(bookingTypes.id, calendarEvents.bookingTypeId))
        .where(and(...conditions))
        .orderBy(asc(calendarEvents.startsAt))
        .limit(input.limit);
      return rows.map((row) => ({
        ...row.event,
        customerName: row.customerName ?? null,
        opportunityTitle: row.opportunityTitle ?? null,
        bookingTypeName: row.bookingTypeName ?? null,
      }));
    },

    async getEvent(companyId: string, eventId: string) {
      return loadEventRow(companyId, eventId);
    },

    /** Unscoped lookup for routes that check company access on the returned row. */
    async findEventById(eventId: string): Promise<CalendarEventRow | null> {
      const [row] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).limit(1);
      return row ?? null;
    },
  };
}

export type BookingService = ReturnType<typeof bookingService>;
