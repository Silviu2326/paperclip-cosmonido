import { and, eq, isNotNull, sql } from "drizzle-orm";
import { type Db, conversationMessages, conversations, leads } from "@paperclipai/db";
import type { Conversation, ConversationChannel, ConversationMessage } from "@paperclipai/shared";
import { logActivity } from "../activity-log.js";
import { normalizePhoneE164 } from "../crm/identity.js";
import { badRequest, conflict } from "../../errors.js";
import {
  ensureLeadForInbound,
  resolveContactForInbound,
  type InboundFrom,
} from "./adapters.js";
import { slaDeadline, toConversation, toConversationMessage } from "./conversations.js";

// Entry point for every inbound message: email projection, web chat (F), Meta/Telegram/Twilio (D/E).
// Stable signature: recordInboundMessage(db, companyId, input). Repeating the same
// (company, channel, externalMessageId) returns the stored message without side effects.

/** Channels backed by customer_channel_accounts whose inbound messages can wake the dispatch agent. */
const MESSAGING_DISPATCH_CHANNELS: ReadonlySet<ConversationChannel> = new Set<ConversationChannel>([
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
  "sms",
]);

export interface RecordInboundMessageInput {
  channel: ConversationChannel;
  /** Transport that received the message. Defaults to the channel name. */
  provider?: string;
  /** Provider thread or chat id. One conversation per (company, channel, externalThreadId). */
  externalThreadId: string;
  /** Provider message id. Together with company and channel, it is the idempotency key. */
  externalMessageId: string;
  from: InboundFrom;
  body: string;
  attachments?: Record<string, unknown>[];
  subject?: string | null;
  language?: string | null;
  occurredAt?: Date;
}

export interface RecordInboundMessageResult {
  conversation: Conversation;
  message: ConversationMessage;
  /** false when the message was already recorded. */
  created: boolean;
}

async function findInbound(db: Db, companyId: string, channel: ConversationChannel, externalMessageId: string) {
  const [row] = await db
    .select({ message: conversationMessages })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(and(
      eq(conversationMessages.companyId, companyId),
      eq(conversations.companyId, companyId),
      eq(conversations.channel, channel),
      eq(conversationMessages.providerMessageId, externalMessageId),
      eq(conversationMessages.direction, "inbound"),
    ))
    .limit(1);
  return row?.message ?? null;
}

export async function recordInboundMessage(
  db: Db,
  companyId: string,
  input: RecordInboundMessageInput,
): Promise<RecordInboundMessageResult> {
  const provider = input.provider ?? input.channel;
  const occurredAt = input.occurredAt ?? new Date();
  if (!Number.isFinite(occurredAt.getTime())) throw badRequest("Invalid inbound message timestamp");
  if (!input.externalMessageId.trim() || !input.externalThreadId.trim()) throw badRequest("Inbound message and thread ids are required");
  const from = { ...input.from, phone: normalizePhoneE164(input.from.phone) };

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    // Serialize inbound CRM resolution per company, including different threads sharing an identity.
    // Transaction locks also cover multiple API processes and release automatically on failure.
    await t.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`conversation-inbound:${companyId}`}, 0))`);
    const previous = await findInbound(t, companyId, input.channel, input.externalMessageId);
    if (previous) {
      const [conversation] = await t.select().from(conversations).where(and(eq(conversations.companyId, companyId), eq(conversations.id, previous.conversationId))).limit(1);
      return { conversation: toConversation(conversation), message: toConversationMessage(previous), created: false };
    }

    const [thread] = await t
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.companyId, companyId),
        eq(conversations.channel, input.channel),
        eq(conversations.externalThreadId, input.externalThreadId),
      ))
      .for("update")
      .limit(1);

    let conv = thread;
    if (!conv) {
      const [created] = await t
        .insert(conversations)
        .values({
          companyId,
          channel: input.channel,
          externalThreadId: input.externalThreadId,
          subject: input.subject ?? null,
          language: input.language ?? null,
          status: "waiting_us",
          lastMessageAt: occurredAt,
          lastInboundAt: occurredAt,
          slaDueAt: slaDeadline(occurredAt),
        })
        .onConflictDoNothing({
          target: [conversations.companyId, conversations.channel, conversations.externalThreadId],
          where: isNotNull(conversations.externalThreadId),
        })
        .returning();
      if (created) {
        conv = created;
      } else {
        // Lost a race with a concurrent delivery of another message in the same thread.
        const [raced] = await t
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.companyId, companyId),
            eq(conversations.channel, input.channel),
            eq(conversations.externalThreadId, input.externalThreadId),
          ))
          .for("update")
          .limit(1);
        conv = raced;
      }
    }
    if (!conv) throw new Error("Conversation for inbound message could not be created");

    const [inserted] = await t
      .insert(conversationMessages)
      .values({
        companyId,
        conversationId: conv.id,
        direction: "inbound",
        actorKind: "contact",
        body: input.body,
        attachments: input.attachments ?? [],
        language: input.language ?? null,
        deliveryStatus: "delivered",
        provider,
        providerMessageId: input.externalMessageId,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })
      .onConflictDoNothing({
        target: [conversationMessages.companyId, conversationMessages.provider, conversationMessages.providerMessageId],
        where: isNotNull(conversationMessages.providerMessageId),
      })
      .returning();
    if (!inserted) {
      const duplicate = await findInbound(t, companyId, input.channel, input.externalMessageId);
      // The existing DB index is provider-scoped, stricter than channel-scoped deduplication.
      if (!duplicate) throw conflict("Provider message id is already used by another message");
      const [duplicateConversation] = await t.select().from(conversations)
        .where(and(eq(conversations.companyId, companyId), eq(conversations.id, duplicate.conversationId))).limit(1);
      return { conversation: toConversation(duplicateConversation), message: toConversationMessage(duplicate), created: false };
    }

    // Agent automation is an explicit company opt-in. Insert only a durable
    // inbox work row here; the worker creates an assigned task after commit and
    // the ordinary heartbeat/external-action gates own execution and delivery.
    // Web chat needs an active site; messaging channels (WhatsApp via Meta or
    // Kapso, Messenger, Instagram, Telegram, SMS) need an active channel account.
    if (input.channel === "webchat" || MESSAGING_DISPATCH_CHANNELS.has(input.channel)) {
      const policyRows = (input.channel === "webchat"
        ? await t.execute(sql`
          select d.agent_id, d.responsible_user_id
          from conversation_agent_dispatch_settings d
          inner join webchat_settings w on w.company_id = d.company_id and w.active = true
          where d.company_id = ${companyId} and d.enabled = true
          limit 1
        `)
        : await t.execute(sql`
          select d.agent_id, d.responsible_user_id
          from conversation_agent_dispatch_settings d
          where d.company_id = ${companyId} and d.enabled = true
            and exists (
              select 1 from customer_channel_accounts a
              where a.company_id = d.company_id and a.kind = ${input.channel} and a.status = 'active'
            )
          limit 1
        `)) as unknown as Array<{ agent_id: string; responsible_user_id: string }>;
      const policy = policyRows[0];
      if (policy?.agent_id && policy.responsible_user_id &&
          conv.assignedUserId === null && (!conv.assignedAgentId || conv.assignedAgentId === policy.agent_id)) {
        await t.execute(sql`
          insert into conversation_agent_dispatches
            (company_id, conversation_id, source_message_id, agent_id, responsible_user_id, status)
          values
            (${companyId}, ${conv.id}, ${inserted.id}, ${policy.agent_id}, ${policy.responsible_user_id}, 'pending')
          on conflict (company_id, source_message_id) do nothing
        `);
      }
    }

    // Contact and customer: resolved once per conversation, kept afterwards.
    const resolved = conv.contactId && conv.customerId
      ? null
      : await resolveContactForInbound(t, companyId, input.channel, from);

    // A new inbound message opens a response window. A pending window keeps its earlier deadline.
    const windowAlreadyOpen = conv.status === "waiting_us" && conv.slaDueAt !== null;
    const alreadyAnswered = conv.lastOutboundAt !== null && occurredAt <= conv.lastOutboundAt;
    const [updated] = await t
      .update(conversations)
      .set({
        status: alreadyAnswered ? conv.status : "waiting_us",
        slaDueAt: alreadyAnswered ? conv.slaDueAt : windowAlreadyOpen
          ? new Date(Math.min(conv.slaDueAt!.getTime(), slaDeadline(occurredAt).getTime()))
          : slaDeadline(occurredAt),
        lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${occurredAt.toISOString()}::timestamptz), ${occurredAt.toISOString()}::timestamptz)`,
        lastInboundAt: sql`greatest(coalesce(${conversations.lastInboundAt}, ${occurredAt.toISOString()}::timestamptz), ${occurredAt.toISOString()}::timestamptz)`,
        contactId: conv.contactId ?? resolved?.contactId ?? null,
        customerId: conv.customerId ?? resolved?.customerId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conv.id))
      .returning();

    // No lead and no customer: the thread enters the lead queue.
    let final = updated;
    if (!final.leadId && !final.customerId) {
      const leadId = await ensureLeadForInbound(t, companyId, {
        channel: input.channel,
        sourceRef: input.externalThreadId,
        payload: { subject: input.subject ?? null, firstMessage: input.body.slice(0, 500), from },
        from,
        contactId: final.contactId,
        language: input.language ?? null,
      });
      const [lead] = await t.select({ contactId: leads.contactId }).from(leads)
        .where(and(eq(leads.companyId, companyId), eq(leads.id, leadId))).limit(1);
      [final] = await t
        .update(conversations)
        .set({ leadId, contactId: final.contactId ?? lead?.contactId ?? null, updatedAt: new Date() })
        .where(eq(conversations.id, conv.id))
        .returning();
    }

    await logActivity(t, {
      companyId,
      actorType: "system",
      actorId: "inbound",
      action: "conversation.inbound_recorded",
      entityType: "conversation",
      entityId: final.id,
      details: { channel: input.channel, provider, messageId: inserted.id },
    });

    return { conversation: toConversation(final), message: toConversationMessage(inserted), created: true };
  });
}
