import { z } from "zod";
import { createCommercialDecisionSchema } from "@paperclipai/shared";
import { badRequest } from "../errors.js";

/** Sprint 3 WP5 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the dispatcher in `project-tools.ts` in sync. */
export const COMMERCIAL_DECISION_TOOL_NAMES = ["decision_create", "decision_get"] as const;

/** Work modes in which an agent may propose a commercial decision. Reading is allowed in every mode. */
const CREATE_WORK_MODES = new Set(["standard", "planning"]);

const uuid = z.string().uuid();

const toolSchemas: Record<(typeof COMMERCIAL_DECISION_TOOL_NAMES)[number], z.ZodTypeAny> = {
  decision_create: createCommercialDecisionSchema,
  decision_get: z.object({ decisionId: uuid }).strict(),
};

const toolDefinitions = [
  {
    name: "decision_create",
    description: "Propose a commercial decision for a human to resolve (approve a message send, approve a proposal, a price exception, discard a lead, escalate a customer, or raise an autonomy level). Declare the subject (kind and id), the subjectVersion you saw, and the effect each option will apply if chosen. A human resolves it; nothing is sent or changed until then.",
    effect: "write" as const,
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["approve_send", "approve_proposal", "price_exception", "discard_lead", "escalate_customer", "raise_autonomy"] },
        title: { type: "string", minLength: 1, maxLength: 300 },
        body: { type: "string", minLength: 1, maxLength: 20000 },
        subject: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["lead", "opportunity", "conversation", "proposal", "customer", "autonomy_policy", "message_draft"] },
            id: { type: "string", minLength: 1, maxLength: 200 },
          },
          required: ["kind", "id"],
          additionalProperties: false,
        },
        subjectVersion: { type: "string", minLength: 1, maxLength: 200, description: "Version of the subject you read (for example its updatedAt ISO timestamp)." },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1, maxLength: 80 },
              label: { type: "string", minLength: 1, maxLength: 200 },
              description: { type: ["string", "null"], maxLength: 2000 },
              style: { type: "string", enum: ["default", "primary", "destructive"] },
              effect: {
                type: "object",
                description: "Effect applied when this option is chosen. Use kind 'none' when the option only records the answer.",
                properties: { kind: { type: "string", enum: ["send_message", "send_proposal", "apply_price_exception", "discard_lead", "escalate_customer", "raise_autonomy", "advance_playbook", "none"] } },
                required: ["kind"],
              },
            },
            required: ["id", "label", "effect"],
          },
        },
        continuation: {
          type: ["object", "null"],
          properties: {
            playbookRunId: { type: ["string", "null"], format: "uuid" },
            messageId: { type: ["string", "null"], maxLength: 200 },
          },
        },
        shadowAgentId: { type: ["string", "null"], format: "uuid" },
        shadowActionType: { type: ["string", "null"], maxLength: 40 },
        expiresInHours: { type: "integer", minimum: 1, maximum: 720, default: 72 },
        idempotencyKey: { type: "string", minLength: 1, maxLength: 255, description: "Stable key for this proposal, so a retry does not create a second decision." },
      },
      required: ["type", "title", "body", "subject", "subjectVersion", "options", "idempotencyKey"],
      additionalProperties: false,
    },
    example: {
      type: "approve_send",
      title: "Enviar el seguimiento a Acme?",
      body: "El cliente pidió precio la semana pasada. Borrador listo.",
      subject: { kind: "message_draft", id: "7f0c2d1e-0000-4000-8000-000000000001" },
      subjectVersion: "2026-10-22T09:00:00.000Z",
      options: [
        { id: "send", label: "Enviar", style: "primary", effect: { kind: "send_message", messageId: "msg-1" } },
        { id: "discard", label: "Descartar", style: "destructive", effect: { kind: "none" } },
      ],
      idempotencyKey: "approve-send-acme-2026-10-22",
    },
  },
  {
    name: "decision_get",
    description: "Read one commercial decision: its status, options, declared effects and resolution.",
    effect: "read" as const,
    inputSchema: {
      type: "object",
      properties: { decisionId: { type: "string", format: "uuid" } },
      required: ["decisionId"],
      additionalProperties: false,
    },
    example: { decisionId: "00000000-0000-4000-8000-000000000001" },
  },
];

export function commercialDecisionToolDefinitions(workMode: string) {
  return toolDefinitions
    .filter((tool) => tool.name !== "decision_create" || CREATE_WORK_MODES.has(workMode))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/** Tool execution goes through the authenticated HTTP routes so auth, validation and audit stay in one place. */
export async function callCommercialDecisionTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  issueId?: string;
  agentId?: string;
}) {
  if (!(input.name in toolSchemas)) throw badRequest("Unknown commercial decision tool");
  const parsed = toolSchemas[input.name as keyof typeof toolSchemas]!.safeParse(input.arguments);
  if (!parsed.success) throw badRequest("Invalid commercial decision tool arguments", parsed.error.issues);
  const args = parsed.data as Record<string, unknown>;

  let path: string;
  let method: "GET" | "POST";
  let body: unknown;
  switch (input.name) {
    case "decision_create":
      path = `/companies/${input.companyId}/commercial-decisions`;
      method = "POST";
      body = args;
      break;
    case "decision_get":
      path = `/commercial-decisions/${args.decisionId}`;
      method = "GET";
      break;
    default:
      throw badRequest("Unknown commercial decision tool");
  }

  const base = input.apiUrl.replace(/\/+$/g, "").replace(/\/api$/g, "");
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : `Commercial decision tool failed (${response.status})`);
  }
  return result;
}
