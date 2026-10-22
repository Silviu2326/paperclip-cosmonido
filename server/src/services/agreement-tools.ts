import { z } from "zod";
import { upsellSuggestSchema } from "@paperclipai/shared";
import { badRequest } from "../errors.js";

/** Sprint 3 WP10 agent tools. Keep these names in `PRODUCT_TOOL_NAMES` and in the server dispatcher in sync. */
export const AGREEMENT_TOOL_NAMES = ["agreement_get", "upsell_suggest"] as const;

type WorkMode = "standard" | "planning" | "ask";

export const AGREEMENT_TOOL_DEFINITIONS = [
  {
    name: "agreement_get",
    description: "Read a recurring service agreement: its deliverables per period, status, renewal settings and the periods with their assignments and renewal ids.",
    effect: "read" as const,
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
    effect: "write" as const,
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
] as const;

const agreementGetArguments = z.object({ agreementId: z.string().uuid() });

/** Read tools are available in every work mode; write tools only in standard mode. */
export function agreementToolDefinitions(workMode: WorkMode | string) {
  return AGREEMENT_TOOL_DEFINITIONS
    .filter((tool) => tool.effect === "read" || workMode === "standard")
    .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
}

export interface AgreementToolInput {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  issueId: string;
  agentId: string;
}

async function callApi(input: AgreementToolInput, method: "GET" | "POST", path: string, body?: unknown) {
  const response = await fetch(`${input.apiUrl.replace(/\/+$/g, "").replace(/\/api$/g, "")}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Agreement tool failed (${response.status})`);
  return result;
}

/** Tool execution goes through the authenticated HTTP routes, so auth, company scope and audit are the same as for humans. */
export async function callAgreementTool(input: AgreementToolInput) {
  switch (input.name) {
    case "agreement_get": {
      const parsed = agreementGetArguments.safeParse(input.arguments);
      if (!parsed.success) throw badRequest("Invalid agreement tool arguments", parsed.error.issues);
      const agreementId = parsed.data.agreementId;
      const [agreement, periods] = await Promise.all([
        callApi(input, "GET", `/service-agreements/${agreementId}`),
        callApi(input, "GET", `/service-agreements/${agreementId}/periods`),
      ]);
      return { ...agreement, periods };
    }
    case "upsell_suggest": {
      const parsed = upsellSuggestSchema.safeParse(input.arguments);
      if (!parsed.success) throw badRequest("Invalid upsell tool arguments", parsed.error.issues);
      return callApi(input, "POST", `/companies/${input.companyId}/upsell-suggestions`, parsed.data);
    }
    default:
      throw badRequest("Unknown agreement tool");
  }
}
