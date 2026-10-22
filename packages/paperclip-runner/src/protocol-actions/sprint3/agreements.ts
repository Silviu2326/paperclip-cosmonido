import type { Sprint3ToolDefinition } from "./types.js";

/** Sprint 3 WP10 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const agreementsToolDefinitions = [
  {
    name: "agreement_get",
    description: "Read a recurring service agreement: its deliverables per period, status, renewal settings and the periods with their assignments and renewal ids.",
    effect: "read",
    inputSchema: {
      type: "object",
      properties: { agreementId: { type: "string", format: "uuid" } },
      required: ["agreementId"],
      additionalProperties: false,
    },
    example: { agreementId: "00000000-0000-4000-8000-000000000001" },
  },
  {
    name: "upsell_suggest",
    description: "Record upsell suggestions derived from the conversations with a customer. This only records a suggestion for the account manager; it does not sell, price or send anything.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        customerId: { type: ["string", "null"], format: "uuid" },
        agreementId: { type: ["string", "null"], format: "uuid" },
        suggestions: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 300 },
              rationale: { type: "string", maxLength: 5000 },
              evidence: { type: "array", maxItems: 20, items: { type: "string", maxLength: 2000 } },
              estimatedPriceCents: { type: ["integer", "null"], minimum: 0 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["title", "rationale", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
    example: {
      suggestions: [{ title: "Auditoría trimestral", rationale: "El cliente preguntó tres veces por cumplimiento.", evidence: ["Conversación del 12/10"], confidence: 0.6 }],
    },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
