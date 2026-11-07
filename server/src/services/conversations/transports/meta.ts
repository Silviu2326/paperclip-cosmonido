import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type Db, conversations } from "@paperclipai/db";
import { ExternalActionUncertainError } from "../../external-action-gate.js";
import {
  listActiveAccounts,
  readCompanySecret,
  type ChannelAccountRow,
  type FetchLike,
} from "../../customer-channels/accounts.js";
import { applyProviderDeliveryStatus, type ProviderDeliveryStatus } from "./delivery-status.js";
import { asString, isRecord, readJsonBody, safeEqual, shortProviderError } from "./shared.js";
import {
  TransportRejectedError,
  type ConversationTransport,
  type OutboundMessage,
  type TransportSendResult,
} from "./types.js";

// Meta Cloud API transport: WhatsApp, Messenger and Instagram, one active account per kind.
// Inbound: signed webhooks (X-Hub-Signature-256) normalized to recordInboundMessage.
// Outbound: Graph API /{account id}/messages. Outside the 24 h window only WhatsApp can send,
// and only with an approved template stored on the account.

const GRAPH_VERSION = "v21.0";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaKind = "whatsapp" | "messenger" | "instagram";

/** Checks X-Hub-Signature-256 over the exact request bytes. */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}

/** Answers the GET verification challenge when hub.verify_token matches one of the company's tokens. */
export function metaChallengeResponse(query: Record<string, unknown>, verifyTokens: readonly string[]): string | null {
  if (query["hub.mode"] !== "subscribe") return null;
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (typeof token !== "string" || typeof challenge !== "string") return null;
  return verifyTokens.some((candidate) => candidate && safeEqual(candidate, token)) ? challenge : null;
}

export interface MetaInboundEvent {
  kind: MetaKind;
  /** WhatsApp phone_number_id, or the Messenger page / Instagram account id that received the message. */
  accountExternalId: string;
  externalThreadId: string;
  externalMessageId: string;
  from: { phone?: string | null; handle?: string | null };
  body: string;
  attachments: Record<string, unknown>[];
  occurredAt: Date;
}

export interface MetaStatusEvent {
  providerMessageId: string;
  status: ProviderDeliveryStatus;
}

export interface MetaParsedWebhook {
  inbound: MetaInboundEvent[];
  statuses: MetaStatusEvent[];
}

function timeFromSeconds(value: unknown): Date {
  const seconds = typeof value === "string" ? Number(value) : value;
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

function timeFromMilliseconds(value: unknown): Date {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value) : new Date();
}

function mapStatus(value: unknown): ProviderDeliveryStatus | null {
  return value === "sent" || value === "delivered" || value === "read" || value === "failed" ? value : null;
}

function mediaAttachments(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const payload = isRecord(item.payload) ? item.payload : {};
    return [{ type: asString(item.type) ?? "file", url: asString(payload.url) }];
  });
}

function parseWhatsAppMessage(message: unknown, phoneNumberId: string): MetaInboundEvent | null {
  if (!isRecord(message)) return null;
  const id = asString(message.id);
  const from = asString(message.from);
  if (!id || !from) return null;
  const type = asString(message.type) ?? "unknown";
  let body = "";
  const attachments: Record<string, unknown>[] = [];
  if (type === "text" && isRecord(message.text)) {
    body = asString(message.text.body) ?? "";
  } else if (type === "interactive" && isRecord(message.interactive)) {
    const reply = isRecord(message.interactive.button_reply)
      ? message.interactive.button_reply
      : isRecord(message.interactive.list_reply) ? message.interactive.list_reply : null;
    body = asString(reply?.title) ?? "";
  } else if (isRecord(message[type])) {
    const media = message[type] as Record<string, unknown>;
    body = asString(media.caption) ?? "";
    attachments.push({ type, id: asString(media.id), mimeType: asString(media.mime_type) });
  }
  return {
    kind: "whatsapp",
    accountExternalId: phoneNumberId,
    externalThreadId: from,
    externalMessageId: id,
    from: { phone: `+${from.replace(/\D/g, "")}` },
    body,
    attachments,
    occurredAt: timeFromSeconds(message.timestamp),
  };
}

/**
 * Normalizes a verified Meta webhook payload. Pure: no I/O and no trust decisions. Callers must verify
 * the signature before calling it, and must check that each account id belongs to the company.
 */
export function parseMetaWebhook(payload: unknown): MetaParsedWebhook {
  const out: MetaParsedWebhook = { inbound: [], statuses: [] };
  if (!isRecord(payload)) return out;
  const object = payload.object;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const entryId = asString(entry.id);

    if (object === "whatsapp_business_account") {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
        const value = change.value;
        const phoneNumberId = isRecord(value.metadata) ? asString(value.metadata.phone_number_id) : null;
        if (!phoneNumberId) continue;
        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          const event = parseWhatsAppMessage(message, phoneNumberId);
          if (event) out.inbound.push(event);
        }
        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          if (!isRecord(status)) continue;
          const id = asString(status.id);
          const mapped = mapStatus(status.status);
          if (id && mapped) out.statuses.push({ providerMessageId: id, status: mapped });
        }
      }
      continue;
    }

    if ((object === "page" || object === "instagram") && entryId) {
      const kind: MetaKind = object === "page" ? "messenger" : "instagram";
      const events = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const event of events) {
        if (!isRecord(event) || !isRecord(event.sender)) continue;
        const senderId = asString(event.sender.id);
        if (!senderId) continue;
        if (isRecord(event.message)) {
          const message = event.message;
          const mid = asString(message.mid);
          // Echoes are our own outbound messages reflected back by the platform.
          if (mid && message.is_echo !== true) {
            out.inbound.push({
              kind,
              accountExternalId: entryId,
              externalThreadId: senderId,
              externalMessageId: mid,
              from: { handle: senderId },
              body: typeof message.text === "string" ? message.text : "",
              attachments: mediaAttachments(message.attachments),
              occurredAt: timeFromMilliseconds(event.timestamp),
            });
          }
        }
        if (isRecord(event.delivery) && Array.isArray(event.delivery.mids)) {
          for (const mid of event.delivery.mids) {
            const id = asString(mid);
            if (id) out.statuses.push({ providerMessageId: id, status: "delivered" });
          }
        }
      }
    }
  }
  return out;
}

function graphMessageId(data: unknown): string | null {
  if (!isRecord(data)) return null;
  if (Array.isArray(data.messages) && isRecord(data.messages[0])) return asString(data.messages[0].id);
  return asString(data.message_id);
}

export function createMetaTransport(db: Db, options: { fetch?: FetchLike } = {}): ConversationTransport {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function pickAccount(companyId: string, kind: string): Promise<ChannelAccountRow> {
    const accounts = await listActiveAccounts(db, companyId, "meta");
    const account = accounts.find((row) => row.kind === kind);
    if (!account) throw new TransportRejectedError(`No hay cuenta activa de ${kind} para esta empresa`);
    return account;
  }

  return {
    provider: "meta",
    channels: ["whatsapp", "messenger", "instagram"],

    async send(message: OutboundMessage): Promise<TransportSendResult> {
      const account = await pickAccount(message.companyId, message.channel);
      const token = await readCompanySecret(db, message.companyId, account.tokenSecretName);
      if (!token) throw new TransportRejectedError("El secreto de token de la cuenta no existe o está vacío");
      const recipient = message.externalThreadId;
      if (!recipient) throw new TransportRejectedError("La conversación no tiene identificador de destinatario");

      const [thread] = await db
        .select({ lastInboundAt: conversations.lastInboundAt })
        .from(conversations)
        .where(and(eq(conversations.companyId, message.companyId), eq(conversations.id, message.conversationId)))
        .limit(1);
      const withinWindow = thread?.lastInboundAt ? Date.now() - thread.lastInboundAt.getTime() < WINDOW_MS : false;

      let payload: Record<string, unknown>;
      if (message.channel === "whatsapp") {
        if (withinWindow) {
          payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient,
            type: "text",
            text: { preview_url: false, body: message.body },
          };
        } else {
          const template = account.approvedTemplates[0];
          if (!template) {
            throw new TransportRejectedError(
              "Fuera de la ventana de 24 h de WhatsApp y la cuenta no tiene plantilla aprobada para reabrir la conversación",
            );
          }
          // Templates are sent as stored. Variables are not filled in by this transport.
          payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient,
            type: "template",
            template: { name: template.name, language: { code: template.language } },
          };
        }
      } else {
        if (!withinWindow) {
          throw new TransportRejectedError(
            "Fuera de la ventana de 24 h: Messenger e Instagram solo admiten respuestas dentro de esa ventana en esta integración",
          );
        }
        payload = { recipient: { id: recipient }, messaging_type: "RESPONSE", message: { text: message.body } };
      }

      let response: Response;
      try {
        response = await fetchImpl(
          `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(account.externalAccountId)}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
      } catch {
        throw new ExternalActionUncertainError("La petición a Meta no obtuvo respuesta; el envío puede haber llegado");
      }
      const body = await readJsonBody(response);
      if (response.status >= 500) {
        throw new ExternalActionUncertainError(`Meta respondió HTTP ${response.status}; el envío es incierto`);
      }
      if (!response.ok) {
        throw new TransportRejectedError(shortProviderError(body, `Meta rechazó el envío (HTTP ${response.status})`));
      }
      return {
        status: "sent",
        providerMessageId: graphMessageId(body),
        receipt: { provider: "meta", httpStatus: response.status, usedTemplate: payload.type === "template" },
      };
    },
    // No provider query can settle an uncertain send. A board user decides, and messageService.reconcile
    // writes the outcome itself, so this transport has nothing else to do.
    async resolveManually() {},
  };
}

/** Applies Meta delivery callbacks. Returns the number of messages whose status changed. */
export async function applyMetaStatuses(db: Db, companyId: string, statuses: MetaStatusEvent[]): Promise<number> {
  let changed = 0;
  for (const status of statuses) {
    const moved = await applyProviderDeliveryStatus(db, {
      companyId,
      provider: "meta",
      providerMessageId: status.providerMessageId,
      status: status.status,
    });
    if (moved) changed += 1;
  }
  return changed;
}
