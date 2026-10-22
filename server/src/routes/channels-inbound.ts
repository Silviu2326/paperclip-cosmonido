import { Router, urlencoded, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { customerChannelAccounts } from "@paperclipai/db/schema/customer_channels";
import { recordInboundMessage } from "../services/conversations/inbound.js";
import {
  applyMetaStatuses,
  metaChallengeResponse,
  parseMetaWebhook,
  verifyMetaSignature,
} from "../services/conversations/transports/meta.js";
import { parseTelegramUpdate, verifyTelegramSecretToken } from "../services/conversations/transports/telegram.js";
import {
  applyTwilioStatus,
  parseTwilioInbound,
  verifyTwilioSignature,
} from "../services/conversations/transports/twilio.js";
import {
  listActiveAccounts,
  readCompanySecret,
  type ChannelAccountRow,
} from "../services/customer-channels/accounts.js";

// Sprint 2 pistas D/E (canales entrantes). Signed provider webhooks, no company session.
// Mounted under /api by app.ts:
//   GET  /api/webhooks/meta/:companyId       Meta verification challenge (hub.verify_token)
//   POST /api/webhooks/meta/:companyId       WhatsApp, Messenger, Instagram events and statuses
//   POST /api/webhooks/twilio/:companyId     SMS inbound and status callbacks
//   POST /api/webhooks/telegram/:companyId   Telegram bot updates
// Every handler checks the provider signature before it uses any field of the request. A failed
// check answers 401 with no detail. Accepted messages go through recordInboundMessage, which is
// idempotent per provider message id. Nothing in the message text grants authority.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reject(res: Response) {
  res.status(401).json({ error: "Unauthorized" });
}

function rawBodyOf(req: Request): Buffer | null {
  const raw = (req as Request & { rawBody?: unknown }).rawBody;
  return Buffer.isBuffer(raw) ? raw : null;
}

/** Form values as plain strings. Anything else makes the form unusable, so it is rejected. */
function formParams(body: unknown): Record<string, string> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") return null;
    out[key] = value;
  }
  return out;
}

async function accountsOfProvider(
  db: Db,
  companyId: string,
  provider: "meta" | "telegram" | "twilio",
  statuses: readonly string[],
): Promise<ChannelAccountRow[]> {
  return db
    .select()
    .from(customerChannelAccounts)
    .where(and(
      eq(customerChannelAccounts.companyId, companyId),
      eq(customerChannelAccounts.provider, provider),
      inArray(customerChannelAccounts.status, [...statuses]),
    ));
}

export function channelInboundRoutes(db: Db) {
  const router = Router();
  const formBody = urlencoded({ extended: false, limit: "64kb" });

  router.get("/webhooks/meta/:companyId", async (req, res) => {
    const companyId = req.params.companyId as string;
    if (!UUID_PATTERN.test(companyId)) return reject(res);
    // Pending accounts are included: the challenge runs while the account is being set up.
    const accounts = await accountsOfProvider(db, companyId, "meta", ["pending", "active"]);
    const tokens: string[] = [];
    for (const account of accounts) {
      if (!account.challengeSecretName) continue;
      const token = await readCompanySecret(db, companyId, account.challengeSecretName);
      if (token) tokens.push(token);
    }
    const challenge = metaChallengeResponse(req.query as Record<string, unknown>, tokens);
    if (challenge === null) return reject(res);
    res.status(200).type("text/plain").send(challenge);
  });

  router.post("/webhooks/meta/:companyId", async (req, res) => {
    const companyId = req.params.companyId as string;
    if (!UUID_PATTERN.test(companyId)) return reject(res);
    const raw = rawBodyOf(req);
    if (!raw) return reject(res);

    const signature = req.get("x-hub-signature-256") ?? undefined;
    const candidates = await accountsOfProvider(db, companyId, "meta", ["active"]);
    const verified: ChannelAccountRow[] = [];
    for (const account of candidates) {
      const appSecret = await readCompanySecret(db, companyId, account.verifySecretName);
      if (appSecret && verifyMetaSignature(raw, signature, appSecret)) verified.push(account);
    }
    if (verified.length === 0) return reject(res);

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const parsed = parseMetaWebhook(payload);
    for (const event of parsed.inbound) {
      // Route each event to the verified account that owns the receiving number, page or account.
      const owner = verified.find((account) => account.kind === event.kind && account.externalAccountId === event.accountExternalId);
      if (!owner) continue;
      await recordInboundMessage(db, companyId, {
        channel: event.kind,
        provider: "meta",
        externalThreadId: event.externalThreadId,
        externalMessageId: event.externalMessageId,
        from: event.from,
        body: event.body,
        attachments: event.attachments,
        occurredAt: event.occurredAt,
      });
    }
    await applyMetaStatuses(db, companyId, parsed.statuses);
    res.status(200).json({ received: true });
  });

  router.post("/webhooks/twilio/:companyId", formBody, async (req, res) => {
    const companyId = req.params.companyId as string;
    if (!UUID_PATTERN.test(companyId)) return reject(res);
    const signature = req.get("x-twilio-signature") ?? undefined;
    const params = formParams(req.body);
    if (!params) return reject(res);

    // Twilio signs the public URL it called. Behind a proxy, Express trust proxy settings decide the scheme and host.
    const url = `${req.protocol}://${req.get("host") ?? ""}${req.originalUrl}`;
    const candidates = await listActiveAccounts(db, companyId, "twilio");
    const verified: ChannelAccountRow[] = [];
    for (const account of candidates) {
      const authToken = await readCompanySecret(db, companyId, account.verifySecretName);
      if (authToken && verifyTwilioSignature(authToken, url, params, signature)) verified.push(account);
    }
    if (verified.length === 0) return reject(res);

    // An empty TwiML response tells Twilio to send no automatic reply.
    res.type("text/xml");
    if (params.MessageStatus !== undefined) {
      await applyTwilioStatus(db, companyId, params);
      res.status(200).send("<Response/>");
      return;
    }
    const inbound = parseTwilioInbound(params);
    const owner = inbound ? verified.find((account) => account.externalAccountId === inbound.to) : undefined;
    if (inbound && owner) {
      await recordInboundMessage(db, companyId, {
        channel: "sms",
        provider: "twilio",
        externalThreadId: inbound.from,
        externalMessageId: inbound.externalMessageId,
        from: { phone: inbound.from },
        body: inbound.body,
        attachments: inbound.attachments,
      });
    }
    res.status(200).send("<Response/>");
  });

  router.post("/webhooks/telegram/:companyId", async (req, res) => {
    const companyId = req.params.companyId as string;
    if (!UUID_PATTERN.test(companyId)) return reject(res);
    const header = req.get("x-telegram-bot-api-secret-token") ?? undefined;
    if (!header) return reject(res);

    const candidates = await accountsOfProvider(db, companyId, "telegram", ["active"]);
    let verified = false;
    for (const account of candidates) {
      const secretToken = await readCompanySecret(db, companyId, account.verifySecretName);
      if (secretToken && verifyTelegramSecretToken(header, secretToken)) verified = true;
    }
    if (!verified) return reject(res);

    const event = parseTelegramUpdate(req.body);
    if (event) {
      await recordInboundMessage(db, companyId, {
        channel: "telegram",
        provider: "telegram",
        externalThreadId: event.externalThreadId,
        externalMessageId: event.externalMessageId,
        from: event.from,
        body: event.body,
        attachments: event.attachments,
        occurredAt: event.occurredAt,
      });
    }
    res.status(200).json({ ok: true });
  });

  return router;
}
