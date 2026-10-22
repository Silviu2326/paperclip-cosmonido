import type { Sprint3ToolDefinition } from "./types.js";

/**
 * Sprint 3 WP8 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync.
 * A sent proposal revision is immutable: any change creates a new revision (revision + 1).
 */
const REVISION_NOTE = "A sent revision is immutable: any change creates a new revision with revision + 1, and the sent revision stays as it was.";

export const proposalsToolDefinitions = [
  {
    name: "proposal_create",
    description: `Create a draft commercial proposal from an opportunity (scope, price, optional deposit, validity). Repeating the same idempotencyKey returns the existing proposal. The draft is not visible to the customer until proposal_send. ${REVISION_NOTE}`,
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        opportunityId: { type: ["string", "null"], format: "uuid" },
        customerId: { type: ["string", "null"], format: "uuid" },
        title: { type: "string", minLength: 1, maxLength: 300 },
        scope: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              title: { type: "string", minLength: 1, maxLength: 300 },
              description: { type: ["string", "null"], maxLength: 5000 },
              quantity: { type: ["number", "null"], minimum: 0 },
              unitPriceCents: { type: ["integer", "null"], minimum: 0 },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
        terms: { type: ["string", "null"], maxLength: 20000 },
        priceCents: { type: "integer", minimum: 0 },
        depositCents: { type: ["integer", "null"], minimum: 0 },
        currency: { type: "string", pattern: "^[A-Z]{3}$", default: "EUR" },
        validUntil: { type: ["string", "null"], format: "date-time" },
        idempotencyKey: { type: "string", minLength: 1, maxLength: 255 },
      },
      required: ["title", "scope", "priceCents", "idempotencyKey"],
      additionalProperties: false,
    },
    example: {
      title: "Implantación del CRM",
      scope: [{ title: "Configuración inicial", quantity: 1, unitPriceCents: 150000 }],
      priceCents: 150000,
      depositCents: 50000,
      currency: "EUR",
      idempotencyKey: "proposal-crm-2026-10-22",
    },
  },
  {
    name: "proposal_send",
    description: `Send a draft proposal. via "link" returns the public URL for delivery; via "message" sends it through the message channel when available. Only draft revisions can be sent. ${REVISION_NOTE}`,
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: { type: "string", format: "uuid" },
        via: { type: "string", enum: ["link", "message"], default: "link" },
        recipient: { type: ["string", "null"], maxLength: 300 },
      },
      required: ["proposalId"],
      additionalProperties: false,
    },
    example: { proposalId: "00000000-0000-4000-8000-000000000000", via: "link" },
  },
  {
    name: "proposal_get",
    description: `Read one proposal: status, revision, price, deposit, payment status and acceptance evidence. ${REVISION_NOTE}`,
    effect: "read",
    inputSchema: {
      type: "object",
      properties: { proposalId: { type: "string", format: "uuid" } },
      required: ["proposalId"],
      additionalProperties: false,
    },
    example: { proposalId: "00000000-0000-4000-8000-000000000000" },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
