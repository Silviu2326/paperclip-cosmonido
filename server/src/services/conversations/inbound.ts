import { and, eq, isNotNull, sql } from "drizzle-orm";
import { type Db, conversationMessages, conversations } from "@paperclipai/db";
import type { Conversation, ConversationChannel, ConversationMessage } from "@paperclipai/shared";
import { logActivity } from "../activity-log.js";
import {
  ensureLeadForInbound,
  resolveContactForInbound,
  type InboundFrom,
} from "./adapters.js";
import { slaDeadline, toConversation, toConversationMessage } from "./conversations.js";

// Entry point for every inbound message: email projection, web chat (F), Meta/Telegram/Twilio (D/E).
// Stable signature: recordInboundMessage(db, companyId, input). Repeating the same
// (provider, externalMessageId) returns the stored message and never creates a second one.

export interface RecordInboundMessageInput {
  channel: ConversationChannel;
  /** Transport that received the message. Defaults to the channel name. Part of the idempotency key. */
  provider?: string;
  /** Provider thread or chat id. One conversation per (company, channel, externalThreadId). */
  externalThreadId: string;
  /** Provider message id. With `provider`, it is the idempotency key. */
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

async function findInbound(db: Db, companyId: string, provider: string, externalMessageId: string) {
  const [row] = await db
    .select()
    .from(conversationMessages)
    .where(and(
      eq(conversationMessages.companyId, companyId),
      eq(conversationMessages.provider, provider),
      eq(conversationMessages.providerMessageId, externalMessageId),
      eq(conversationMessages.direction, "inbound"),
    ))
    .limit(1);
  return row ?? null;
}

export async function recordInboundMessage(
  db: Db,
  companyId: string,
  input: RecordInboundMessageInput,
): Promise<RecordInboundMessageResult> {
  const provider = input.provider ?? input.channel;
  const occurredAt = input.occurredAt ?? new Date();

  const previous = await findInbound(db, companyId, provider, input.externalMessageId);
  if (previous) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, previous.conversationId)).limit(1);
    return { conversation: toConversation(conversation), message: toConversationMessage(previous), created: false };
  }

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;

    const [thread] = await t
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.companyId, companyId),
        eq(conversations.channel, input.channel),
        eq(conversations.externalThreadId, input.externalThreadId),
      ))
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
      const duplicate = await findInbound(t, companyId, provider, input.externalMessageId);
      if (!duplicate) throw new Error("Inbound message conflict without a stored duplicate");
      return { conversation: toConversation(conv), message: toConversationMessage(duplicate), created: false };
    }

    // Web chat automation is an explicit company opt-in. Insert only a durable
    // inbox work row here; the worker creates an assigned task after commit and
    // the ordinary heartbeat/external-action gates own execution and delivery.
    if (input.channel === "webchat") {
      const policyRows = await t.execute(sql`
        select d.agent_id, d.responsible_user_id
        from conversation_agent_dispatch_settings d
        inner join webchat_settings w on w.company_id = d.company_id and w.active = true
        where d.company_id = ${companyId} and d.enabled = true
        limit 1
      `) as unknown as Array<{ agent_id: string; responsible_user_id: string }>;
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
      : await resolveContactForInbound(t, companyId, input.channel, input.from);

    // A new inbound message opens a response window. A pending window keeps its earlier deadline.
    const windowAlreadyOpen = conv.status === "waiting_us" && conv.slaDueAt !== null;
    const [updated] = await t
      .update(conversations)
      .set({
        status: "waiting_us",
        slaDueAt: windowAlreadyOpen ? conv.slaDueAt : slaDeadline(occurredAt),
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
        payload: { subject: input.subject ?? null, firstMessage: input.body.slice(0, 500), from: input.from },
        from: input.from,
        contactId: final.contactId,
        language: input.language ?? null,
      });
      [final] = await t
        .update(conversations)
        .set({ leadId, updatedAt: new Date() })
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
