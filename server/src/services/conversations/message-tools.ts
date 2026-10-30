import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CRM_TOOL_DESCRIPTIONS, type CrmToolName } from "@paperclipai/shared";
import { badRequest } from "../../errors.js";

// Agent tools for conversation_* and message_* names in CRM_TOOL_NAMES. Like project-tools.ts,
// every call goes through the authenticated API, so validation, company access, the external
// action gate and activity logging all apply the same way for agents and the board.

const uuid = z.string().uuid();
const body = z.string().trim().min(1).max(100000);

const schemas = {
  conversation_list: z.object({
    status: z.enum(["open", "waiting_us", "waiting_them", "closed"]).optional(),
    channel: z.enum(["email", "whatsapp", "messenger", "instagram", "telegram", "webchat", "voice", "sms"]).optional(),
    assigned: z.string().min(1).max(120).optional(),
    overdue: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().regex(/^\d{1,9}$/).optional(),
  }),
  conversation_get: z.object({ conversationId: uuid, before: uuid.optional() }),
  message_draft: z.object({ conversationId: uuid, body }),
  message_send: z.union([
    z.object({ messageId: uuid }),
    z.object({ conversationId: uuid, body }),
  ]),
  message_reply: z.object({ conversationId: uuid, body }),
  conversation_set_state: z.object({
    conversationId: uuid,
    status: z.enum(["open", "waiting_us", "waiting_them", "closed"]),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  }),
} satisfies Record<string, z.ZodType>;

export const CONVERSATION_TOOL_NAMES = Object.keys(schemas) as (keyof typeof schemas)[];

export function conversationToolDefinitions() {
  return CONVERSATION_TOOL_NAMES.map((name) => ({
    name,
    description: CRM_TOOL_DESCRIPTIONS[name as CrmToolName],
    inputSchema: z.toJSONSchema(schemas[name]),
  }));
}

export interface ConversationToolCall {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
}

export async function callConversationTool(input: ConversationToolCall) {
  const base = input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  const api = async (method: "GET" | "POST" | "PATCH", path: string, payload?: unknown) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(typeof result.error === "string" ? result.error : `Conversation tool failed (${response.status})`);
    }
    return result;
  };
  const draftAndSend = async (conversationId: string, text: string) => {
    const draft = await api("POST", `/conversations/${conversationId}/messages`, {
      body: text,
      idempotencyKey: randomUUID(),
    });
    return api("POST", `/messages/${draft.id}/send`, {});
  };

  const schema = schemas[input.name as keyof typeof schemas];
  if (!schema) throw badRequest("Unknown conversation tool");
  const args = schema.parse(input.arguments) as Record<string, unknown>;

  switch (input.name) {
    case "conversation_list": {
      const query = new URLSearchParams();
      for (const key of ["status", "channel", "assigned", "limit", "cursor"] as const) {
        if (args[key] !== undefined) query.set(key, String(args[key]));
      }
      if (args.overdue !== undefined) query.set("overdue", String(args.overdue));
      const qs = query.toString();
      return api("GET", `/companies/${input.companyId}/conversations${qs ? `?${qs}` : ""}`);
    }
    case "conversation_get":
      return api("GET", args.before
        ? `/conversations/${args.conversationId}/messages?${new URLSearchParams({ before: String(args.before) })}`
        : `/conversations/${args.conversationId}`);
    case "message_draft":
      return api("POST", `/conversations/${args.conversationId}/messages`, {
        body: args.body,
        idempotencyKey: randomUUID(),
      });
    case "message_send":
      if (args.messageId) return api("POST", `/messages/${args.messageId}/send`, {});
      return draftAndSend(String(args.conversationId), String(args.body));
    case "message_reply":
      return draftAndSend(String(args.conversationId), String(args.body));
    case "conversation_set_state": {
      const { conversationId, ...state } = args;
      return api("PATCH", `/conversations/${conversationId}/state`, state);
    }
    default:
      throw badRequest("Unknown conversation tool");
  }
}
