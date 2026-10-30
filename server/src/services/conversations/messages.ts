import { and, desc, eq, isNotNull } from "drizzle-orm";
import { type Db, conversationMessages, conversations, externalActions } from "@paperclipai/db";
import type {
  ConversationChannel,
  ConversationMessage,
  CreateConversationMessage,
  ExternalActionType,
} from "@paperclipai/shared";
import { badRequest, conflict, forbidden, notFound } from "../../errors.js";
import { logActivity } from "../activity-log.js";
import { productizationEntitlementsService } from "../productization/entitlements.js";
import {
  ExternalActionUncertainError,
  gateExternalAction,
  type ExternalActionMode,
  type ExternalActionResult,
  type ExternalActionRow,
} from "../external-action-gate.js";
import { assertAgentMessageChannel } from "../agent-capabilities.js";
import {
  activityActor,
  conversationService,
  toConversationMessage,
  type ConversationActor,
} from "./conversations.js";
import {
  TransportRejectedError,
  type ConversationTransport,
  type OutboundMessage,
  type TransportReconcileStatus,
} from "./transports/types.js";

// Outbound messages. Every external send passes gateExternalAction; there is no channel exception.
// Delivery states: draft -> queued -> sent | delivered | read | failed | uncertain.
// An uncertain send is never retried; it leaves only through reconcile().

const transports = new Map<ConversationChannel, ConversationTransport>();

/** Registers a transport for each channel it declares. A later registration replaces the earlier one. */
export function registerConversationTransport(transport: ConversationTransport) {
  for (const channel of transport.channels) transports.set(channel, transport);
}

export function transportForChannel(channel: string): ConversationTransport | null {
  return transports.get(channel as ConversationChannel) ?? null;
}

/** Draft messages carry provider 'draft' and the idempotency key, so a repeated draft call is a no-op. */
const DRAFT_PROVIDER = "draft";
const SENT_STATUSES = ["sent", "delivered", "read"] as const;

export interface SendOutcome {
  message: ConversationMessage;
  /** Null when the message was already past the draft state and nothing was requested. */
  action: ExternalActionRow | null;
  mode: ExternalActionMode | null;
}

type MessageRow = typeof conversationMessages.$inferSelect;

export function conversationMessageService(db: Db) {
  const conv = conversationService(db);
  const entitlements = productizationEntitlementsService(db);

  async function loadMessage(companyId: string, id: string): Promise<MessageRow> {
    const [row] = await db
      .select()
      .from(conversationMessages)
      .where(and(eq(conversationMessages.companyId, companyId), eq(conversationMessages.id, id)))
      .limit(1);
    if (!row) throw notFound("Message not found");
    return row;
  }

  async function loadConversation(companyId: string, id: string) {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.id, id)))
      .limit(1);
    if (!row) throw notFound("Conversation not found");
    return row;
  }

  async function setDelivery(
    messageId: string,
    patch: Partial<typeof conversationMessages.$inferInsert>,
  ) {
    await db
      .update(conversationMessages)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(conversationMessages.id, messageId));
  }

  async function lastInboundProviderId(companyId: string, conversationId: string): Promise<string | null> {
    const [row] = await db
      .select({ providerMessageId: conversationMessages.providerMessageId })
      .from(conversationMessages)
      .where(and(
        eq(conversationMessages.companyId, companyId),
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.direction, "inbound"),
        isNotNull(conversationMessages.providerMessageId),
      ))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(1);
    return row?.providerMessageId ?? null;
  }

  /**
   * Builds the outbound payload and the delivery closure for one draft. Shared by `send`
   * and by `deliveryExecutor`, so a retried approval delivers exactly as the original would.
   */
  async function buildDelivery(companyId: string, msg: MessageRow, actor: ConversationActor) {
  const parent = await loadConversation(companyId, msg.conversationId);
  if (actor.agentId) {
    await assertAgentMessageChannel(db, {
      companyId,
      agentId: actor.agentId,
      channel: parent.channel as ConversationChannel,
    });
  }
  const transport = transportForChannel(parent.channel);
  if (!transport) throw conflict(`No transport is active for channel ${parent.channel}`);

  const actionType: ExternalActionType = parent.channel === "email" ? "email" : "message";
  const outbound: OutboundMessage = {
    companyId,
    messageId: msg.id,
    conversationId: parent.id,
    channel: parent.channel as ConversationChannel,
    externalThreadId: parent.externalThreadId,
    body: msg.body,
    subject: parent.subject,
    to: {},
    replyToProviderMessageId: await lastInboundProviderId(companyId, parent.id),
    actor: { userId: actor.userId ?? null, agentId: actor.agentId ?? null },
  };

  const deliver = async (): Promise<ExternalActionResult> => {
    // Recheck at execution time too: an approved action or process-restart retry
    // must not retain a channel permission that the board has since revoked.
    if (actor.agentId) {
      await assertAgentMessageChannel(db, {
        companyId,
        agentId: actor.agentId,
        channel: parent.channel as ConversationChannel,
      });
    }
    const reservation = await entitlements.reserveForCompany({
      companyId,
      metric: "messages",
      quantity: 1,
      idempotencyKey: `conversation-message:${msg.id}`,
      requestFingerprint: `${companyId}:${msg.id}:${parent.channel}`,
    });
    try { await setDelivery(msg.id, { deliveryStatus: "queued", provider: transport.provider }); }
    catch(error) { await entitlements.releaseAfterConfirmedRollback(reservation); throw error; }
    let result;
    try {
      result = await transport.send(outbound);
    } catch (error) {
      const uncertain = error instanceof ExternalActionUncertainError || !(error instanceof TransportRejectedError);
      const message = error instanceof Error ? error.message : String(error);
      if (uncertain) {
        await entitlements.markUncertain(reservation);
        await setDelivery(msg.id, { deliveryStatus: "uncertain", providerReceipt: { error: message } });
        throw error;
      }
      await entitlements.releaseAfterConfirmedRollback(reservation);
      await setDelivery(msg.id, {
        deliveryStatus: "failed",
        providerReceipt: { error: message, rejected: true },
      });
      throw error;
    }
    // A transport response is the provider acknowledgement. Quota settlement
    // follows it; an acknowledged queued delivery is still a sent operation.
    await entitlements.commit(reservation);
    const sentAt = new Date();
    const status: TransportReconcileStatus = result.status === "sent" ? "sent" : "queued";
    await setDelivery(msg.id, {
      deliveryStatus: status,
      provider: transport.provider,
      providerMessageId: result.providerMessageId ?? null,
      providerReceipt: result.receipt ?? null,
      sentAt: status === "sent" ? sentAt : null,
    });
    if (status === "sent") await conv.recordOutboundSent(parent.id, sentAt);
    return { status, providerMessageId: result.providerMessageId ?? null };
  };
    return { actionType, deliver, channel: parent.channel as ConversationChannel, parent };
  }

  /**
   * Delivery closure for a draft whose approved action lost its in-process executor (restart).
   * Rebuilds exactly what `send` would have built; the caller runs it through the gate's retry.
   */
  async function deliveryExecutor(companyId: string, messageId: string, actor: ConversationActor) {
    const msg = await loadMessage(companyId, messageId);
    if (msg.direction !== "outbound") throw badRequest("Only outbound messages can be sent");
    if (msg.deliveryStatus !== "draft") {
      throw conflict("Only a draft message can be delivered again", { messageId, status: msg.deliveryStatus });
    }
    const built = await buildDelivery(companyId, msg, actor);
    return { deliver: built.deliver, channel: built.channel };
  }

  const api = {
    deliveryExecutor,
    /** Loads by id alone, for route-level access checks (getAccessibleResource). */
    async findMessage(id: string): Promise<ConversationMessage | null> {
      const [row] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, id)).limit(1);
      return row ? toConversationMessage(row) : null;
    },

    async getMessage(companyId: string, id: string): Promise<ConversationMessage> {
      return toConversationMessage(await loadMessage(companyId, id));
    },

    /** Creates a draft. Repeating the same idempotency key in the conversation returns the same draft. */
    async draft(
      companyId: string,
      conversationId: string,
      input: CreateConversationMessage,
      actor: ConversationActor,
    ): Promise<ConversationMessage> {
      const parent = await loadConversation(companyId, conversationId);
      const sameKey = () => db
        .select()
        .from(conversationMessages)
        .where(and(
          eq(conversationMessages.companyId, companyId),
          eq(conversationMessages.provider, DRAFT_PROVIDER),
          eq(conversationMessages.providerMessageId, input.idempotencyKey),
        ))
        .limit(1);

      const [existing] = await sameKey();
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw conflict("This idempotency key was already used in another conversation");
        }
        return toConversationMessage(existing);
      }

      const [row] = await db
        .insert(conversationMessages)
        .values({
          companyId,
          conversationId,
          direction: "outbound",
          actorKind: actor.agentId ? "agent" : "user",
          actorUserId: actor.agentId ? null : (actor.userId ?? null),
          actorAgentId: actor.agentId ?? null,
          body: input.body,
          attachments: input.attachments ?? [],
          language: parent.language,
          deliveryStatus: "draft",
          provider: DRAFT_PROVIDER,
          providerMessageId: input.idempotencyKey,
        })
        .onConflictDoNothing({
          target: [conversationMessages.companyId, conversationMessages.provider, conversationMessages.providerMessageId],
          where: isNotNull(conversationMessages.providerMessageId),
        })
        .returning();
      if (!row) {
        const [raced] = await sameKey();
        if (!raced) throw conflict("Draft could not be stored");
        return toConversationMessage(raced);
      }

      await logActivity(db, {
        companyId,
        ...activityActor(actor),
        action: "message.drafted",
        entityType: "conversation_message",
        entityId: row.id,
        details: { conversationId, channel: parent.channel },
      });
      return toConversationMessage(row);
    },

    /**
     * Sends a draft through the external action gate. The gate decides by autonomy level:
     * board users execute now; an agent at draft_only only leaves the draft; send_with_approval
     * waits for an approval, after which approveExternalAction runs the same delivery.
     */
    async send(companyId: string, messageId: string, actor: ConversationActor): Promise<SendOutcome> {
      const msg = await loadMessage(companyId, messageId);
      if (msg.direction !== "outbound") throw badRequest("Only outbound messages can be sent");
      if (msg.deliveryStatus === "uncertain") {
        throw conflict("This send is uncertain. Reconcile it before doing anything else", { messageId });
      }
      if (msg.deliveryStatus === "failed") {
        throw conflict("This message failed to send. Create a new draft to try again", { messageId });
      }
      if (msg.deliveryStatus !== "draft") {
        return { message: toConversationMessage(msg), action: null, mode: null };
      }

      const { actionType, deliver, channel, parent } = await buildDelivery(companyId, msg, actor);

      const actorKey = actor.agentId ? `agent:${actor.agentId}` : `user:${actor.userId ?? "board"}`;
      const outcome = await gateExternalAction(db, {
        companyId,
        actionType,
        actor: { userId: actor.userId ?? null, agentId: actor.agentId ?? null },
        subjectKind: "conversation",
        subjectId: parent.id,
        payload: { messageId: msg.id, channel, bodyLength: msg.body.length },
        // One gate row per message and actor: a board send after an agent draft is a new request.
        idempotencyKey: `message:${msg.id}:${actorKey}`,
        execute: deliver,
      });

      await setDelivery(msg.id, { externalActionId: outcome.action.id });
      const fresh = await loadMessage(companyId, msg.id);
      await logActivity(db, {
        companyId,
        ...activityActor(actor),
        action: "message.send_requested",
        entityType: "conversation_message",
        entityId: msg.id,
        details: { mode: outcome.mode, actionId: outcome.action.id, deliveryStatus: fresh.deliveryStatus },
      });
      return { message: toConversationMessage(fresh), action: outcome.action, mode: outcome.mode };
    },

    /** Draft and send in one step (message_reply and message_send with a conversation). */
    async reply(
      companyId: string,
      conversationId: string,
      input: CreateConversationMessage,
      actor: ConversationActor,
    ): Promise<SendOutcome> {
      const draft = await api.draft(companyId, conversationId, input, actor);
      return api.send(companyId, draft.id, actor);
    },

    /**
     * Brings a queued or uncertain send to its real state. Automatic when the transport can ask
     * the provider. A board user may also settle an uncertain send by hand (`resolution`).
     * Never resends.
     */
    async reconcile(
      companyId: string,
      messageId: string,
      actor: ConversationActor,
      resolution?: { outcome: "sent" | "failed"; providerMessageId?: string | null },
    ): Promise<ConversationMessage> {
      const msg = await loadMessage(companyId, messageId);
      if (msg.deliveryStatus !== "uncertain" && msg.deliveryStatus !== "queued") {
        throw conflict("Only queued or uncertain sends can be reconciled", { status: msg.deliveryStatus });
      }
      const parent = await loadConversation(companyId, msg.conversationId);
      const transport = transportForChannel(parent.channel);
      if (!transport) throw conflict(`No transport is active for channel ${parent.channel}`);

      let next: { status: TransportReconcileStatus; providerMessageId: string | null; receipt: Record<string, unknown> | null };
      if (resolution) {
        if (actor.agentId) throw forbidden("Only a board user can settle an uncertain send by hand");
        if (msg.deliveryStatus !== "uncertain") throw conflict("Manual resolution applies only to uncertain sends");
        if (!transport.resolveManually) throw conflict(`Channel ${parent.channel} cannot settle sends by hand`);
        await transport.resolveManually({
          companyId,
          messageId: msg.id,
          outcome: resolution.outcome,
          providerMessageId: resolution.providerMessageId ?? null,
          actor: { userId: actor.userId ?? null, agentId: null },
        });
        next = {
          status: resolution.outcome,
          providerMessageId: resolution.providerMessageId ?? msg.providerMessageId,
          receipt: { manual: true, resolvedBy: actor.userId ?? null },
        };
      } else {
        if (!transport.reconcile) throw conflict(`Channel ${parent.channel} cannot reconcile automatically; a board user must settle it`);
        const result = await transport.reconcile({
          companyId,
          messageId: msg.id,
          providerMessageId: msg.providerMessageId,
        });
        next = {
          status: result.status,
          providerMessageId: result.providerMessageId ?? msg.providerMessageId,
          receipt: result.receipt ?? null,
        };
      }

      const sentLike = (SENT_STATUSES as readonly string[]).includes(next.status);
      const reservation = await entitlements.reserveForCompany({
        companyId,
        metric: "messages",
        quantity: 1,
        idempotencyKey: `conversation-message:${msg.id}`,
        requestFingerprint: `${companyId}:${msg.id}:${parent.channel}`,
      });
      // Reconciliation is the authoritative receipt path after an ambiguous
      // send. Only accepted/sent outcomes commit; only confirmed no-effect
      // failure releases. An unresolved provider result remains reserved.
      if (sentLike || next.status === "queued") await entitlements.commit(reservation);
      else if (next.status === "failed") await entitlements.releaseAfterConfirmedReconciliation(reservation);
      else await entitlements.markUncertain(reservation);
      const sentAt = sentLike ? (msg.sentAt ?? new Date()) : msg.sentAt;
      await setDelivery(msg.id, {
        deliveryStatus: next.status,
        providerMessageId: next.providerMessageId,
        providerReceipt: next.receipt,
        sentAt,
      });
      if (sentLike && sentAt) await conv.recordOutboundSent(parent.id, sentAt);

      if (msg.externalActionId && next.status !== "uncertain" && next.status !== "queued") {
        await db
          .update(externalActions)
          .set({
            status: next.status === "failed" ? "failed" : "executed",
            result: { reconciled: next.status, ...(next.receipt ?? {}) },
            executedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(externalActions.companyId, companyId), eq(externalActions.id, msg.externalActionId)));
      }

      await logActivity(db, {
        companyId,
        ...activityActor(actor),
        action: "message.reconciled",
        entityType: "conversation_message",
        entityId: msg.id,
        details: { from: msg.deliveryStatus, to: next.status, manual: Boolean(resolution) },
      });
      return toConversationMessage(await loadMessage(companyId, msg.id));
    },
  };
  return api;
}
