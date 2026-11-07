import { leadEnrichSchema, leadQualifySchema } from "@paperclipai/shared";
import { badRequest } from "../errors.js";

/** Sprint 3 WP2 agent tools. Schemas mirror packages/paperclip-runner/src/protocol-actions/sprint3/leads.ts; keep them in sync. */
export const LEAD_TOOL_NAMES = ["lead_qualify", "lead_enrich"] as const;
export type LeadToolName = (typeof LEAD_TOOL_NAMES)[number];

const LEAD_TOOL_MODES = ["standard", "skill_test"];

const LEAD_TOOL_DEFINITIONS = [
  {
    name: "lead_qualify",
    effect: "write" as const,
    description: "Qualify a lead against the company qualification criteria (document 'qualification-criteria'). You supply the reasoning: for each criterion, set met to true, false or null and add a short note with the evidence. The service scores the result from the criteria weights, records the sources and stores the qualification. Missing criteria count as not met.",
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
    effect: "write" as const,
    description: "Look up public information about a company from a domain or an email address (company, size, sector, signals and sources). Costs money: it is recorded as an enrichment cost. Use it only when the qualification needs company facts you do not have.",
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
] as const;

export function leadToolDefinitions(workMode: string) {
  if (!LEAD_TOOL_MODES.includes(workMode)) return [];
  return LEAD_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    effect: tool.effect,
    inputSchema: tool.inputSchema,
  }));
}

const leadQualifyArguments = leadQualifySchema;
const leadEnrichArguments = leadEnrichSchema;

/** Tool execution goes through the authenticated HTTP routes so auth, validation and activity logging stay in one place. */
export async function callLeadTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
}) {
  const apiBase = `${input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
  if (input.name === "lead_qualify") {
    const parsed = leadQualifyArguments.safeParse(input.arguments);
    if (!parsed.success) throw badRequest("Invalid lead_qualify arguments", parsed.error.issues);
    const { leadId, ...body } = parsed.data;
    return request(`${apiBase}/companies/${input.companyId}/leads/${leadId}/qualify`, input.token, "POST", body);
  }
  if (input.name === "lead_enrich") {
    const parsed = leadEnrichArguments.safeParse(input.arguments);
    if (!parsed.success) throw badRequest("Invalid lead_enrich arguments", parsed.error.issues);
    return request(`${apiBase}/companies/${input.companyId}/enrichment`, input.token, "POST", parsed.data);
  }
  throw badRequest("Unknown lead tool");
}

async function request(url: string, token: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Lead tool failed (${response.status})`);
  return result;
}
