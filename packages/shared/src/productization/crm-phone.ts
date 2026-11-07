import { z } from "zod";

// CRM phone bridge (S2 G). Contracts for projecting inbound `chat_voice_*` calls into the CRM
// and for durable callback requests. Nothing here dials: a callback is a request until a
// provider receipt is recorded.

export const CRM_PHONE_API_PREFIX = "/companies/:companyId/crm-phone" as const;

export const CRM_PHONE_CALLBACK_STATUSES = [
  "awaiting_consent",
  "awaiting_approval",
  "pending",
  /** Leased by the executor. Network may or may not have started; see `networkStartedAt`. */
  "dialing",
  /** A real provider session receipt is stored. */
  "dialed",
  /** The provider request may have been sent without a confirmed session. Never re-dialed automatically. */
  "dial_unknown",
  /** The provider rejected the request (known outcome, no call) and attempts are exhausted. */
  "failed",
  /** The agreed window passed before every requirement held. */
  "missed",
  "cancelled",
] as const;
export type CrmPhoneCallbackStatus = (typeof CRM_PHONE_CALLBACK_STATUSES)[number];

/** Callback statuses a board user can still cancel or whose approval can still be withdrawn. */
export const CRM_PHONE_CALLBACK_OPEN_STATUSES = ["awaiting_consent", "awaiting_approval", "pending"] as const;

/**
 * Distinct voice principal for outbound calls to an external contact. It is NOT a company member:
 * `chat_voice_sessions.caller_id` is `crm_callback:<callbackId>` and `caller_authority` is `crm_callback`.
 * It carries no private-work authority (no submit_request / answer_question / reply delivery).
 */
export const CRM_CALLBACK_CALLER_AUTHORITY = "crm_callback" as const;
export const CRM_CALLBACK_CALLER_PREFIX = "crm_callback:" as const;

export const CRM_PHONE_DIAL_BLOCKERS = [
  "not_pending",
  "not_due",
  "window_missed",
  "consent_missing",
  "approval_required",
  "gate_revoked",
  "budget_blocked",
  "connector_unavailable",
  "connector_agent_mismatch",
  "agent_unavailable",
  "requester_unavailable",
  "approver_unavailable",
  "task_unavailable",
  "contact_unavailable",
  "phone_changed",
  "attempt_backoff",
  "quota_company_concurrency",
  "quota_contact_daily",
  "unknown_outcome",
] as const;
export type CrmPhoneDialBlocker = (typeof CRM_PHONE_DIAL_BLOCKERS)[number];

export const CRM_PHONE_IDENTITY_STATES = ["matched", "unresolved", "ambiguous", "manual"] as const;
export type CrmPhoneIdentityState = (typeof CRM_PHONE_IDENTITY_STATES)[number];

export const CRM_PHONE_CONSENT_BASES = ["contact_consent_call", "caller_requested_verified", "missing"] as const;
export type CrmPhoneConsentBasis = (typeof CRM_PHONE_CONSENT_BASES)[number];

/** Where a statement in a summary comes from. There is no generated (LLM) source on purpose. */
export const CRM_PHONE_EVIDENCE_SOURCES = ["provider_report", "voice_agent_transcript", "caller_transcript"] as const;
export type CrmPhoneEvidenceSource = (typeof CRM_PHONE_EVIDENCE_SOURCES)[number];

export const CRM_PHONE_UNAVAILABLE_CODES = [
  "phone_connector_unavailable",
  "report_pending",
  "report_unavailable",
] as const;

export interface CrmPhoneEvidenceStatement {
  text: string;
  at: string;
  source: CrmPhoneEvidenceSource;
}

export interface CrmPhoneCallSummary {
  /** Extractive only: quoted turns and provider metadata. Never a generated narrative. */
  method: "extractive";
  reportStatus: "available" | "unavailable";
  provider: {
    durationSeconds: number | null;
    transcriptTurns: number;
    reportUpdatedAt: string | null;
  };
  callerStatements: CrmPhoneEvidenceStatement[];
  agentStatements: CrmPhoneEvidenceStatement[];
  /** Facts this bridge could not obtain, so a reader never mistakes absence for an empty call. */
  notAvailable: Array<"generated_summary" | "caller_number" | "recording" | "transcript">;
}

export interface CrmPhoneCall {
  id: string;
  companyId: string;
  endpointId: string;
  sessionId: string;
  providerSessionId: string;
  issueId: string | null;
  contactId: string | null;
  leadId: string | null;
  activityId: string | null;
  identityState: CrmPhoneIdentityState;
  identityBasis: string | null;
  summary: CrmPhoneCallSummary;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmPhoneCallback {
  id: string;
  companyId: string;
  contactId: string;
  projectId: string | null;
  issueId: string | null;
  sourceCallId: string | null;
  assigneeAgentId: string;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  scheduledFor: string;
  timezone: string;
  reason: string;
  status: CrmPhoneCallbackStatus;
  consentBasis: CrmPhoneConsentBasis;
  gateLevel: "draft_only" | "send_with_approval" | "send_direct";
  approvedByUserId: string | null;
  approvedAt: string | null;
  /** Current revision of the request and the revision a board user approved (null = none). */
  revision: number;
  approvedRevision: number | null;
  /** Provider session id. Only ever set from a real provider response. */
  providerReceiptId: string | null;
  dialedAt: string | null;
  dialAttempts: number;
  /** Set when the provider request began; with no receipt the outcome is unknown and is not retried. */
  networkStartedAt: string | null;
  lastErrorCode: string | null;
  /** Blockers from the last server-side evaluation (null = never evaluated). */
  dialBlockers: CrmPhoneDialBlocker[] | null;
  createdAt: string;
}

export interface CrmPhoneConnectorStatus {
  available: boolean;
  endpointId: string | null;
  /** Actionable explanation shown instead of a success when no telephone line is configured. */
  reason: string | null;
}

export interface CrmPhoneDialAuthorization {
  allowed: boolean;
  blockers: CrmPhoneDialBlocker[];
  endpointId: string | null;
  gateLevel: CrmPhoneCallback["gateLevel"];
}

const uuid = z.string().uuid();

export const crmPhoneScopeSchema = z
  .object({ contactId: uuid.optional(), projectId: uuid.optional(), issueId: uuid.optional() })
  .strict()
  .refine((value) => Object.values(value).filter(Boolean).length === 1, {
    message: "Provide exactly one scope: contactId, projectId or issueId",
  });

export const crmPhoneCallSummaryGetInputSchema = z
  .object({ callId: uuid, scope: crmPhoneScopeSchema })
  .strict();
export type CrmPhoneCallSummaryGetInput = z.infer<typeof crmPhoneCallSummaryGetInputSchema>;

const ianaTimezone = z.string().min(1).max(64).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid IANA timezone" });

export const crmPhoneCallScheduleInputSchema = z
  .object({
    contactId: uuid,
    assigneeAgentId: uuid,
    /** Instant with an explicit offset, e.g. 2026-10-23T10:00:00+02:00. */
    scheduledFor: z.string().datetime({ offset: true }),
    timezone: ianaTimezone,
    reason: z.string().trim().min(3).max(500),
    projectId: uuid.optional(),
    issueId: uuid.optional(),
    sourceCallId: uuid.optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();
export type CrmPhoneCallScheduleInput = z.infer<typeof crmPhoneCallScheduleInputSchema>;

export const crmPhoneLinkContactInputSchema = z.object({ contactId: uuid }).strict();
/** Approval is bound to the revision the board user saw; a changed request needs a new approval. */
export const crmPhoneCallbackApproveInputSchema = z.object({ revision: z.number().int().min(1) }).strict();
/** Changing the time re-reads the contact's number server-side and invalidates any approval. */
export const crmPhoneCallbackRescheduleInputSchema = z
  .object({
    revision: z.number().int().min(1),
    scheduledFor: z.string().datetime({ offset: true }),
    timezone: ianaTimezone,
  })
  .strict();
export type CrmPhoneCallbackRescheduleInput = z.infer<typeof crmPhoneCallbackRescheduleInputSchema>;

export interface CrmPhoneToolDefinition {
  name: "call_summary_get" | "call_schedule";
  description: string;
  method: "POST";
  path: string;
  /** Agent calls must carry a precise scope and may never choose the dialed number. */
  inputSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  risk: "read" | "write";
}

const uuidProperty = { type: "string", format: "uuid" } as const;

export const CRM_PHONE_TOOL_DEFINITIONS: readonly CrmPhoneToolDefinition[] = [
  {
    name: "call_summary_get",
    description:
      "Read the stored summary of a completed inbound phone call. The summary is extractive: quoted caller and agent turns plus provider metadata, with unavailable facts listed explicitly. Requires exactly one scope (contactId, projectId or issueId) that the call is linked to.",
    method: "POST",
    path: `${CRM_PHONE_API_PREFIX}/tools/call_summary_get`,
    risk: "read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["callId", "scope"],
      properties: {
        callId: uuidProperty,
        scope: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          maxProperties: 1,
          properties: { contactId: uuidProperty, projectId: uuidProperty, issueId: uuidProperty },
        },
      },
    },
    responseSchema: {
      type: "object",
      required: ["call"],
      properties: {
        call: {
          type: "object",
          required: ["id", "identityState", "summary", "startedAt"],
          properties: {
            id: uuidProperty,
            identityState: { enum: [...CRM_PHONE_IDENTITY_STATES] },
            contactId: { type: ["string", "null"] },
            leadId: { type: ["string", "null"] },
            issueId: { type: ["string", "null"] },
            startedAt: { type: "string", format: "date-time" },
            endedAt: { type: ["string", "null"], format: "date-time" },
            summary: {
              type: "object",
              required: ["method", "reportStatus", "provider", "callerStatements", "agentStatements", "notAvailable"],
              properties: {
                method: { const: "extractive" },
                reportStatus: { enum: ["available", "unavailable"] },
                provider: { type: "object" },
                callerStatements: { type: "array", items: { type: "object", required: ["text", "at", "source"] } },
                agentStatements: { type: "array", items: { type: "object", required: ["text", "at", "source"] } },
                notAvailable: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
  {
    name: "call_schedule",
    description:
      "Create a durable callback request for a contact with a date, time and timezone. It does NOT dial. A task is created only when current contact call consent and call autonomy allow it; approval-required requests wait for board approval and missing consent creates no task. The number comes from the contact record, never from the caller. Scheduling is not calling: a server-side executor dials later, only if at that moment the contact's call consent, call autonomy (or an approval of this exact revision), budget, connector and membership all still allow it, and records the provider's session id as the receipt. A lost outcome is never re-dialed. Returns 409 phone_connector_unavailable when no telephone line is configured.",
    method: "POST",
    path: `${CRM_PHONE_API_PREFIX}/tools/call_schedule`,
    risk: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["contactId", "assigneeAgentId", "scheduledFor", "timezone", "reason", "idempotencyKey"],
      properties: {
        contactId: uuidProperty,
        assigneeAgentId: uuidProperty,
        scheduledFor: { type: "string", format: "date-time", description: "ISO 8601 instant with offset" },
        timezone: { type: "string", description: "IANA timezone, e.g. Europe/Madrid" },
        reason: { type: "string", minLength: 3, maxLength: 500 },
        projectId: uuidProperty,
        issueId: uuidProperty,
        sourceCallId: uuidProperty,
        idempotencyKey: { type: "string", minLength: 8, maxLength: 120 },
      },
    },
    responseSchema: {
      type: "object",
      required: ["callback", "created"],
      properties: {
        created: { type: "boolean" },
        callback: {
          type: "object",
          required: ["id", "status", "scheduledFor", "timezone", "assigneeAgentId", "issueId", "consentBasis", "gateLevel"],
          properties: {
            id: uuidProperty,
            status: { enum: [...CRM_PHONE_CALLBACK_STATUSES] },
            scheduledFor: { type: "string", format: "date-time" },
            timezone: { type: "string" },
            assigneeAgentId: uuidProperty,
            issueId: { type: ["string", "null"] },
            consentBasis: { enum: [...CRM_PHONE_CONSENT_BASES] },
            gateLevel: { enum: ["draft_only", "send_with_approval", "send_direct"] },
            dialedAt: { type: ["string", "null"] },
            providerReceiptId: { type: ["string", "null"] },
          },
        },
      },
    },
  },
];

export const CRM_PHONE_ROUTES = [
  { method: "GET", path: `${CRM_PHONE_API_PREFIX}/status`, access: "board|agent", purpose: "Telephone connector availability" },
  { method: "GET", path: `${CRM_PHONE_API_PREFIX}/calls`, access: "board", purpose: "Completed inbound calls projected into the CRM" },
  { method: "POST", path: `${CRM_PHONE_API_PREFIX}/calls/sync`, access: "board", purpose: "Project stored voice reports; idempotent by provider session" },
  { method: "POST", path: `${CRM_PHONE_API_PREFIX}/calls/:callId/link-contact`, access: "board", purpose: "Human identity decision for an unresolved call" },
  { method: "GET", path: `${CRM_PHONE_API_PREFIX}/callbacks`, access: "board", purpose: "Callback requests" },
  { method: "POST", path: `${CRM_PHONE_API_PREFIX}/callbacks/:callbackId/approve`, access: "board", purpose: "Approve the current revision of a callback below send_direct" },
  { method: "POST", path: `${CRM_PHONE_API_PREFIX}/callbacks/:callbackId/revoke-approval`, access: "board", purpose: "Withdraw an approval before the call is dialed" },
  { method: "POST", path: `${CRM_PHONE_API_PREFIX}/callbacks/:callbackId/reschedule`, access: "board", purpose: "Change the time of an open callback; invalidates approval" },
  { method: "POST", path: `${CRM_PHONE_API_PREFIX}/callbacks/:callbackId/cancel`, access: "board", purpose: "Cancel a callback (or close an unknown dial outcome)" },
  { method: "GET", path: `${CRM_PHONE_API_PREFIX}/callbacks/:callbackId/dial-authorization`, access: "board|agent(assignee)", purpose: "Current consent, gate, budget, connector and membership decision (read only; does not dial)" },
  ...CRM_PHONE_TOOL_DEFINITIONS.map((tool) => ({ method: tool.method, path: tool.path, access: "board|agent", purpose: tool.name })),
] as const;
