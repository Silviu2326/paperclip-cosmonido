import type { Sprint3ToolDefinition } from "./types.js";

/** Sprint 3 WP9 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const handoffToolDefinitions = [
  {
    name: "handoff_to_delivery",
    description: "Hand an accepted proposal (proposalId) or a sold opportunity (opportunityId plus title and acceptanceCriteria) to delivery: creates the project, the assignment with its acceptance criteria, installs the optional team, writes the brief and adds the handoff package comment. Idempotent and resumable: calling it again for the same source completes a partial handoff without duplicating the project or the assignment.",
    effect: "write",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: { type: "string", format: "uuid" },
        opportunityId: { type: "string", format: "uuid" },
        title: { type: "string", maxLength: 300 },
        acceptanceCriteria: { type: "string", maxLength: 20000 },
        budgetCents: { type: "integer", minimum: 0 },
        customerId: { type: ["string", "null"], format: "uuid" },
        assigneeAgentId: { type: ["string", "null"], format: "uuid" },
        teamCatalogKey: { type: ["string", "null"], maxLength: 200 },
        summaryMarkdown: { type: ["string", "null"], maxLength: 50000 },
      },
      required: [],
      additionalProperties: false,
    },
    example: { proposalId: "00000000-0000-4000-8000-000000000001", summaryMarkdown: "Cliente pidió entrega en dos semanas." },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
