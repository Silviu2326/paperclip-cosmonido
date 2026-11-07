import { createHash } from "node:crypto";
import { z } from "zod";
import { CRM_TOOL_DESCRIPTIONS, type CrmToolName } from "@paperclipai/shared";
import { badRequest } from "../../errors.js";
import { messagingWindow, type MessagingWindow } from "./messaging-window.js";

// Agent tools for conversation_* and message_* names in CRM_TOOL_NAMES. Like project-tools.ts,
// every call goes through the authenticated API, so validation, company access, the external
// action gate and activity logging all apply the same way for agents and the board.

const uuid = z.string().uuid();
const body = z.string().trim().min(1).max(100000);
const idempotencyKey = z.string().trim().min(1).max(240).optional();

const schemas = {
  conversation_list: z.object({
    status: z.enum(["open", "waiting_us", "waiting_them", "closed"]).optional(),
    channel: z.enum(["email", "whatsapp", "messenger", "instagram", "telegram", "webchat", "voice", "sms"]).optional(),
    assigned: z.string().min(1).max(120).optional(),
    overdue: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().regex(/^\d{1,9}$/).optional(),
  }),
  conversation_get: z.object({ conversationId: uuid, before: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }),
  message_draft: z.object({ conversationId: uuid, body, idempotencyKey }),
  message_send: z.union([
    z.object({ messageId: uuid, conversationId: uuid }),
    z.object({ conversationId: uuid, body, idempotencyKey }),
  ]),
  message_reply: z.object({ conversationId: uuid, body, idempotencyKey }),
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
    description: [CRM_TOOL_DESCRIPTIONS[name as CrmToolName],
      name === "conversation_get" ? "Includes the response window and recent history; use before and limit to page backwards." : "",
      name === "message_send" ? "Sending an existing messageId also requires its conversationId for window and length checks." : "",
      ["message_draft", "message_reply", "message_send"].includes(name)
        ? "Reuse idempotencyKey for retries. Free text cannot be sent outside a restricted channel window; WhatsApp then needs an approved template or human help." : "",
    ].filter(Boolean).join(" "),
    inputSchema: z.toJSONSchema(schemas[name]),
  }));
}

/** SMS uses GSM-7 septets (extension characters cost two) or UTF-16 units. */
export function conversationTextPolicy(channel: string, text: string) {
  const limits: Record<string, number> = { whatsapp: 4096, telegram: 4096, messenger: 2000, instagram: 1000 };
  if (channel !== "sms") return { maxLength: limits[channel] ?? 100000, length: Array.from(text).length, segments: null };
  const basic = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const extension = "\f^{}\\[~]|€";
  const gsm = Array.from(text).every((char) => basic.includes(char) || extension.includes(char));
  const length = gsm ? Array.from(text).reduce((sum, char) => sum + (extension.includes(char) ? 2 : 1), 0) : text.length;
  const single = gsm ? 160 : 70;
  const perSegment = gsm ? 153 : 67;
  let segments = 1;
  if (length > single) {
    let used = 0;
    for (const char of text) {
      const units = gsm ? extension.includes(char) ? 2 : 1 : char.length;
      if (used + units > perSegment) { segments++; used = 0; }
      used += units;
    }
  }
  return { maxLength: perSegment * 10, length, segments };
}

function checkText(channel: string, text: string) {
  const policy = conversationTextPolicy(channel, text);
  if (policy.length > policy.maxLength || (policy.segments !== null && policy.segments > 10)) {
    throw badRequest(`Mensaje demasiado largo para ${channel}: ${policy.length}/${policy.maxLength}${channel === "sms" ? ` unidades (${policy.segments} segmentos SMS; máximo 10)` : " caracteres"}. Acorta el mensaje o divídelo en mensajes más breves.`);
  }
  return policy;
}

function checkWindow(window: MessagingWindow) {
  if (!window.freeReplyAllowed) throw badRequest(window.requiresTemplate
    ? "La ventana de 24 h de WhatsApp está cerrada. Usa una plantilla aprobada mediante el flujo autorizado o pide ayuda a un humano; no envíes texto libre."
    : `La ventana de 24 h de ${window.channel} está cerrada. Espera un nuevo mensaje del cliente o pide ayuda a un humano.`, { messagingWindow: window });
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
  const loadConversation = async (conversationId: string) => {
    const conversation = await api("GET", `/conversations/${conversationId}`);
    if (conversation.companyId !== input.companyId) throw badRequest("Conversation does not belong to this company");
    return conversation;
  };
  const draftAndSend = async (conversationId: string, text: string, key?: string, send = true) => {
    const conversation = await loadConversation(conversationId);
    const window = messagingWindow(conversation);
    const textPolicy = checkText(conversation.channel, text);
    // Sent drafts lose their provider-side draft key. Recover normal reply retries
    // from this turn's history; an explicit key requests a distinct logical message.
    if (send && !key) {
      const inboundAt = conversation.lastInboundAt ? Date.parse(conversation.lastInboundAt) : 0;
      const existing = conversation.messages?.find((message: {
        direction: string; body: string; deliveryStatus: string; createdAt: string; sentAt?: string | null; updatedAt?: string;
      }) => message.direction === "outbound" && message.body === text
        && Date.parse(message.sentAt ?? message.updatedAt ?? message.createdAt) >= inboundAt
        && ["queued", "sent", "delivered", "read", "uncertain"].includes(message.deliveryStatus));
      if (existing) return { message: existing, action: null, mode: null, messagingWindow: window, textPolicy, reused: true };
    }
    if (send) checkWindow(window);
    // Retries of a reply to the same inbound turn share a key, including across agent wakes.
    const stableKey = key ?? createHash("sha256").update(JSON.stringify([
      input.companyId, conversationId, conversation.lastInboundAt ?? null, text,
    ])).digest("hex");
    const draft = await api("POST", `/conversations/${conversationId}/messages`, {
      body: text,
      idempotencyKey: stableKey,
    });
    if (draft.body !== text || draft.conversationId !== conversationId) {
      throw badRequest("La clave de idempotencia ya corresponde a otro mensaje. Reutiliza el texto original o elige una clave nueva para un mensaje distinto.");
    }
    const result = send ? await api("POST", `/messages/${draft.id}/send`, {}) : draft;
    return { ...result, messagingWindow: window, textPolicy };
  };

  const schema = schemas[input.name as keyof typeof schemas];
  if (!schema) throw badRequest("Unknown conversation tool");
  if (input.name === "message_send" && input.arguments.messageId && !input.arguments.conversationId) {
    throw badRequest("Incluye conversationId junto a messageId para comprobar la ventana de respuesta y el contenido del borrador antes de enviarlo.");
  }
  const args = schema.parse(input.arguments) as Record<string, unknown>;

  switch (input.name) {
    case "conversation_list": {
      const query = new URLSearchParams();
      for (const key of ["status", "channel", "assigned", "limit", "cursor"] as const) {
        if (args[key] !== undefined) query.set(key, String(args[key]));
      }
      if (args.overdue !== undefined) query.set("overdue", String(args.overdue));
      const qs = query.toString();
      const page = await api("GET", `/companies/${input.companyId}/conversations${qs ? `?${qs}` : ""}`);
      return { ...page, items: page.items.map((conversation: { channel: string; lastInboundAt?: string | null }) => ({
        ...conversation, messagingWindow: messagingWindow(conversation),
      })) };
    }
    case "conversation_get": {
      const conversation = await loadConversation(String(args.conversationId));
      if (args.before || args.limit) {
        const query = new URLSearchParams();
        if (args.before) query.set("before", String(args.before));
        if (args.limit) query.set("limit", String(args.limit));
        const page = await api("GET", `/conversations/${args.conversationId}/messages?${query}`);
        return { ...page, messagingWindow: messagingWindow(conversation) };
      }
      return { ...conversation, messagingWindow: messagingWindow(conversation) };
    }
    case "message_draft":
      return draftAndSend(String(args.conversationId), String(args.body), args.idempotencyKey as string | undefined, false);
    case "message_send": {
      if (args.messageId) {
        const conversation = await loadConversation(String(args.conversationId));
        const window = messagingWindow(conversation);
        checkWindow(window);
        // Never send an unchecked draft or one belonging to another thread.
        const message = conversation.messages?.find((item: { id: string }) => item.id === args.messageId);
        if (!message) throw badRequest("El borrador no está en el historial reciente de esta conversación. Usa conversation_get o message_reply con su texto y clave de idempotencia.");
        const textPolicy = checkText(conversation.channel, message.body);
        return { ...await api("POST", `/messages/${args.messageId}/send`, {}), messagingWindow: window, textPolicy };
      }
      return draftAndSend(String(args.conversationId), String(args.body), args.idempotencyKey as string | undefined);
    }
    case "message_reply":
      return draftAndSend(String(args.conversationId), String(args.body), args.idempotencyKey as string | undefined);
    case "conversation_set_state": {
      const { conversationId, ...state } = args;
      const conversation = await loadConversation(String(conversationId));
      return { ...await api("PATCH", `/conversations/${conversationId}/state`, state), messagingWindow: messagingWindow(conversation) };
    }
    default:
      throw badRequest("Unknown conversation tool");
  }
}
