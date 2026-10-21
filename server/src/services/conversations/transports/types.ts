import type { ConversationChannel } from "@paperclipai/shared";

// Contract for channel transports (email here; Meta, Telegram, Twilio and webchat in D/E/F).
// A transport either returns a definitive outcome, throws TransportRejectedError when the
// provider refused the message before accepting it, or throws ExternalActionUncertainError
// when the outcome is unknown (timeouts after the request left). Uncertain sends are never
// retried automatically; see messageService.reconcile.

export interface OutboundTarget {
  email?: string | null;
  phone?: string | null;
  handle?: string | null;
}

export interface OutboundMessage {
  companyId: string;
  /** conversation_messages.id. Doubles as the provider idempotency key. */
  messageId: string;
  conversationId: string;
  channel: ConversationChannel;
  externalThreadId: string | null;
  body: string;
  subject: string | null;
  to: OutboundTarget;
  /** Provider id of the last inbound message in the thread, when the channel needs it to reply. */
  replyToProviderMessageId: string | null;
  actor: { userId?: string | null; agentId?: string | null };
}

export type TransportSendStatus = "sent" | "queued";

export interface TransportSendResult {
  status: TransportSendStatus;
  providerMessageId?: string | null;
  receipt?: Record<string, unknown> | null;
}

export type TransportReconcileStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "uncertain";

export interface TransportReconcileResult {
  status: TransportReconcileStatus;
  providerMessageId?: string | null;
  receipt?: Record<string, unknown> | null;
}

export interface ConversationTransport {
  readonly provider: string;
  readonly channels: readonly ConversationChannel[];
  send(message: OutboundMessage): Promise<TransportSendResult>;
  /** Asks the provider what happened to a queued or uncertain send. Optional. */
  reconcile?(input: { companyId: string; messageId: string; providerMessageId: string | null }): Promise<TransportReconcileResult>;
  /** Applies a human decision on an uncertain send. Optional. */
  resolveManually?(input: {
    companyId: string;
    messageId: string;
    outcome: "sent" | "failed";
    providerMessageId?: string | null;
    actor: { userId?: string | null; agentId?: string | null };
  }): Promise<void>;
}

/** The provider refused the message before accepting it. Nothing was sent. */
export class TransportRejectedError extends Error {
  readonly rejected = true;
  constructor(message: string) {
    super(message);
    this.name = "TransportRejectedError";
  }
}
