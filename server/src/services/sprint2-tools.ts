import { z } from "zod";
import { convertLeadSchema } from "@paperclipai/shared";
import { badRequest } from "../errors.js";

// Sprint 2 agent tools as one dispatcher, mirroring sprint3-tools.ts. Every call goes through the
// authenticated HTTP API with the run's token, so company access, validation, the external action
// gate and activity logging apply to agents exactly as they do to the board. The company is always
// the run's company; tool arguments cannot change it.
//
// The domain tool modules are imported lazily inside the dispatcher: this file is loaded by the
// runner tool authority, which sits on the import path of the CRM services themselves, so a static
// import here would close a cycle (opportunities -> ... -> tool authority -> this file -> crm-tools
// -> opportunities) and leave schemas undefined at module evaluation time.

export const CRM_SPRINT2_TOOL_NAMES = [
  "crm_search",
  "crm_get_customer",
  "crm_create_customer",
  "crm_create_contact",
  "crm_create_opportunity",
  "crm_update_opportunity_stage",
  "crm_set_next_action",
  "crm_log_activity",
  "commitment_create",
  "commitment_resolve",
] as const;
export const LEAD_SPRINT2_TOOL_NAMES = ["lead_get", "lead_list", "lead_triage", "lead_convert"] as const;
export const CONVERSATION_SPRINT2_TOOL_NAMES = [
  "conversation_list",
  "conversation_get",
  "message_draft",
  "message_send",
  "message_reply",
  "conversation_set_state",
] as const;
export const CALENDAR_SPRINT2_TOOL_NAMES = ["calendar_availability", "calendar_book", "calendar_reschedule", "calendar_cancel"] as const;
export const MEMORY_SPRINT2_TOOL_NAMES = ["customer_memory_get", "customer_memory_append"] as const;
export const WEBCHAT_SPRINT2_TOOL_NAMES = ["webchat_handoff"] as const;

export const SPRINT2_TOOL_NAMES: readonly string[] = [
  ...CRM_SPRINT2_TOOL_NAMES,
  ...LEAD_SPRINT2_TOOL_NAMES,
  ...CONVERSATION_SPRINT2_TOOL_NAMES,
  ...CALENDAR_SPRINT2_TOOL_NAMES,
  ...MEMORY_SPRINT2_TOOL_NAMES,
  ...WEBCHAT_SPRINT2_TOOL_NAMES,
];

export interface Sprint2ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  issueId: string;
  agentId: string;
}

const uuid = z.string().uuid();
const isoInstant = z.string().min(1).max(40).refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO 8601 date-time");
const leadIdArgs = z.object({ leadId: uuid });
const has = (names: readonly string[], name: string) => names.includes(name);

/** Calls the authenticated company API. A 202 is the gate's answer for an action that waits for approval. */
async function api(input: Sprint2ToolCall, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const base = input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok && response.status !== 202) {
    throw new Error(typeof result.error === "string" ? result.error : `Sprint 2 tool failed (${response.status})`);
  }
  return result;
}

async function callLeadTool(input: Sprint2ToolCall): Promise<unknown> {
  const { leadListQuerySchema, triageLeadSchema } = await import("./leads/leads.js");
  switch (input.name) {
    case "lead_get": {
      const { leadId } = leadIdArgs.parse(input.arguments);
      return api(input, "GET", `/leads/${leadId}`);
    }
    case "lead_list": {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(leadListQuerySchema.parse(input.arguments))) {
        if (value !== undefined && value !== null) query.set(key, String(value));
      }
      return api(input, "GET", `/companies/${input.companyId}/leads?${query}`);
    }
    case "lead_triage": {
      const args = leadIdArgs
        .extend({
          priority: triageLeadSchema.shape.priority,
          language: triageLeadSchema.shape.language,
          assignedAgentId: triageLeadSchema.shape.assignedAgentId,
        })
        .parse(input.arguments);
      const { leadId, ...body } = args;
      return api(input, "POST", `/leads/${leadId}/triage`, triageLeadSchema.parse(body));
    }
    case "lead_convert": {
      const args = leadIdArgs
        .extend({
          customerId: convertLeadSchema.shape.customerId,
          contactId: convertLeadSchema.shape.contactId,
          createOpportunity: convertLeadSchema.shape.createOpportunity,
          opportunityTitle: convertLeadSchema.shape.opportunityTitle,
          idempotencyKey: convertLeadSchema.shape.idempotencyKey,
        })
        .parse(input.arguments);
      const { leadId, ...body } = args;
      return api(input, "POST", `/leads/${leadId}/convert`, convertLeadSchema.parse(body));
    }
    default:
      throw badRequest(`Unknown lead tool: ${input.name}`);
  }
}

async function callCalendarTool(input: Sprint2ToolCall): Promise<unknown> {
  const { attendeeSchema, bookingTypeSlugSchema } = await import("./calendar/schemas.js");
  switch (input.name) {
    case "calendar_availability": {
      const args = z.object({ slug: bookingTypeSlugSchema, from: isoInstant, to: isoInstant }).parse(input.arguments);
      const query = new URLSearchParams({ slug: args.slug, from: args.from, to: args.to });
      return api(input, "GET", `/companies/${input.companyId}/calendar/availability?${query}`);
    }
    case "calendar_book": {
      const args = z.object({ slug: bookingTypeSlugSchema, startsAt: isoInstant, attendee: attendeeSchema }).parse(input.arguments);
      return api(input, "POST", `/companies/${input.companyId}/calendar/events`, args);
    }
    case "calendar_reschedule": {
      const args = z.object({ eventId: uuid, startsAt: isoInstant }).parse(input.arguments);
      return api(input, "POST", `/calendar/events/${args.eventId}/reschedule`, { startsAt: args.startsAt });
    }
    case "calendar_cancel": {
      const args = z.object({ eventId: uuid }).parse(input.arguments);
      return api(input, "POST", `/calendar/events/${args.eventId}/cancel`, {});
    }
    default:
      throw badRequest(`Unknown calendar tool: ${input.name}`);
  }
}

/** Runs one Sprint 2 tool call through the authenticated API; throws for names outside SPRINT2_TOOL_NAMES. */
export async function callSprint2Tool(input: Sprint2ToolCall): Promise<unknown> {
  if (has(CRM_SPRINT2_TOOL_NAMES, input.name)) {
    const { callCrmTool } = await import("./crm/crm-tools.js");
    return callCrmTool(input);
  }
  if (has(LEAD_SPRINT2_TOOL_NAMES, input.name)) return callLeadTool(input);
  if (has(CONVERSATION_SPRINT2_TOOL_NAMES, input.name)) {
    const { callConversationTool } = await import("./conversations/message-tools.js");
    return callConversationTool(input);
  }
  if (has(CALENDAR_SPRINT2_TOOL_NAMES, input.name)) return callCalendarTool(input);
  if (has(MEMORY_SPRINT2_TOOL_NAMES, input.name)) {
    const { callCustomerMemoryTool } = await import("./crm/memory-tools.js");
    return callCustomerMemoryTool(input);
  }
  if (has(WEBCHAT_SPRINT2_TOOL_NAMES, input.name)) {
    const { callWebchatTool } = await import("./conversations/webchat-tools.js");
    return callWebchatTool(input);
  }
  throw badRequest(`Unknown Sprint 2 tool: ${input.name}`);
}
