import { createHash } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { bookingTypes, calendarEvents, heartbeatRuns } from "@paperclipai/db";
import type { ToolGatewayService } from "../tool-gateway.js";
import { conflict, unprocessable } from "../../errors.js";
import { ExternalActionUncertainError } from "../external-action-gate.js";
import type { CalendarConnectorCall, CalendarConnectorInvoker } from "./google-calendar.js";

const MAX_ARGUMENT_BYTES = 16 * 1024;
const MAX_PROVIDER_WAIT_MS = 30_000;

function assertAllowedArguments(call: CalendarConnectorCall, durationMinutes: number) {
  const args = call.arguments;
  const keys = (allowed: string[]) => {
    if (Object.keys(args).some((key) => !allowed.includes(key))) {
      throw unprocessable("Unexpected Google Calendar arguments.");
    }
  };
  const instant = (key: string) => typeof args[key] === "string" ? Date.parse(String(args[key])) : Number.NaN;
  if (call.toolName === "list-events") {
    keys(["timeMin", "timeMax", "singleEvents"]);
    const from = instant("timeMin");
    const to = instant("timeMax");
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from ||
        to - from > 31 * 24 * 60 * 60_000 || args.singleEvents !== true) {
      throw unprocessable("Calendar availability range is invalid.");
    }
    return;
  }
  if (call.toolName === "create_event") {
    keys(["summary", "description", "startTime", "endTime", "attendees", "requestId"]);
    const attendee = Array.isArray(args.attendees) && args.attendees.length === 1 &&
      args.attendees[0] && typeof args.attendees[0] === "object"
      ? args.attendees[0] as Record<string, unknown> : null;
    if (typeof args.summary !== "string" || typeof args.requestId !== "string" ||
        args.requestId.length > 320 || !attendee || typeof attendee.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email) ||
        !Number.isFinite(instant("startTime")) ||
        instant("endTime") - instant("startTime") !== durationMinutes * 60_000) {
      throw unprocessable("Google Calendar event arguments are invalid.");
    }
    return;
  }
  keys(call.toolName === "update_event"
    ? ["eventId", "startTime", "endTime"]
    : ["eventId"]);
  if (typeof args.eventId !== "string") throw unprocessable("Google Calendar event id is required.");
  if (call.toolName === "update_event" &&
      (!Number.isFinite(instant("startTime")) ||
       instant("endTime") - instant("startTime") !== durationMinutes * 60_000)) {
    throw unprocessable("Google Calendar event duration is invalid.");
  }
}

function stableIdempotencyKey(call: CalendarConnectorCall): string {
  if (call.toolName === "list-events") return "";
  const requestId = call.arguments.requestId;
  const identity = typeof requestId === "string"
    ? requestId
    : createHash("sha256").update(JSON.stringify(call.arguments)).digest("hex");
  return "calendar:" + call.bookingTypeId + ":" + call.toolName + ":" + identity;
}

function providerResult(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.structuredContent && typeof record.structuredContent === "object") return record.structuredContent;
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : null;
  if (data?.structuredContent && typeof data.structuredContent === "object") return data.structuredContent;
  if (typeof record.content === "string") {
    try { return JSON.parse(record.content); } catch { return value; }
  }
  return value;
}

/** Creates the Calendar invoker without any startup network work. */
export function createAuthorizedCalendarInvoker(db: Db, gateway: ToolGatewayService): CalendarConnectorInvoker {
  return async (call) => {
    if (Buffer.byteLength(JSON.stringify(call.arguments), "utf8") > MAX_ARGUMENT_BYTES) {
      throw unprocessable("Calendar arguments exceed the supported size.");
    }
    const idempotencyKey = stableIdempotencyKey(call);
    const [type] = await db.select().from(bookingTypes).where(and(
      eq(bookingTypes.id, call.bookingTypeId),
      eq(bookingTypes.companyId, call.companyId),
      isNull(bookingTypes.archivedAt),
    )).limit(1);
    if (!type || type.connectionId !== call.connectionId || (!type.hostAgentId && !type.hostUserId)) {
      throw unprocessable("The Google Calendar connection is no longer assigned to this booking type.");
    }
    assertAllowedArguments(call, type.durationMinutes);
    if (call.toolName === "create_event") {
      const [event] = await db.select().from(calendarEvents).where(and(
        eq(calendarEvents.companyId, call.companyId),
        eq(calendarEvents.bookingTypeId, type.id),
        eq(calendarEvents.connectionId, call.connectionId),
        eq(calendarEvents.idempotencyKey, String(call.arguments.requestId)),
      )).limit(1);
      const attendee = (call.arguments.attendees as Array<Record<string, unknown>>)[0];
      if (!event || event.externalId || event.startsAt.getTime() !== Date.parse(String(call.arguments.startTime)) ||
          event.endsAt.getTime() !== Date.parse(String(call.arguments.endTime)) ||
          event.attendeeEmail !== attendee.email || event.title !== call.arguments.summary) {
        throw conflict("The provider request does not match the persisted booking.", { code: "calendar_event_context_mismatch" });
      }
    } else if (call.toolName === "update_event" || call.toolName === "delete_event") {
      const [event] = await db.select().from(calendarEvents).where(and(
        eq(calendarEvents.companyId, call.companyId),
        eq(calendarEvents.bookingTypeId, type.id),
        eq(calendarEvents.connectionId, call.connectionId),
        eq(calendarEvents.externalId, String(call.arguments.eventId)),
        ne(calendarEvents.status, "cancelled"),
      )).limit(1);
      if (!event) throw conflict("The calendar event is outside this booking type.", { code: "calendar_event_context_mismatch" });
    }
    try {
      if (call.authority.kind === "agent_real_run") {
        if (call.authority.agentId !== type.hostAgentId) {
          throw unprocessable("The authenticated agent run is not the host assigned to this booking type.");
        }
        if (type.hostUserId) {
          const [run] = await db.select({ responsibleUserId: heartbeatRuns.responsibleUserId }).from(heartbeatRuns).where(and(
            eq(heartbeatRuns.id, call.authority.runId),
            eq(heartbeatRuns.companyId, call.companyId),
            eq(heartbeatRuns.agentId, call.authority.agentId),
          )).limit(1);
          if (!run || run.responsibleUserId !== type.hostUserId) {
            throw unprocessable("The authenticated run does not carry the user connection grant assigned to this booking type.");
          }
        }
        const session = await gateway.createSession({
          companyId: call.companyId,
          agentId: call.authority.agentId,
          runId: call.authority.runId,
          issueId: call.authority.issueId ?? null,
          ttlMs: MAX_PROVIDER_WAIT_MS + 5_000,
          actorType: "agent",
          actorId: call.authority.agentId,
        });
        const tools = await gateway.listToolsForSession(session.token);
        const tool = tools.find((candidate) => candidate.connectionId === call.connectionId &&
          candidate.upstreamToolName === call.toolName,
        );
        if (!tool) throw unprocessable("The active agent run does not have this Google Calendar tool assigned.");
        const result = await gateway.executeTool({
          sessionToken: session.token,
          tool: tool.name,
          parameters: call.arguments,
          idempotencyKey,
          timeoutMs: MAX_PROVIDER_WAIT_MS,
        });
        if ("decision" in result && result.decision === "ask_first") {
          throw conflict("Calendar access is awaiting approval.", { code: "calendar_tool_approval_pending" });
        }
        if (result.status !== "completed" && result.status !== "replayed") {
          throw conflict("Calendar provider execution did not complete.", { code: "calendar_tool_execution_incomplete" });
        }
        return providerResult(result.result);
      }

      const result = await gateway.executeCalendarDelegatedTool({
        companyId: call.companyId,
        connectionId: call.connectionId,
        bookingTypeId: call.bookingTypeId,
        authority: call.authority,
        toolName: call.toolName,
        parameters: call.arguments,
        idempotencyKey,
        timeoutMs: MAX_PROVIDER_WAIT_MS,
      });
      return providerResult(result.result);
    } catch (error) {
      const failure = error as { status?: unknown; reasonCode?: unknown };
      if (failure.reasonCode === "calendar_execution_outcome_unknown" ||
          (call.toolName !== "list-events" && (failure.status === 502 || failure.status === 504))) {
        throw new ExternalActionUncertainError("Calendar provider outcome is unknown. Inspect the provider before retrying.");
      }
      throw error;
    }
  };
}
