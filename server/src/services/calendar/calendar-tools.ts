import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../../errors.js";
import { bookingService, type BookingService } from "./booking.js";
import { attendeeSchema, bookingTypeSlugSchema } from "./schemas.js";
import type { GoogleCalendarService } from "./google-calendar.js";

// Agent tool handlers for the calendar_* names in CRM_TOOL_NAMES. Every call is
// scoped to the agent's company; the agent acts as its own actor in the gate, so
// its autonomy level decides whether a booking is sent or left as a draft.

export const CALENDAR_TOOL_NAMES = [
  "calendar_availability",
  "calendar_book",
  "calendar_reschedule",
  "calendar_cancel",
] as const;

export type CalendarToolName = (typeof CALENDAR_TOOL_NAMES)[number];

const isoInstant = z.string().min(1).max(40).refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO 8601 date-time");

const argumentSchemas = {
  calendar_availability: z.object({ slug: bookingTypeSlugSchema, from: isoInstant, to: isoInstant }),
  calendar_book: z.object({ slug: bookingTypeSlugSchema, startsAt: isoInstant, attendee: attendeeSchema }),
  calendar_reschedule: z.object({ eventId: z.string().uuid(), startsAt: isoInstant }),
  calendar_cancel: z.object({ eventId: z.string().uuid() }),
} satisfies Record<CalendarToolName, z.ZodType>;

export const CALENDAR_TOOL_DEFINITIONS = [
  {
    name: "calendar_availability",
    description: "List free slots for a booking type between two ISO instants (max 31 days).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Booking type slug" },
        from: { type: "string", description: "ISO 8601 start" },
        to: { type: "string", description: "ISO 8601 end" },
      },
      required: ["slug", "from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "calendar_book",
    description: "Book a free slot for a booking type. Sent or left as a draft depending on the agent's booking autonomy.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        startsAt: { type: "string", description: "ISO 8601 start of a slot returned by calendar_availability" },
        attendee: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
          },
          required: ["name", "email"],
          additionalProperties: false,
        },
      },
      required: ["slug", "startsAt", "attendee"],
      additionalProperties: false,
    },
  },
  {
    name: "calendar_reschedule",
    description: "Move a booking to a new free slot of the same booking type.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, startsAt: { type: "string" } },
      required: ["eventId", "startsAt"],
      additionalProperties: false,
    },
  },
  {
    name: "calendar_cancel",
    description: "Cancel a booking. Marked cancelled only when the provider confirms it.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
  },
] as const;

export function calendarAgentTools(
  db: Db,
  options: { calendar?: GoogleCalendarService; now?: () => number; booking?: BookingService } = {},
) {
  const booking = options.booking ?? bookingService(db, { calendar: options.calendar, now: options.now });

  return {
    definitions: CALENDAR_TOOL_DEFINITIONS,

    async call(
      name: string,
      rawArguments: unknown,
      context: { companyId: string; agentId: string; runId: string; issueId?: string | null },
    ): Promise<unknown> {
      if (!(CALENDAR_TOOL_NAMES as readonly string[]).includes(name)) {
        throw badRequest(`Unknown calendar tool: ${name}`);
      }
      const parsed = argumentSchemas[name as CalendarToolName].safeParse(rawArguments ?? {});
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid arguments");
      const actor = { agentId: context.agentId };
      const authority = {
        kind: "agent_real_run" as const,
        agentId: context.agentId,
        runId: context.runId,
        issueId: context.issueId ?? null,
      };

      switch (name as CalendarToolName) {
        case "calendar_availability": {
          const args = parsed.data as z.infer<typeof argumentSchemas.calendar_availability>;
          return booking.availability({
            companyId: context.companyId,
            ref: { slug: args.slug },
            from: new Date(args.from),
            to: new Date(args.to),
            authority,
          });
        }
        case "calendar_book": {
          const args = parsed.data as z.infer<typeof argumentSchemas.calendar_book>;
          const outcome = await booking.book({
            companyId: context.companyId,
            ref: { slug: args.slug },
            startsAt: new Date(args.startsAt),
            attendee: args.attendee,
            actor,
            authority,
          });
          return {
            eventId: outcome.event.id,
            status: outcome.event.status,
            created: outcome.created,
            mode: outcome.mode,
            actionStatus: outcome.actionStatus,
            startsAt: outcome.event.startsAt.toISOString(),
            endsAt: outcome.event.endsAt.toISOString(),
          };
        }
        case "calendar_reschedule": {
          const args = parsed.data as z.infer<typeof argumentSchemas.calendar_reschedule>;
          const outcome = await booking.reschedule({
            companyId: context.companyId,
            eventId: args.eventId,
            startsAt: new Date(args.startsAt),
            actor,
            authority,
          });
          return { eventId: outcome.event.id, status: outcome.event.status, mode: outcome.mode, actionStatus: outcome.actionStatus };
        }
        case "calendar_cancel": {
          const args = parsed.data as z.infer<typeof argumentSchemas.calendar_cancel>;
          const outcome = await booking.cancel({ companyId: context.companyId, eventId: args.eventId, actor, authority });
          return { eventId: outcome.event.id, status: outcome.event.status, mode: outcome.mode, actionStatus: outcome.actionStatus };
        }
      }
    },
  };
}
