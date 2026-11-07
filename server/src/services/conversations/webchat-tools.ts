import { z } from "zod";
import { CRM_TOOL_DESCRIPTIONS, type CrmToolName } from "@paperclipai/shared";
import { badRequest } from "../../errors.js";

// Agent tool for web chat (webchat_handoff in CRM_TOOL_NAMES). Like project-tools.ts and
// message-tools.ts, the call goes through the authenticated API, so company access, validation
// and activity logging apply to agents and the board the same way.

const schemas = {
  webchat_handoff: z.object({ conversationId: z.string().uuid() }),
} satisfies Record<string, z.ZodType>;

export const WEBCHAT_TOOL_NAMES = Object.keys(schemas) as (keyof typeof schemas)[];

export function webchatToolDefinitions() {
  return WEBCHAT_TOOL_NAMES.map((name) => ({
    name,
    description: CRM_TOOL_DESCRIPTIONS[name as CrmToolName],
    inputSchema: z.toJSONSchema(schemas[name]),
  }));
}

export interface WebchatToolCall {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
}

export async function callWebchatTool(input: WebchatToolCall) {
  if (input.name !== "webchat_handoff") throw badRequest("Unknown web chat tool");
  const args = schemas.webchat_handoff.parse(input.arguments);
  const base = input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  const response = await fetch(`${base}/api/conversations/${args.conversationId}/webchat-handoff`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : `Web chat tool failed (${response.status})`);
  }
  return result;
}
