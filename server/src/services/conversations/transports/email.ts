import { and, eq, sql } from "drizzle-orm";
import { type Db, chatConversations } from "@paperclipai/db";
import { HttpError } from "../../../errors.js";
import type { EmailChannelService } from "../../email-channels.js";
import { ExternalActionUncertainError } from "../../external-action-gate.js";
import { CONVERSATION_SLA_HOURS } from "../conversations.js";
import {
  TransportRejectedError,
  type ConversationTransport,
  type OutboundMessage,
  type TransportReconcileResult,
} from "./types.js";

// Email transport. Email already lives in emailMessages / chatConversations (AgentMail).
// This file projects that data into conversations / conversation_messages (provider 'agentmail')
// and sends replies through the existing email channel service. It never talks to AgentMail directly.

export const EMAIL_PROJECTION_PROVIDER = "agentmail";
const PROJECTION_INTERVAL_MS = 15_000;
const lastProjection = new Map<string, number>();

/**
 * Copies the company's mail threads and messages into the unified inbox. Idempotent: rows
 * already projected are skipped (unique provider message id), and the thread state is
 * derived from the mail itself. Runs at most once per PROJECTION_INTERVAL_MS per company.
 */
export async function projectEmailConversations(db: Db, companyId: string, options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && (lastProjection.get(companyId) ?? 0) > now - PROJECTION_INTERVAL_MS) return;
  lastProjection.set(companyId, now);

  // 1. Threads. last_message_at stays null until messages are projected (step 4 relies on this).
  await db.execute(sql`
    insert into conversations (company_id, channel, external_thread_id, status, created_at, updated_at)
    select cc.company_id, 'email', cc.id::text, 'open', now(), now()
    from chat_conversations cc
    join chat_endpoints ce on ce.id = cc.endpoint_id and ce.company_id = cc.company_id
    where cc.company_id = ${companyId} and ce.provider = 'agentmail'
    on conflict (company_id, channel, external_thread_id) where external_thread_id is not null do nothing
  `);

  // 2. Messages. Automatic mail (receipts, bounces) stays out of the inbox.
  await db.execute(sql`
    insert into conversation_messages (
      company_id, conversation_id, direction, actor_kind, body, attachments,
      delivery_status, provider, provider_message_id, sent_at, created_at, updated_at
    )
    select em.company_id, c.id, em.direction,
      case when em.direction = 'inbound' then 'contact' else 'agent' end,
      em.text, '[]'::jsonb,
      case when em.direction = 'inbound' then 'delivered' else 'sent' end,
      ${EMAIL_PROJECTION_PROVIDER}, em.provider_message_id,
      case when em.direction = 'outbound' then em.timestamp end,
      em.timestamp, now()
    from email_messages em
    join conversations c
      on c.company_id = em.company_id and c.channel = 'email' and c.external_thread_id = em.conversation_id::text
    where em.company_id = ${companyId} and em.automatic = false
    on conflict (company_id, provider, provider_message_id) where provider_message_id is not null do nothing
  `);

  // 3. Thread state for a new inbound message (or a first one): waiting for us, SLA from that message.
  //    Runs before step 4, which records the inbound time this compares against.
  await db.execute(sql`
    with m as (
      select em.conversation_id::text as thread,
        max(em.timestamp) filter (where em.direction = 'inbound') as last_in,
        max(em.timestamp) filter (where em.direction = 'outbound') as last_out
      from email_messages em
      where em.company_id = ${companyId} and em.automatic = false
      group by em.conversation_id
    )
    update conversations c
    set status = 'waiting_us',
      sla_due_at = m.last_in + make_interval(hours => ${CONVERSATION_SLA_HOURS}),
      updated_at = now()
    from m
    where c.company_id = ${companyId} and c.channel = 'email' and c.external_thread_id = m.thread
      and m.last_in is not null
      and (m.last_out is null or m.last_in > m.last_out)
      and (c.last_inbound_at is null or c.last_inbound_at < m.last_in)
  `);

  // 4. Timestamps, monotonic for last_message_at; inbound/outbound times follow the mail.
  await db.execute(sql`
    with m as (
      select em.conversation_id::text as thread,
        max(em.timestamp) as last_at,
        max(em.timestamp) filter (where em.direction = 'inbound') as last_in,
        max(em.timestamp) filter (where em.direction = 'outbound') as last_out
      from email_messages em
      where em.company_id = ${companyId} and em.automatic = false
      group by em.conversation_id
    )
    update conversations c
    set last_message_at = greatest(coalesce(c.last_message_at, m.last_at), m.last_at),
      last_inbound_at = m.last_in,
      last_outbound_at = m.last_out
    from m
    where c.company_id = ${companyId} and c.channel = 'email' and c.external_thread_id = m.thread
  `);

  // 5. Outbound mail sent after our last reply closes the wait for us.
  await db.execute(sql`
    update conversations c
    set status = 'waiting_them', sla_due_at = null, updated_at = now()
    where c.company_id = ${companyId} and c.channel = 'email' and c.status = 'waiting_us'
      and c.last_outbound_at is not null and c.last_inbound_at is not null
      and c.last_outbound_at > c.last_inbound_at
  `);
}

function emailActorOf(actor: OutboundMessage["actor"]) {
  return {
    userId: actor.userId ?? undefined,
    agentId: actor.agentId ?? undefined,
  };
}

function outcomeToStatus(outcome: string): TransportReconcileResult["status"] {
  switch (outcome) {
    case "queued":
    case "sent":
    case "delivered":
    case "failed":
    case "uncertain":
      return outcome;
    default:
      return "uncertain";
  }
}

export function emailTransportService(db: Db, email?: EmailChannelService): ConversationTransport {
  return {
    provider: EMAIL_PROJECTION_PROVIDER,
    channels: ["email"],

    async send(message) {
      if (!email) throw new TransportRejectedError("Email delivery is not available on this server");
      if (!message.externalThreadId) throw new TransportRejectedError("This email conversation has no mail thread to reply in");
      if (!message.replyToProviderMessageId) {
        throw new TransportRejectedError("Email replies need an inbound message to reply to");
      }
      const [chat] = await db
        .select({ id: chatConversations.id, endpointId: chatConversations.endpointId })
        .from(chatConversations)
        .where(and(
          eq(chatConversations.companyId, message.companyId),
          sql`${chatConversations.id}::text = ${message.externalThreadId}`,
        ))
        .limit(1);
      if (!chat) throw new TransportRejectedError("Mail thread not found");

      let publication;
      try {
        // The message id is the publication id: a repeated call for the same message is idempotent.
        publication = await email.queueSend(message.companyId, {
          endpointId: chat.endpointId,
          conversationId: chat.id,
          replyToMessageId: message.replyToProviderMessageId,
          replyAll: false,
          text: message.body,
          attachmentIds: [],
          idempotencyKey: message.messageId,
        }, emailActorOf(message.actor));
      } catch (error) {
        // An HTTP error means the email service refused before queuing: nothing was sent.
        if (error instanceof HttpError) throw new TransportRejectedError(error.message);
        // Anything else may have happened after the request left: the outcome is unknown.
        throw new ExternalActionUncertainError(error instanceof Error ? error.message : String(error));
      }

      if (publication.outcome === "failed") {
        throw new TransportRejectedError(publication.error ?? "Email delivery failed");
      }
      if (publication.outcome === "uncertain") {
        throw new ExternalActionUncertainError(publication.error ?? "Email delivery outcome is uncertain");
      }
      return {
        status: publication.outcome === "sent" || publication.outcome === "delivered" ? "sent" : "queued",
        providerMessageId: publication.providerMessageId,
        receipt: { publicationId: publication.id, outcome: publication.outcome },
      };
    },

    async reconcile({ companyId, messageId }) {
      if (!email) return { status: "uncertain" };
      try {
        const publication = await email.publication(messageId, companyId);
        return {
          status: outcomeToStatus(publication.outcome),
          providerMessageId: publication.providerMessageId,
          receipt: { publicationId: publication.id, outcome: publication.outcome },
        };
      } catch (error) {
        // No publication row: the request never reached the queue, so nothing was sent.
        if (error instanceof HttpError && error.status === 404) {
          return { status: "failed", receipt: { error: "Email was never queued" } };
        }
        throw error;
      }
    },

    async resolveManually({ companyId, messageId, outcome, providerMessageId, actor }) {
      if (!email) throw new TransportRejectedError("Email delivery is not available on this server");
      await email.resolveUncertain(
        companyId,
        messageId,
        { outcome, providerMessageId: providerMessageId ?? undefined },
        emailActorOf(actor),
      );
    },
  };
}
