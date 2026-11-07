import { commitmentsExtractSchema } from "@paperclipai/shared";
import { badRequest } from "../errors.js";

/** Sprint 3 WP7 agent tools. Schemas mirror packages/paperclip-runner/src/protocol-actions/sprint3/commitments.ts; keep them in sync. */
export const COMMITMENT_TOOL_NAMES = ["commitments_extract"] as const;

const COMMITMENT_TOOL_MODES = ["standard", "skill_test"];

const COMMITMENT_TOOL_DEFINITIONS = [
  {
    name: "commitments_extract",
    effect: "write" as const,
    description: "Propose commitments found in one conversation. You read the messages and supply the candidates: who made the commitment (us or them), what was promised, an optional due date and your confidence from 0 to 1 with the supporting quote. The service normalizes and deduplicates them and stores them as proposed until a person or playbook confirms them.",
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
] as const;

export function commitmentToolDefinitions(workMode: string) {
  if (!COMMITMENT_TOOL_MODES.includes(workMode)) return [];
  return COMMITMENT_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    effect: tool.effect,
    inputSchema: tool.inputSchema,
  }));
}

/** Tool execution goes through the authenticated HTTP route so auth and validation stay in one place. */
export async function callCommitmentTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
}) {
  if (input.name !== "commitments_extract") throw badRequest("Unknown commitment tool");
  const apiBase = `${input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
  const parsed = commitmentsExtractSchema.safeParse(input.arguments);
  if (!parsed.success) throw badRequest("Invalid commitments_extract arguments", parsed.error.issues);
  const { conversationId, ...body } = parsed.data;
  const response = await fetch(`${apiBase}/companies/${input.companyId}/conversations/${conversationId}/commitments/extract`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Commitment tool failed (${response.status})`);
  return result;
}
