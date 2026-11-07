import type { Sprint3ToolDefinition } from "./types.js";

/** Sprint 3 WP2 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const leadsToolDefinitions = [
  {
    name: "lead_qualify",
    description: "Qualify a lead against the company qualification criteria (document 'qualification-criteria'). You supply the reasoning: for each criterion, set met to true, false or null and add a short note with the evidence. The service scores the result from the criteria weights, records the sources and stores the qualification. Missing criteria count as not met.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string", format: "uuid" },
        assessments: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              criterion: { type: "string", minLength: 1, maxLength: 80, description: "Criterion key from the criteria document." },
              met: { type: ["boolean", "null"], description: "true when the evidence meets the criterion, false when it does not, null when unknown." },
              note: { type: ["string", "null"], maxLength: 2000 },
            },
            required: ["criterion", "met"],
            additionalProperties: false,
          },
        },
        sources: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["enrichment", "conversation", "context", "agent"] },
              ref: { type: "string", minLength: 1, maxLength: 500 },
              label: { type: ["string", "null"], maxLength: 300 },
              url: { type: ["string", "null"], format: "uri", maxLength: 2000 },
            },
            required: ["kind", "ref"],
            additionalProperties: false,
          },
        },
        enrichment: { type: ["object", "null"], description: "Optional enrichment result from lead_enrich." },
      },
      required: ["leadId", "assessments"],
      additionalProperties: false,
    },
    example: {
      leadId: "00000000-0000-4000-8000-000000000001",
      assessments: [{ criterion: "budget", met: true, note: "Mentions an approved budget of 10k in the last call" }],
      sources: [{ kind: "conversation", ref: "message-1" }],
    },
  },
  {
    name: "lead_enrich",
    description: "Look up public information about a company from a domain or an email address (company, size, sector, signals and sources). Costs money: it is recorded as an enrichment cost. Use it only when the qualification needs company facts you do not have.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 3, maxLength: 320, description: "A domain (example.com) or an email address." },
        leadId: { type: ["string", "null"], format: "uuid" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    example: { query: "example.com" },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
