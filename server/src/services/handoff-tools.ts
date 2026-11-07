import { z } from "zod";
import { badRequest } from "../errors.js";

/** Sprint 3 WP9 agent tool. Keep this name in `PRODUCT_TOOL_NAMES` and in the server dispatcher in sync. */
export const HANDOFF_TOOL_NAMES = ["handoff_to_delivery"] as const;

type WorkMode = "standard" | "planning" | "ask";

export const HANDOFF_TOOL_DEFINITIONS = [
  {
    name: "handoff_to_delivery",
    description: "Hand an accepted proposal (proposalId) or a sold opportunity (opportunityId plus title and acceptanceCriteria) to delivery: creates the project, the assignment with its acceptance criteria, installs the optional team, writes the brief and adds the handoff package comment. Idempotent and resumable: calling it again for the same source completes a partial handoff without duplicating the project or the assignment.",
    effect: "write" as const,
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
] as const;

const handoffArguments = z.object({
  proposalId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  acceptanceCriteria: z.string().trim().min(1).max(20_000).optional(),
  budgetCents: z.number().int().min(0).optional(),
  customerId: z.string().uuid().optional().nullable(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  teamCatalogKey: z.string().trim().max(200).optional().nullable(),
  summaryMarkdown: z.string().trim().max(50_000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (Boolean(value.proposalId) === Boolean(value.opportunityId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pass exactly one of proposalId or opportunityId" });
  }
  if (value.opportunityId && (!value.title || !value.acceptanceCriteria)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An opportunity handoff requires title and acceptanceCriteria" });
  }
});

/** Read tools are available in every work mode; write tools only in standard mode. */
export function handoffToolDefinitions(workMode: WorkMode | string) {
  return HANDOFF_TOOL_DEFINITIONS
    .filter((tool) => (tool.effect as string) === "read" || workMode === "standard")
    .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
}

export interface HandoffToolInput {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  issueId: string;
  agentId: string;
}

/** Tool execution goes through the authenticated HTTP route, so auth, company scope and audit are the same as for humans. */
export async function callHandoffTool(input: HandoffToolInput) {
  if (input.name !== "handoff_to_delivery") throw badRequest("Unknown handoff tool");
  const parsed = handoffArguments.safeParse(input.arguments);
  if (!parsed.success) throw badRequest("Invalid handoff tool arguments", parsed.error.issues);
  const args = parsed.data;

  const base = `/companies/${input.companyId}/handoffs`;
  const path = args.proposalId ? `${base}/from-proposal` : `${base}/from-opportunity`;
  const body = args.proposalId
    ? { proposalId: args.proposalId, assigneeAgentId: args.assigneeAgentId ?? null, teamCatalogKey: args.teamCatalogKey ?? null, summaryMarkdown: args.summaryMarkdown ?? null }
    : {
      opportunityId: args.opportunityId,
      title: args.title,
      acceptanceCriteria: args.acceptanceCriteria,
      budgetCents: args.budgetCents ?? 0,
      customerId: args.customerId ?? null,
      assigneeAgentId: args.assigneeAgentId ?? null,
      teamCatalogKey: args.teamCatalogKey ?? null,
      summaryMarkdown: args.summaryMarkdown ?? null,
    };

  const response = await fetch(`${input.apiUrl.replace(/\/+$/g, "").replace(/\/api$/g, "")}/api${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  // 201 = complete, 202 = partial (resumable with the same call).
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Handoff tool failed (${response.status})`);
  return { status: response.status === 201 ? "complete" : "partial", receipt: result };
}
