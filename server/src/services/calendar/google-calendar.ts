import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { toolConnections } from "@paperclipai/db";
import { unprocessable } from "../../errors.js";
import type { TimeInterval } from "./slots.js";

// Google Calendar over the Google Workspace connector that the company already
// has (app slug google-calendar, profiles calendar.read / calendar.write).
// Tool calls go through an injected invoker so that the same code path serves
// the tool gateway in production and a simulated provider in tests.

export const GOOGLE_CALENDAR_TEMPLATE_KEY = "google-calendar";
export const GOOGLE_CALENDAR_HOST = "calendarmcp.googleapis.com";

// Upstream tool names. Verify against the live MCP tool list before enabling;
// reads use the names the tool-access catalog already lists for google-calendar.
export const GOOGLE_CALENDAR_TOOLS = {
  listEvents: "list-events",
  createEvent: "create_event",
  updateEvent: "update_event",
  deleteEvent: "delete_event",
} as const;

export interface CalendarConnectorCall {
  companyId: string;
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/** Calls one tool of a company's connection and returns the parsed result. */
export type CalendarConnectorInvoker = (call: CalendarConnectorCall) => Promise<unknown>;

export type ProviderEventStatus = "confirmed" | "proposed" | "cancelled";

export interface ProviderEventOutcome {
  /** Provider id; null when the provider returned no receipt. */
  externalId: string | null;
  /** Confirmed only when the provider itself reports it. */
  status: ProviderEventStatus;
  meetingLink: string | null;
  receipt: Record<string, unknown> | null;
}

export interface BusyInterval extends TimeInterval {
  externalId: string | null;
}

const UNWIRED_INVOKER: CalendarConnectorInvoker = async () => {
  throw unprocessable(
    "Google Calendar no está conectado a esta operación. Conecta Google Calendar en Apps y asígnalo al tipo de reserva.",
  );
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Unwraps { event: {...} } results and the bare event object alike.
function eventFrom(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response)) return null;
  if (isRecord(response.event)) return response.event;
  return response;
}

/**
 * Classifies the provider response. A receipt is an event object with a string
 * id. Only a receipt whose own status matches the expectation is trusted:
 * `confirmed` for create/update, `cancelled` for cancel. Anything else, including
 * no receipt at all, stays `proposed`.
 */
export function classifyProviderResponse(
  response: unknown,
  expect: "confirmed" | "cancelled" = "confirmed",
): ProviderEventOutcome {
  const event = eventFrom(response);
  const id = event && typeof event.id === "string" && event.id.length > 0 ? event.id : null;
  const providerStatus = event && typeof event.status === "string" ? event.status : null;
  const meetingLink =
    event && typeof event.hangoutLink === "string"
      ? event.hangoutLink
      : event && typeof event.meetingLink === "string"
        ? event.meetingLink
        : null;

  if (!id) return { externalId: null, status: "proposed", meetingLink: null, receipt: null };

  const status: ProviderEventStatus =
    expect === "confirmed"
      ? providerStatus === "confirmed" ? "confirmed" : "proposed"
      : providerStatus === "cancelled" ? "cancelled" : "proposed";

  return { externalId: id, status, meetingLink, receipt: event };
}

function timeOf(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const raw = typeof value.dateTime === "string" ? value.dateTime : null;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function googleCalendarService(db: Db, options: { invoke?: CalendarConnectorInvoker } = {}) {
  const invoke = options.invoke ?? UNWIRED_INVOKER;

  /**
   * Confirms the connection belongs to the company, is active, and is the
   * Google Calendar app. Anything else is a 422 with an actionable message.
   */
  async function assertCalendarConnection(companyId: string, connectionId: string) {
    const [row] = await db
      .select({
        id: toolConnections.id,
        status: toolConnections.status,
        enabled: toolConnections.enabled,
        config: toolConnections.config,
      })
      .from(toolConnections)
      .where(and(eq(toolConnections.id, connectionId), eq(toolConnections.companyId, companyId)))
      .limit(1);
    if (!row) {
      throw unprocessable("La conexión de Google Calendar no existe en esta empresa. Vuelve a conectarla en Apps.");
    }
    const config = isRecord(row.config) ? row.config : {};
    let host = "";
    try {
      host = typeof config.url === "string" ? new URL(config.url).hostname : "";
    } catch {
      host = "";
    }
    const isCalendar = config.sourceTemplateKey === GOOGLE_CALENDAR_TEMPLATE_KEY || host === GOOGLE_CALENDAR_HOST;
    if (!isCalendar) {
      throw unprocessable("La conexión elegida no es de Google Calendar. Asigna una conexión de Google Calendar al tipo de reserva.");
    }
    if (row.status !== "active" || !row.enabled) {
      throw unprocessable("La conexión de Google Calendar no está activa. Reconéctala o actívala en Apps para reservar.");
    }
    return row;
  }

  async function call(companyId: string, connectionId: string, toolName: string, args: Record<string, unknown>) {
    await assertCalendarConnection(companyId, connectionId);
    return invoke({ companyId, connectionId, toolName, arguments: args });
  }

  return {
    assertCalendarConnection,

    /** Busy intervals in [from, to) for the calendar behind this connection. */
    async freeBusy(input: { companyId: string; connectionId: string; from: number; to: number }): Promise<BusyInterval[]> {
      const response = await call(input.companyId, input.connectionId, GOOGLE_CALENDAR_TOOLS.listEvents, {
        timeMin: new Date(input.from).toISOString(),
        timeMax: new Date(input.to).toISOString(),
        singleEvents: true,
      });
      const items = isRecord(response) && Array.isArray(response.items)
        ? response.items
        : Array.isArray(response) ? response : [];
      const busy: BusyInterval[] = [];
      for (const item of items) {
        if (!isRecord(item) || item.status === "cancelled") continue;
        const start = timeOf(item.start);
        const end = timeOf(item.end);
        if (start === null || end === null || end <= start) continue;
        busy.push({ start, end, externalId: typeof item.id === "string" ? item.id : null });
      }
      return busy;
    },

    async createEvent(input: {
      companyId: string;
      connectionId: string;
      title: string;
      description?: string | null;
      startsAt: Date;
      endsAt: Date;
      attendeeEmail: string;
      requestId: string;
    }): Promise<ProviderEventOutcome> {
      const response = await call(input.companyId, input.connectionId, GOOGLE_CALENDAR_TOOLS.createEvent, {
        summary: input.title,
        description: input.description ?? undefined,
        startTime: input.startsAt.toISOString(),
        endTime: input.endsAt.toISOString(),
        attendees: [{ email: input.attendeeEmail }],
        requestId: input.requestId,
      });
      return classifyProviderResponse(response, "confirmed");
    },

    async updateEvent(input: {
      companyId: string;
      connectionId: string;
      externalId: string;
      startsAt: Date;
      endsAt: Date;
    }): Promise<ProviderEventOutcome> {
      const response = await call(input.companyId, input.connectionId, GOOGLE_CALENDAR_TOOLS.updateEvent, {
        eventId: input.externalId,
        startTime: input.startsAt.toISOString(),
        endTime: input.endsAt.toISOString(),
      });
      return classifyProviderResponse(response, "confirmed");
    },

    /** Cancelled only when the provider reports it; otherwise `proposed` (pending). */
    async cancelEvent(input: { companyId: string; connectionId: string; externalId: string }): Promise<ProviderEventOutcome> {
      const response = await call(input.companyId, input.connectionId, GOOGLE_CALENDAR_TOOLS.deleteEvent, {
        eventId: input.externalId,
      });
      const outcome = classifyProviderResponse(response, "cancelled");
      return { ...outcome, externalId: outcome.externalId ?? input.externalId };
    },
  };
}

export type GoogleCalendarService = ReturnType<typeof googleCalendarService>;
