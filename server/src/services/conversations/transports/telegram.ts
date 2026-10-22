import type { Db } from "@paperclipai/db";
import { ExternalActionUncertainError } from "../../external-action-gate.js";
import {
  listActiveAccounts,
  readCompanySecret,
  type FetchLike,
} from "../../customer-channels/accounts.js";
import { asString, isRecord, readJsonBody, safeEqual, shortProviderError } from "./shared.js";
import {
  TransportRejectedError,
  type ConversationTransport,
  type OutboundMessage,
  type TransportSendResult,
} from "./types.js";

// Telegram Bot API transport for external contacts (customers, not agents).
// The existing chat-channels Telegram integration is wired to agent conversations, issues and
// publications, so this transport implements the minimal Bot API surface itself with fetch:
// webhook updates (verified with X-Telegram-Bot-Api-Secret-Token) and sendMessage.

export function verifyTelegramSecretToken(header: string | undefined, secretToken: string): boolean {
  return Boolean(header && secretToken) && safeEqual(header ?? "", secretToken);
}

export interface TelegramInboundEvent {
  externalThreadId: string;
  externalMessageId: string;
  from: { handle?: string | null };
  body: string;
  attachments: Record<string, unknown>[];
  occurredAt: Date;
}

/**
 * Normalizes one Telegram update. Only new private or group messages from humans count; edits,
 * bot messages and service updates return null.
 */
export function parseTelegramUpdate(update: unknown): TelegramInboundEvent | null {
  if (!isRecord(update) || !isRecord(update.message)) return null;
  const message = update.message;
  if (!isRecord(message.chat)) return null;
  const chatId = asString(message.chat.id);
  const messageId = asString(message.message_id);
  if (!chatId || !messageId) return null;
  if (isRecord(message.from) && message.from.is_bot === true) return null;

  const sender = isRecord(message.from) ? message.from : {};
  const username = asString(sender.username);
  const attachments: Record<string, unknown>[] = [];
  for (const type of ["photo", "document", "audio", "video", "voice"] as const) {
    if (message[type] !== undefined) attachments.push({ type });
  }
  const date = typeof message.date === "number" && Number.isFinite(message.date) ? message.date : null;
  return {
    externalThreadId: chatId,
    // message_id is unique per chat, so the chat id is part of the idempotency key.
    externalMessageId: `${chatId}:${messageId}`,
    from: { handle: username ? `@${username}` : null },
    body: asString(message.text) ?? asString(message.caption) ?? "",
    attachments,
    occurredAt: date ? new Date(date * 1000) : new Date(),
  };
}

export function createTelegramTransport(db: Db, options: { fetch?: FetchLike } = {}): ConversationTransport {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  return {
    provider: "telegram",
    channels: ["telegram"],

    async send(message: OutboundMessage): Promise<TransportSendResult> {
      const [account] = await listActiveAccounts(db, message.companyId, "telegram");
      if (!account) throw new TransportRejectedError("No hay bot de Telegram activo para esta empresa");
      const token = await readCompanySecret(db, message.companyId, account.tokenSecretName);
      if (!token) throw new TransportRejectedError("El secreto del token del bot no existe o está vacío");
      const chatId = message.externalThreadId;
      if (!chatId) throw new TransportRejectedError("La conversación no tiene identificador de chat");

      let response: Response;
      try {
        response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message.body }),
        });
      } catch {
        throw new ExternalActionUncertainError("La petición a Telegram no obtuvo respuesta; el envío puede haber llegado");
      }
      const body = await readJsonBody(response);
      if (response.status >= 500) {
        throw new ExternalActionUncertainError(`Telegram respondió HTTP ${response.status}; el envío es incierto`);
      }
      if (!response.ok || !isRecord(body) || body.ok !== true) {
        throw new TransportRejectedError(shortProviderError(body, `Telegram rechazó el envío (HTTP ${response.status})`));
      }
      const result = isRecord(body.result) ? body.result : {};
      return {
        status: "sent",
        providerMessageId: asString(result.message_id),
        receipt: { provider: "telegram", httpStatus: response.status },
      };
    },
    // No provider query can settle an uncertain send. A board user decides, and messageService.reconcile
    // writes the outcome itself, so this transport has nothing else to do.
    async resolveManually() {},
  };
}
