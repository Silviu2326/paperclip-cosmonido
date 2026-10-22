import type { Sprint3ToolDefinition } from "./types.js";

/** Sprint 3 WP6-WP7 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const commitmentsToolDefinitions = [
  {
    name: "commitments_extract",
    description: "Propose commitments found in one conversation. You read the messages and supply the candidates: who made the commitment (us or them), what was promised, an optional due date and your confidence from 0 to 1 with the supporting quote. The service normalizes and deduplicates them and stores them as proposed until a person or playbook confirms them.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: { type: "string", format: "uuid" },
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              who: { type: "string", enum: ["us", "them"] },
              what: { type: "string", minLength: 1, maxLength: 2000 },
              dueAt: { type: ["string", "null"], format: "date-time" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              evidence: { type: ["string", "null"], maxLength: 2000 },
            },
            required: ["who", "what", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["conversationId", "candidates"],
      additionalProperties: false,
    },
    example: {
      conversationId: "00000000-0000-4000-8000-000000000001",
      candidates: [{ who: "us", what: "Send the revised proposal", dueAt: null, confidence: 0.8, evidence: "I will send it tomorrow" }],
    },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
