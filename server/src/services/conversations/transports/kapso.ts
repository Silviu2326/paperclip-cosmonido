import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type Db, conversations, conversationMessages } from "@paperclipai/db";
import { ExternalActionUncertainError } from "../../external-action-gate.js";
import { kapsoApiBaseUrl, listActiveAccounts, readCompanySecret, type FetchLike } from "../../customer-channels/accounts.js";
import { parseMetaWebhook, type MetaInboundEvent } from "./meta.js";
import type { ProviderDeliveryStatus } from "./delivery-status.js";
import { asString, isRecord, readJsonBody, safeEqual, shortProviderError } from "./shared.js";
import { TransportRejectedError, type ConversationTransport } from "./types.js";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function verifyKapsoSignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const hex = signature.replace(/^sha256=/, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return false;
  return safeEqual(hex.toLowerCase(), createHmac("sha256", secret).update(rawBody).digest("hex"));
}

export interface KapsoParsedWebhook {
  inbound: MetaInboundEvent[];
  statuses: Array<{ accountExternalId: string; providerMessageId: string; status: ProviderDeliveryStatus }>;
}

/** Kapso v2 (including buffered deliveries) and native Meta payloads share message shapes.
 * https://docs.kapso.ai/docs/platform/webhooks/message-events
 * Normalize only; the caller must verify both signature and receiving account ownership.
 */
export function parseKapsoWebhook(payload: unknown, headerEvent?: string): KapsoParsedWebhook {
  const out: KapsoParsedWebhook = { inbound: [], statuses: [] };
  if (!isRecord(payload)) return out;

  function appendNative(value: Record<string, unknown>) {
    const metadata = isRecord(value.metadata) ? value.metadata : {};
    const accountExternalId = asString(metadata.phone_number_id);
    if (!accountExternalId) return;
    const parsed = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value }] }],
    });
    for (const event of parsed.inbound) {
      // Preserve the media caption alongside the provider media id and MIME type.
      for (const attachment of event.attachments) attachment.caption = event.body || null;
      out.inbound.push(event);
    }
    out.statuses.push(...parsed.statuses.map((status) => ({ ...status, accountExternalId })));
  }

  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (isRecord(change) && (change.field === undefined || change.field === "messages") && isRecord(change.value)) {
          appendNative(change.value);
        }
      }
    }
    return out;
  }

  const eventName = asString(payload.event) ?? asString(payload.type) ?? headerEvent;
  const items = payload.batch === true && Array.isArray(payload.data)
    ? payload.data : [isRecord(payload.data) ? payload.data : payload];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const conversation = isRecord(item.conversation) ? item.conversation : {};
    const legacy = isRecord(item.whatsapp_config) ? item.whatsapp_config : {};
    const accountExternalId = asString(item.phone_number_id) ?? asString(conversation.phone_number_id) ?? asString(legacy.phone_number_id);
    const message = isRecord(item.message) ? item.message : null;
    if (!accountExternalId || !message) continue;
    const kapso = isRecord(message.kapso) ? message.kapso : {};
    const event = asString(item.event) ?? eventName;
    if (event === "whatsapp.message.received") {
      if (kapso.direction === "outbound" || message.direction === "outbound" || kapso.passive === true || kapso.origin === "history_sync") continue;
      const from = asString(message.from) ?? asString(conversation.phone_number);
      // Use the WhatsApp sender as thread key, matching Meta and outbound recipient routing.
      if (!from || !/^\+?\d+$/.test(from)) continue;
      const type = asString(message.type) ?? asString(message.message_type) ?? "text";
      const text = isRecord(message.text) ? message.text : { body: asString(message.content) ?? "" };
      appendNative({
        metadata: { phone_number_id: accountExternalId },
        messages: [{ ...message, from: from.replace(/^\+/, ""), type, text }],
      });
    } else {
      const status = event?.replace(/^whatsapp\.message\./, "");
      const id = asString(message.id);
      if (id && (status === "sent" || status === "delivered" || status === "read" || status === "failed")) {
        out.statuses.push({ accountExternalId, providerMessageId: id, status });
      }
    }
  }
  return out;
}

export function createKapsoTransport(db: Db, options: { fetch?: FetchLike; timeoutMs?: number } = {}): ConversationTransport {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  return {
    provider: "kapso",
    channels: ["whatsapp"],
    async send(message) {
      const account = (await listActiveAccounts(db, message.companyId, "kapso")).find((row) => row.kind === "whatsapp");
      if (!account) throw new TransportRejectedError("No active Kapso WhatsApp account for this company");
      const token = await readCompanySecret(db, message.companyId, account.tokenSecretName);
      if (!token) throw new TransportRejectedError("Kapso API key secret is empty or missing");
      const to = message.externalThreadId?.replace(/^\+/, "");
      if (!to || !/^\d+$/.test(to)) throw new TransportRejectedError("WhatsApp conversation has no phone recipient");
      const [thread] = await db.select({ lastInboundAt: conversations.lastInboundAt }).from(conversations)
        .where(and(eq(conversations.companyId, message.companyId), eq(conversations.id, message.conversationId))).limit(1);
      const withinWindow = thread?.lastInboundAt && Date.now() - thread.lastInboundAt.getTime() < WINDOW_MS;
      let payload: Record<string, unknown> = {
        messaging_product: "whatsapp", to, type: "text", text: { body: message.body },
        // Provider correlation survives an uncertain response and appears in native status callbacks.
        biz_opaque_callback_data: message.messageId,
      };
      if (!withinWindow) {
        const template = account.approvedTemplates[0];
        if (!template) throw new TransportRejectedError("Outside WhatsApp's 24-hour window: configure an approved template");
        payload = {
          messaging_product: "whatsapp", to, type: "template",
          template: { name: template.name, language: { code: template.language } },
          biz_opaque_callback_data: message.messageId,
        };
      }
      let response: Response;
      let body: unknown;
      try {
        response = await fetchImpl(`${kapsoApiBaseUrl()}/meta/whatsapp/v24.0/${encodeURIComponent(account.externalAccountId)}/messages`, {
          method: "POST",
          // The local message/action gate owns durable idempotency; never rely on provider retries.
          headers: { "X-API-Key": token, "Content-Type": "application/json", "Idempotency-Key": message.messageId },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
        // Reading the response body is part of the timeout too.
        const raw = await response.text();
        try { body = JSON.parse(raw); } catch { body = null; }
      } catch {
        throw new ExternalActionUncertainError("Kapso did not respond; the message may have been sent");
      }
      if (response.status >= 500 || response.status === 408) {
        throw new ExternalActionUncertainError(`Kapso HTTP ${response.status}; delivery is uncertain`);
      }
      if (!response.ok) throw new TransportRejectedError(shortProviderError(body, `Kapso rejected the message (HTTP ${response.status})`));
      const id = isRecord(body) && Array.isArray(body.messages) && isRecord(body.messages[0]) ? asString(body.messages[0].id) : null;
      if (!id) throw new ExternalActionUncertainError("Kapso accepted the request without a message receipt");
      return { status: "sent", providerMessageId: id, receipt: { provider: "kapso", accountExternalId: account.externalAccountId, httpStatus: response.status, usedTemplate: payload.type === "template" } };
    },
    async reconcile(input) {
      // Kapso documents a lookup by WAMID, but not by client idempotency key.
      if (!input.providerMessageId) return { status: "uncertain" };
      const [stored] = await db.select({ providerReceipt: conversationMessages.providerReceipt }).from(conversationMessages)
        .where(and(eq(conversationMessages.companyId, input.companyId), eq(conversationMessages.id, input.messageId))).limit(1);
      const accountId = stored?.providerReceipt?.accountExternalId;
      const accounts = await listActiveAccounts(db, input.companyId, "kapso");
      const account = accounts.find((row) => row.kind === "whatsapp" && row.externalAccountId === accountId);
      if (!account) return { status: "uncertain" };
      const token = await readCompanySecret(db, input.companyId, account.tokenSecretName);
      if (!token) return { status: "uncertain" };
      try {
        const response = await fetchImpl(`${kapsoApiBaseUrl()}/meta/whatsapp/v24.0/${encodeURIComponent(account.externalAccountId)}/messages/${encodeURIComponent(input.providerMessageId)}?fields=kapso(direction,status)`, {
          method: "GET", headers: { "X-API-Key": token }, signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
        if (!response.ok) return { status: "uncertain" };
        const body = await readJsonBody(response);
        const kapso = isRecord(body) && isRecord(body.kapso) ? body.kapso : {};
        if (!isRecord(body) || asString(body.id) !== input.providerMessageId || kapso.direction !== "outbound") return { status: "uncertain" };
        const status = kapso.status;
        if (status === "sent" || status === "delivered" || status === "read" || status === "failed") {
          return { status, providerMessageId: input.providerMessageId, receipt: { accountExternalId: account.externalAccountId, reconciled: true } };
        }
      } catch { /* A read failure gives no evidence of non-delivery. */ }
      return { status: "uncertain" };
    },
    async resolveManually() {},
  };
}
