import { z } from "zod";
import { badRequest } from "../errors.js";
import { createProposalSchema, sendProposalSchema } from "@paperclipai/shared";

/**
 * Sprint 3 WP8 agent tools. Tool execution goes through the authenticated HTTP routes so that
 * company checks, validation and activity logging stay in one place (same pattern as media-tools).
 * The JSON definitions mirror packages/paperclip-runner/src/protocol-actions/sprint3/proposals.ts.
 */
export const PROPOSAL_TOOL_NAMES = ["proposal_create", "proposal_send", "proposal_get"] as const;
export type ProposalToolName = (typeof PROPOSAL_TOOL_NAMES)[number];

const REVISION_NOTE = "A sent revision is immutable: any change creates a new revision with revision + 1, and the sent revision stays as it was.";

const id = z.string().uuid();
const toolSchemas: Record<ProposalToolName, z.ZodTypeAny> = {
  proposal_create: createProposalSchema,
  proposal_send: z.object({ proposalId: id }).merge(sendProposalSchema),
  proposal_get: z.object({ proposalId: id }),
};

export interface ProposalToolDefinition {
  name: ProposalToolName;
  description: string;
  effect: "read" | "write";
  inputSchema: Record<string, unknown>;
}

const scopeItemJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 300 },
    description: { type: ["string", "null"], maxLength: 5000 },
    quantity: { type: ["number", "null"], minimum: 0 },
    unitPriceCents: { type: ["integer", "null"], minimum: 0 },
  },
  required: ["title"],
  additionalProperties: false,
};

const PROPOSAL_TOOL_DEFINITIONS: ProposalToolDefinition[] = [
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
        scope: { type: "array", minItems: 1, maxItems: 100, items: scopeItemJsonSchema },
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
  },
];

/** Returns the proposal tools available in a work mode. Write tools are hidden in read-only mode. */
export function proposalToolDefinitions(workMode: string): ProposalToolDefinition[] {
  return PROPOSAL_TOOL_DEFINITIONS.filter((tool) => tool.effect === "read" || workMode !== "read_only");
}

export async function callProposalTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  issueId?: string | null;
  agentId: string;
}) {
  if (!(PROPOSAL_TOOL_NAMES as readonly string[]).includes(input.name)) throw badRequest("Unknown proposal tool");
  const name = input.name as ProposalToolName;
  const parsed = toolSchemas[name]!.safeParse(input.arguments);
  if (!parsed.success) throw badRequest("Invalid proposal tool arguments", parsed.error.issues);
  const args = parsed.data as Record<string, unknown>;

  let path: string;
  let method: "GET" | "POST" = "GET";
  let body: unknown;
  switch (name) {
    case "proposal_create":
      path = `/companies/${input.companyId}/proposals`;
      method = "POST";
      body = args;
      break;
    case "proposal_send":
      path = `/proposals/${args.proposalId}/send`;
      method = "POST";
      body = { via: args.via ?? "link", recipient: args.recipient ?? null };
      break;
    case "proposal_get":
      path = `/proposals/${args.proposalId}`;
      break;
  }

  const response = await fetch(`${input.apiUrl.replace(/\/+$/g, "").replace(/\/api$/g, "")}/api${path!}`, {
    method: method!,
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : `Proposal tool failed (${response.status})`);
  }
  return result;
}
