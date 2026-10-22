import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { conversationMessages, externalActions } from "@paperclipai/db";
import type { ChangeOpportunityStage } from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";
import { bookingService } from "./calendar/booking.js";
import type { GoogleCalendarService } from "./calendar/google-calendar.js";
import { conversationMessageService } from "./conversations/messages.js";
import { EXECUTOR_UNAVAILABLE_REASON, runApprovedExternalAction, type ExternalActionResult, type GateExternalActionOutput } from "./external-action-gate.js";
import { approvalService } from "./approvals.js";

// Re-runs an approved action whose in-process executor was lost on restart.
// Only the three types below can be rebuilt from stored data:
//   message      -> the draft in conversation_messages is delivered again by its transport;
//   booking      -> the calendar event is created again with the original request id;
//   stage_change -> the opportunity stage is changed with the original expectedVersion.
// Any other type, or an action not waiting for an executor, is refused with 409.

export interface RetryExternalActionOptions {
  /** Needed for booking retries. Without it a booking retry is refused. */
  calendar?: GoogleCalendarService;
}

const RETRYABLE_TYPES = ["message", "booking", "stage_change"] as const;

export async function retryExternalAction(
  db: Db,
  actionId: string,
  options: RetryExternalActionOptions = {},
): Promise<GateExternalActionOutput> {
  const [action] = await db.select().from(externalActions).where(eq(externalActions.id, actionId)).limit(1);
  if (!action) throw notFound("External action not found");
  if (action.mode !== "approval" || action.status !== "approved") {
    throw conflict(`External action is ${action.status}; only approved actions waiting for an executor can be retried`, { status: action.status });
  }
  const reason = (action.result as { reason?: string } | null)?.reason;
  if (reason !== EXECUTOR_UNAVAILABLE_REASON) {
    throw conflict("External action does not wait for an executor", { reason: reason ?? null });
  }
  if (!(RETRYABLE_TYPES as readonly string[]).includes(action.actionType)) {
    throw conflict(`Retry is not supported for external actions of type ${action.actionType}`, { actionType: action.actionType });
  }

  const approval = action.approvalId ? await approvalService(db).getById(action.approvalId) : null;
  const approvalPayload = ((approval?.payload ?? {}) as { payload?: Record<string, unknown> }).payload ?? {};
  const actor = { userId: action.actorUserId ?? null, agentId: action.actorAgentId ?? null };

  if (action.actionType === "message") {
    const [message] = await db
      .select({ id: conversationMessages.id })
      .from(conversationMessages)
      .where(and(eq(conversationMessages.companyId, action.companyId), eq(conversationMessages.externalActionId, action.id)))
      .limit(1);
    if (!message) throw conflict("No outbound message is linked to this external action");
    const { deliver } = await conversationMessageService(db).deliveryExecutor(action.companyId, message.id, actor);
    return runApprovedExternalAction(db, action.id, deliver);
  }

  if (action.actionType === "booking") {
    if (!action.subjectId || action.subjectKind !== "calendar_event") {
      throw conflict("The booking of this external action is not known");
    }
    if (!approvalPayload.bookingTypeId || approvalPayload.reschedule || approvalPayload.cancel) {
      throw conflict("Only the creation of a booking can be retried");
    }
    if (!options.calendar) throw conflict("Google Calendar is not configured in this process");
    const bookings = bookingService(db, { calendar: options.calendar });
    const eventId = action.subjectId;
    const requestId = action.idempotencyKey ?? `retry:${action.id}`;
    return runApprovedExternalAction(db, action.id, () => bookings.retryCreate({ companyId: action.companyId, eventId, requestId }));
  }

  // stage_change
  if (action.subjectKind !== "opportunity" || !action.subjectId) {
    throw conflict("The opportunity of this external action is not known");
  }
  const body = approvalPayload as Partial<ChangeOpportunityStage>;
  if (typeof body.stageKey !== "string" || typeof body.expectedVersion !== "number") {
    throw conflict("The stage change of this external action cannot be rebuilt");
  }
  const input = { stageKey: body.stageKey, expectedVersion: body.expectedVersion, reason: body.reason ?? null } as ChangeOpportunityStage;
  const opportunityId = action.subjectId;
  const companyId = action.companyId;
  return runApprovedExternalAction(db, action.id, async (): Promise<ExternalActionResult> => {
    // Loaded lazily: the CRM opportunities module sits in an import cycle with the runner tools.
    const { opportunityService } = await import("./crm/opportunities.js");
    const opportunity = await opportunityService(db).changeStage(companyId, opportunityId, input, actor);
    return { opportunity };
  });
}
