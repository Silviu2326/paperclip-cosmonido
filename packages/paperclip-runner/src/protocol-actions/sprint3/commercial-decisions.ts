import type { Sprint3ToolDefinition } from "./types.js";

/** Sprint 3 WP5 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const commercial_decisionsToolDefinitions = [
  {
    name: "decision_create",
    description: "Propose a commercial decision for a human to resolve (approve a message send, approve a proposal, a price exception, discard a lead, escalate a customer, or raise an autonomy level). Declare the subject (kind and id), the subjectVersion you saw, and the effect each option will apply if chosen. A human resolves it; nothing is sent or changed until then.",
    effect: "write",
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
        subjectVersion: { type: "string", minLength: 1, maxLength: 200 },
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
        expiresInHours: { type: "integer", minimum: 1, maximum: 720 },
        idempotencyKey: { type: "string", minLength: 1, maxLength: 255 },
      },
      required: ["type", "title", "body", "subject", "subjectVersion", "options", "idempotencyKey"],
      additionalProperties: false,
    },
    example: {
      type: "approve_send",
      title: "Enviar el seguimiento a Acme?",
      body: "El cliente pidió precio la semana pasada. Borrador listo.",
      subject: { kind: "message_draft", id: "msg-draft-1" },
      subjectVersion: "2026-10-22T09:00:00.000Z",
      options: [
        { id: "send", label: "Enviar", style: "primary", effect: { kind: "send_message", messageId: "msg-draft-1" } },
        { id: "discard", label: "Descartar", style: "destructive", effect: { kind: "none" } },
      ],
      idempotencyKey: "approve-send-acme-2026-10-22",
    },
  },
  {
    name: "decision_get",
    description: "Read one commercial decision: its status, options, declared effects and resolution.",
    effect: "read",
    inputSchema: {
      type: "object",
      properties: { decisionId: { type: "string", format: "uuid" } },
      required: ["decisionId"],
      additionalProperties: false,
    },
    example: { decisionId: "00000000-0000-4000-8000-000000000001" },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
