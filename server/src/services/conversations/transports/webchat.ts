import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { type Db, conversationMessages, conversations, leads } from "@paperclipai/db";
import { badRequest, notFound } from "../../../errors.js";
import { signPublicToken, verifyPublicToken } from "../../../routes/public-surface.js";
import { logActivity } from "../../activity-log.js";
import type { CrmActor } from "../../crm/common.js";
import { contactService } from "../../crm/contacts.js";
import { identityService, normalizeEmail, normalizePhoneE164 } from "../../crm/identity.js";
import { leadIntakeService } from "../../leads/intake.js";
import { recordInboundMessage } from "../inbound.js";
import { activityActor, conversationService, toConversationMessage, type ConversationActor } from "../conversations.js";
import {
  WEBCHAT_PAGE_SIZE,
  WEBCHAT_PROVIDER,
  WEBCHAT_SESSION_PURPOSE,
  WEBCHAT_SESSION_TTL_SECONDS,
} from "../webchat-constants.js";
import type { ConversationTransport, OutboundMessage, TransportSendResult } from "./types.js";

// Web chat (pista F). Anonymous sessions identified by a signed token (24 h), inbound messages
// through recordInboundMessage, outbound replies shown to the widget and a handoff to a person.
// The widget never sees drafts: only inbound messages and outbound messages in sent/delivered/read.

const VISIBLE_OUTBOUND_STATUSES = ["sent", "delivered", "read"] as const;

export interface WebchatSession {
  sessionId: string;
  token: string;
  expiresAt: string;
}

export interface WebchatMessageView {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  deliveryStatus: string;
}

export interface WebchatPage {
  messages: WebchatMessageView[];
  /** Pass as `after` on the next poll. */
  nextAfter: number;
  hasMore: boolean;
}

export interface WebchatIdentityInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** True when the token is a valid, unexpired web chat token of this company for this session. */
export function verifySessionToken(token: string, companyId: string, sessionId: string, now: Date = new Date()): boolean {
  const payload = verifyPublicToken(token, { purpose: WEBCHAT_SESSION_PURPOSE, companyId }, now);
  return payload !== null && payload.subject === sessionId;
}

export function webchatService(db: Db) {
  const intake = leadIntakeService(db);
  const conv = conversationService(db);
  const systemActor: CrmActor = { actorType: "system", actorId: "webchat" };

  /** Points the session's conversation at the lead of this session (contact and lead links). */
  async function linkSessionConversation(companyId: string, sessionId: string) {
    await db.execute(sql`
      update conversations c set
        contact_id = coalesce(c.contact_id, l.contact_id),
        lead_id = coalesce(c.lead_id, l.id),
        updated_at = now()
      from leads l
      where c.company_id = ${companyId}
        and c.channel = 'webchat'
        and c.external_thread_id = ${sessionId}
        and l.company_id = ${companyId}
        and l.source = 'webchat'
        and l.source_ref = ${sessionId}
    `);
  }

  /** Existing contact for this identity, or a new one. */
  async function contactForIdentity(companyId: string, input: { name: string | null; email: string | null; phone: string | null }) {
    const existing = await identityService(db).resolve(companyId, { email: input.email, phone: input.phone });
    if (existing) return existing.id;
    const { contact } = await contactService(db).create(
      companyId,
      {
        displayName: input.name ?? input.email ?? input.phone ?? "Web chat visitor",
        primaryEmail: input.email,
        primaryPhone: input.phone,
        language: null,
        consents: {},
      },
      { actor: systemActor, force: true },
    );
    return contact.id;
  }

  return {
    /** Anonymous session. Nothing is stored until the first message. */
    createSession(companyId: string, now: Date = new Date()): WebchatSession {
      const sessionId = randomUUID();
      const token = signPublicToken(
        { purpose: WEBCHAT_SESSION_PURPOSE, companyId, subject: sessionId, ttlSeconds: WEBCHAT_SESSION_TTL_SECONDS },
        now,
      );
      return {
        sessionId,
        token,
        expiresAt: new Date(now.getTime() + WEBCHAT_SESSION_TTL_SECONDS * 1000).toISOString(),
      };
    },

    /**
     * Identifies the visitor. The lead is created once (intake is idempotent per session) and the
     * contact once per identity. A lead created earlier by the first message gets its contact here.
     */
    async identify(companyId: string, sessionId: string, input: WebchatIdentityInput) {
      const email = normalizeEmail(input.email ?? null);
      const phone = normalizePhoneE164(input.phone ?? null);
      if (!email && !phone) throw badRequest("Email or phone is required");
      const name = input.name?.trim() || null;

      const { lead, created } = await intake.ingest(companyId, {
        source: "webchat",
        sourceRef: sessionId,
        payload: { name, email, phone },
        identity: { email, phone },
      });

      let contactId = lead.contactId;
      if (!contactId) {
        contactId = await contactForIdentity(companyId, { name, email, phone });
        await db
          .update(leads)
          .set({ contactId, updatedAt: new Date() })
          .where(and(eq(leads.id, lead.id), eq(leads.companyId, companyId)));
      }
      await linkSessionConversation(companyId, sessionId);
      return { leadId: lead.id, contactId, created };
    },

    /** Visitor message. `seq` is the widget's counter: a retry with the same seq stores nothing new. */
    async recordMessage(companyId: string, sessionId: string, input: { body: string; seq: number }) {
      const result = await recordInboundMessage(db, companyId, {
        channel: "webchat",
        provider: WEBCHAT_PROVIDER,
        externalThreadId: sessionId,
        externalMessageId: `${sessionId}:${input.seq}`,
        from: { handle: sessionId },
        body: input.body,
      });
      if (result.created) await linkSessionConversation(companyId, sessionId);
      return { message: result.message, created: result.created };
    },

    /**
     * Messages after `after` (an offset into the visible messages). Outbound messages returned
     * here move from sent to delivered. Empty when the session has no conversation yet.
     */
    async listMessages(companyId: string, sessionId: string, after: number, limit = WEBCHAT_PAGE_SIZE): Promise<WebchatPage> {
      const [thread] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(
          eq(conversations.companyId, companyId),
          eq(conversations.channel, "webchat"),
          eq(conversations.externalThreadId, sessionId),
        ))
        .limit(1);
      if (!thread) return { messages: [], nextAfter: after, hasMore: false };

      const rows = await db
        .select()
        .from(conversationMessages)
        .where(and(
          eq(conversationMessages.companyId, companyId),
          eq(conversationMessages.conversationId, thread.id),
          or(
            eq(conversationMessages.direction, "inbound"),
            inArray(conversationMessages.deliveryStatus, [...VISIBLE_OUTBOUND_STATUSES]),
          ),
        ))
        .orderBy(asc(conversationMessages.createdAt), asc(conversationMessages.id))
        .offset(after)
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const toDeliver = page
        .filter((row) => row.direction === "outbound" && row.deliveryStatus === "sent")
        .map((row) => row.id);
      if (toDeliver.length > 0) {
        await db
          .update(conversationMessages)
          .set({ deliveryStatus: "delivered", updatedAt: new Date() })
          .where(and(eq(conversationMessages.companyId, companyId), inArray(conversationMessages.id, toDeliver)));
      }

      return {
        messages: page.map((row) => {
          const message = toConversationMessage(row);
          return {
            id: message.id,
            direction: message.direction as "inbound" | "outbound",
            body: message.body,
            createdAt: message.createdAt,
            deliveryStatus: toDeliver.includes(row.id) ? "delivered" : message.deliveryStatus,
          };
        }),
        nextAfter: after + page.length,
        hasMore,
      };
    },

    /** Moves a web chat conversation to a person: waiting for us, high priority, logged. */
    async handoff(companyId: string, conversationId: string, actor: ConversationActor) {
      const [row] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
        .limit(1);
      if (!row) throw notFound("Conversation not found");
      if (row.channel !== "webchat") throw badRequest("Only web chat conversations can be handed to a person");

      const updated = await conv.setState(companyId, conversationId, { status: "waiting_us", priority: "high" }, actor);
      await logActivity(db, {
        companyId,
        ...activityActor(actor),
        action: "conversation.webchat_handoff",
        entityType: "conversation",
        entityId: conversationId,
        details: { previousStatus: row.status, previousPriority: row.priority },
      });
      return updated;
    },
  };
}

/**
 * Outbound transport for web chat. The message service has already stored the reply as an
 * outbound row and sets it to `sent`; the widget picks it up on its next poll and marks it delivered.
 * Web chat has no provider, so nothing leaves the process here.
 */
export const webchatTransport: ConversationTransport = {
  provider: WEBCHAT_PROVIDER,
  channels: ["webchat"],
  async send(message: OutboundMessage): Promise<TransportSendResult> {
    return {
      status: "sent",
      providerMessageId: message.messageId,
      receipt: { channel: "webchat", visibleTo: "widget" },
    };
  },
};
