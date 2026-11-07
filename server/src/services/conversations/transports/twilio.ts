import { createHmac } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { ExternalActionUncertainError } from "../../external-action-gate.js";
import {
  listActiveAccounts,
  readCompanySecret,
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

// Twilio SMS transport (fallback channel). Signed webhooks (X-Twilio-Signature) for inbound
// messages and status callbacks; outbound through the Messages REST resource with basic auth.

/**
 * Twilio signature: HMAC-SHA1 with the auth token over the full URL followed by each form parameter
 * name and value, sorted by name and concatenated without separators. Base64 encoded.
 */
export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature || !authToken) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  return safeEqual(signature, expected);
}

export interface TwilioInboundEvent {
  /** Sending number from the customer, E.164. */
  from: string;
  /** Number that received the message. Used to pick the account. */
  to: string;
  externalMessageId: string;
  body: string;
  attachments: Record<string, unknown>[];
}

/** Normalizes an inbound SMS form. Returns null for status callbacks or incomplete forms. */
export function parseTwilioInbound(params: Record<string, string>): TwilioInboundEvent | null {
  if (params.MessageStatus !== undefined) return null;
  const from = asString(params.From);
  const to = asString(params.To);
  const sid = asString(params.MessageSid);
  if (!from || !to || !sid) return null;
  const mediaCount = Number(params.NumMedia ?? "0");
  const attachments: Record<string, unknown>[] = [];
  for (let index = 0; index < (Number.isFinite(mediaCount) ? mediaCount : 0); index += 1) {
    attachments.push({ type: "media", url: asString(params[`MediaUrl${index}`]), mimeType: asString(params[`MediaContentType${index}`]) });
  }
  return { from, to, externalMessageId: sid, body: params.Body ?? "", attachments };
}

const TWILIO_STATUS: Record<string, ProviderDeliveryStatus | "queued" | null> = {
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "failed",
};

/** Maps a status callback to a delivery status. Returns null for states we do not track. */
export function parseTwilioStatus(params: Record<string, string>): { providerMessageId: string; status: ProviderDeliveryStatus | "queued" } | null {
  const sid = asString(params.MessageSid);
  const status = asString(params.MessageStatus);
  if (!sid || !status) return null;
  const mapped = TWILIO_STATUS[status] ?? null;
  return mapped ? { providerMessageId: sid, status: mapped } : null;
}

/** Applies a Twilio status callback for the company. Returns true when the message status moved. */
export async function applyTwilioStatus(
  db: Db,
  companyId: string,
  params: Record<string, string>,
): Promise<boolean> {
  const parsed = parseTwilioStatus(params);
  if (!parsed || parsed.status === "queued") return false;
  return applyProviderDeliveryStatus(db, {
    companyId,
    provider: "twilio",
    providerMessageId: parsed.providerMessageId,
    status: parsed.status,
    receipt: { twilioStatus: params.MessageStatus },
  });
}

export function createTwilioTransport(db: Db, options: { fetch?: FetchLike } = {}): ConversationTransport {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  return {
    provider: "twilio",
    channels: ["sms"],

    async send(message: OutboundMessage): Promise<TransportSendResult> {
      const [account] = await listActiveAccounts(db, message.companyId, "twilio");
      if (!account || !account.providerAccountSid) {
        throw new TransportRejectedError("No hay cuenta de SMS activa para esta empresa");
      }
      const token = await readCompanySecret(db, message.companyId, account.tokenSecretName);
      if (!token) throw new TransportRejectedError("El secreto del token de Twilio no existe o está vacío");
      const to = message.externalThreadId;
      if (!to) throw new TransportRejectedError("La conversación no tiene número de destino");

      const form = new URLSearchParams({ To: to, From: account.externalAccountId, Body: message.body });
      let response: Response;
      try {
        response = await fetchImpl(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account.providerAccountSid)}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${account.providerAccountSid}:${token}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form.toString(),
          },
        );
      } catch {
        throw new ExternalActionUncertainError("La petición a Twilio no obtuvo respuesta; el envío puede haber llegado");
      }
      const body = await readJsonBody(response);
      if (response.status >= 500) {
        throw new ExternalActionUncertainError(`Twilio respondió HTTP ${response.status}; el envío es incierto`);
      }
      if (!response.ok) {
        throw new TransportRejectedError(shortProviderError(body, `Twilio rechazó el envío (HTTP ${response.status})`));
      }
      const sid = isRecord(body) ? asString(body.sid) : null;
      return { status: "queued", providerMessageId: sid, receipt: { provider: "twilio", httpStatus: response.status } };
    },
    // No provider query can settle an uncertain send. A board user decides, and messageService.reconcile
    // writes the outcome itself, so this transport has nothing else to do.
    async resolveManually() {},
  };
}
