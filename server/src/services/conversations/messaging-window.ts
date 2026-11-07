import type { Db } from "@paperclipai/db";

export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MessagingWindow {
  channel: string;
  freeReplyAllowed: boolean;
  expiresAt: string | null;
  requiresTemplate: boolean;
  reason: "unrestricted" | "open" | "expired" | "no_inbound";
}

/** Missing or invalid inbound timestamps fail closed on restricted channels. */
export function messagingWindow(
  conversation: { channel: string; lastInboundAt?: Date | string | null },
  now = new Date(),
): MessagingWindow {
  const { channel } = conversation;
  if (!["whatsapp", "messenger", "instagram"].includes(channel)) {
    return { channel, freeReplyAllowed: true, expiresAt: null, requiresTemplate: false, reason: "unrestricted" };
  }
  const inbound = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : NaN;
  const valid = Number.isFinite(inbound);
  const expires = inbound + MESSAGING_WINDOW_MS;
  const open = valid && inbound <= now.getTime() && now.getTime() < expires;
  return {
    channel,
    freeReplyAllowed: open,
    expiresAt: valid && Number.isFinite(new Date(expires).getTime()) ? new Date(expires).toISOString() : null,
    requiresTemplate: channel === "whatsapp" && !open,
    reason: open ? "open" : valid ? "expired" : "no_inbound",
  };
}

/** Company-scoped lookup; keep the pure helper cheap for authenticated API tools. */
export async function getConversationMessagingWindow(db: Db, companyId: string, conversationId: string, now = new Date()) {
  const [{ and, eq }, { conversations }, { notFound }] = await Promise.all([
    import("drizzle-orm"), import("@paperclipai/db"), import("../../errors.js"),
  ]);
  const [conversation] = await db.select({ channel: conversations.channel, lastInboundAt: conversations.lastInboundAt })
    .from(conversations).where(and(eq(conversations.companyId, companyId), eq(conversations.id, conversationId))).limit(1);
  if (!conversation) throw notFound("Conversation not found");
  return messagingWindow(conversation, now);
}
