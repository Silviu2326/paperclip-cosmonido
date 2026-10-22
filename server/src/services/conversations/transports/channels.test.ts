import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  activityLog,
  companies,
  conversationMessages,
  conversations,
  createDb,
  externalActions,
  leads,
  type Db,
} from "@paperclipai/db";
import { customerChannelAccounts } from "@paperclipai/db/schema/customer_channels";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { channelInboundRoutes } from "../../../routes/channels-inbound.js";
import { recordInboundMessage } from "../inbound.js";
import { conversationMessageService, registerConversationTransport } from "../messages.js";
import { metaChallengeResponse, createMetaTransport, parseMetaWebhook, verifyMetaSignature } from "./meta.js";
import { createTwilioTransport, parseTwilioInbound, verifyTwilioSignature } from "./twilio.js";
import { createTelegramTransport, parseTelegramUpdate, verifyTelegramSecretToken } from "./telegram.js";

// Secrets are mocked by name: the tests check the channel logic, not the encrypted secret store.
const SECRETS: Record<string, string> = {
  "meta-app-secret": "app-secret-123",
  "meta-verify-token": "verify-me",
  "meta-token": "EAAG-page-token",
  "twilio-auth": "twilio-auth-token",
  "telegram-webhook": "tg-webhook-secret",
  "telegram-bot": "123:bot-token",
};

vi.mock("../../customer-channels/accounts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../customer-channels/accounts.js")>();
  return {
    ...actual,
    readCompanySecret: async (_db: unknown, _companyId: string, name: string) => SECRETS[name] ?? null,
  };
});

const embedded = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embedded.supported ? describe : describe.skip;
if (!embedded.supported) {
  console.warn(`Skipping channel tests on this host: ${embedded.reason ?? "unsupported environment"}`);
}

const WA_NUMBER_ID = "1100200300";
const TWILIO_NUMBER = "+34600111222";
const TWILIO_SID = "AC" + "a".repeat(32);
const PUBLIC_HOST = "paperclip.test";

function metaSignature(body: string, secret = SECRETS["meta-app-secret"]) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function whatsappInbound(messageId: string, from = "34611222333", text = "Hola, quiero información") {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "34600000000", phone_number_id: WA_NUMBER_ID },
          contacts: [{ profile: { name: "Ana" }, wa_id: from }],
          messages: [{ from, id: messageId, timestamp: "1767225600", type: "text", text: { body: text } }],
        },
      }],
    }],
  };
}

function whatsappStatus(messageId: string, status: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: WA_NUMBER_ID },
          statuses: [{ id: messageId, status, recipient_id: "34611222333", timestamp: "1767225700" }],
        },
      }],
    }],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describeEmbeddedPostgres("customer channels: Meta, Twilio, Telegram", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId = "";
  let app!: express.Express;
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-channels-");
    db = createDb(tempDb.connectionString);
    // Bridge until pista D/E's migration is generated: the table is created here, not by migration.
    await db.execute(sql`
      create table if not exists customer_channel_accounts (
        id uuid primary key default gen_random_uuid(),
        company_id uuid not null references companies(id) on delete cascade,
        provider text not null,
        kind text not null,
        label text not null,
        external_account_id text not null,
        provider_account_sid text,
        verify_secret_name text not null,
        challenge_secret_name text,
        token_secret_name text not null,
        status text not null default 'pending',
        approved_templates jsonb not null default '[]'::jsonb,
        last_tested_at timestamptz,
        last_test_error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint customer_channel_accounts_provider_check check (provider in ('meta', 'telegram', 'twilio')),
        constraint customer_channel_accounts_kind_check check (kind in ('whatsapp', 'messenger', 'instagram', 'telegram', 'sms')),
        constraint customer_channel_accounts_status_check check (status in ('pending', 'active', 'disabled'))
      )`);
    await db.execute(sql`
      create unique index if not exists customer_channel_accounts_company_provider_identifier_uq
        on customer_channel_accounts (company_id, provider, external_account_id)`);

    registerConversationTransport(createMetaTransport(db, { fetch: fetchMock }));
    registerConversationTransport(createTwilioTransport(db, { fetch: fetchMock }));
    registerConversationTransport(createTelegramTransport(db, { fetch: fetchMock }));

    app = express();
    // Mirrors app.ts: the global JSON parser keeps the raw bytes for signature checks.
    app.use("/api", express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; } }));
    app.use("/api", channelInboundRoutes(db));
  }, 300_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  afterEach(async () => {
    fetchMock.mockReset();
    await db.delete(activityLog);
    await db.delete(externalActions);
    await db.delete(conversationMessages);
    await db.delete(conversations);
    await db.delete(leads);
    await db.delete(customerChannelAccounts);
    await db.delete(companies);
  });

  async function setupCompany(options: { templates?: Array<{ name: string; language: string }> } = {}) {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Clientes SA",
      issuePrefix: `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(customerChannelAccounts).values([
      {
        companyId,
        provider: "meta",
        kind: "whatsapp",
        label: "WhatsApp ventas",
        externalAccountId: WA_NUMBER_ID,
        verifySecretName: "meta-app-secret",
        challengeSecretName: "meta-verify-token",
        tokenSecretName: "meta-token",
        status: "active",
        approvedTemplates: options.templates ?? [],
      },
      {
        companyId,
        provider: "meta",
        kind: "messenger",
        label: "Página",
        externalAccountId: "page-9",
        verifySecretName: "meta-app-secret",
        challengeSecretName: "meta-verify-token",
        tokenSecretName: "meta-token",
        status: "active",
      },
      {
        companyId,
        provider: "twilio",
        kind: "sms",
        label: "SMS",
        externalAccountId: TWILIO_NUMBER,
        providerAccountSid: TWILIO_SID,
        verifySecretName: "twilio-auth",
        tokenSecretName: "twilio-auth",
        status: "active",
      },
      {
        companyId,
        provider: "telegram",
        kind: "telegram",
        label: "Bot",
        externalAccountId: "123",
        verifySecretName: "telegram-webhook",
        tokenSecretName: "telegram-bot",
        status: "active",
      },
    ]);
  }

  async function inboundConversation(channel: "whatsapp" | "messenger", thread: string, mid: string) {
    return recordInboundMessage(db, companyId, {
      channel,
      provider: "meta",
      externalThreadId: thread,
      externalMessageId: mid,
      from: channel === "whatsapp" ? { phone: `+${thread}` } : { handle: thread },
      body: "Hola",
    });
  }

  async function ageLastInbound(conversationId: string, hours: number) {
    await db
      .update(conversations)
      .set({ lastInboundAt: new Date(Date.now() - hours * 3600_000) })
      .where(eq(conversations.id, conversationId));
  }

  async function messagesOf(conversationId: string) {
    return db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId));
  }

  describe("signatures and challenges (pure)", () => {
    it("accepts a valid Meta X-Hub-Signature-256 and rejects tampered or unsigned bodies", () => {
      const body = JSON.stringify(whatsappInbound("wamid.A"));
      expect(verifyMetaSignature(body, metaSignature(body), SECRETS["meta-app-secret"])).toBe(true);
      expect(verifyMetaSignature(body + " ", metaSignature(body), SECRETS["meta-app-secret"])).toBe(false);
      expect(verifyMetaSignature(body, metaSignature(body, "other-secret"), SECRETS["meta-app-secret"])).toBe(false);
      expect(verifyMetaSignature(body, undefined, SECRETS["meta-app-secret"])).toBe(false);
      expect(verifyMetaSignature(body, metaSignature(body).replace("sha256=", "sha1="), SECRETS["meta-app-secret"])).toBe(false);
    });

    it("answers the GET verification challenge only for a matching verify token", () => {
      const tokens = [SECRETS["meta-verify-token"]];
      const ok = { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "1158201444" };
      expect(metaChallengeResponse(ok, tokens)).toBe("1158201444");
      expect(metaChallengeResponse({ ...ok, "hub.verify_token": "wrong" }, tokens)).toBeNull();
      expect(metaChallengeResponse({ ...ok, "hub.mode": "unsubscribe" }, tokens)).toBeNull();
      expect(metaChallengeResponse(ok, [])).toBeNull();
    });

    it("accepts a valid Twilio signature and rejects a changed parameter", () => {
      const url = `https://${PUBLIC_HOST}/api/webhooks/twilio/${randomUUID()}`;
      const params = { From: "+34611222333", To: TWILIO_NUMBER, Body: "Hola", MessageSid: "SM1" };
      const data = url + Object.keys(params).sort().map((key) => key + params[key as keyof typeof params]).join("");
      const signature = createHmac("sha1", SECRETS["twilio-auth"]).update(data, "utf8").digest("base64");
      expect(verifyTwilioSignature(SECRETS["twilio-auth"], url, params, signature)).toBe(true);
      expect(verifyTwilioSignature(SECRETS["twilio-auth"], url, { ...params, Body: "Adios" }, signature)).toBe(false);
      expect(verifyTwilioSignature(SECRETS["twilio-auth"], url, params, undefined)).toBe(false);
    });

    it("normalizes Meta events and status callbacks, skipping echoes", () => {
      const parsed = parseMetaWebhook({
        ...whatsappInbound("wamid.B"),
        entry: [{
          id: "waba-1",
          changes: [{
            field: "messages",
            value: {
              metadata: { phone_number_id: WA_NUMBER_ID },
              messages: [{ from: "34611222333", id: "wamid.B", timestamp: "1767225600", type: "text", text: { body: "Hola" } }],
              statuses: [{ id: "wamid.OUT", status: "read" }],
            },
          }],
        }],
      });
      expect(parsed.inbound).toHaveLength(1);
      expect(parsed.inbound[0]).toMatchObject({ kind: "whatsapp", externalThreadId: "34611222333", externalMessageId: "wamid.B", body: "Hola" });
      expect(parsed.inbound[0].from.phone).toBe("+34611222333");
      expect(parsed.statuses).toEqual([{ providerMessageId: "wamid.OUT", status: "read" }]);

      const messenger = parseMetaWebhook({
        object: "page",
        entry: [{
          id: "page-9",
          messaging: [
            { sender: { id: "psid-1" }, timestamp: 1767225600000, message: { mid: "m_1", text: "Hola" } },
            { sender: { id: "page-9" }, timestamp: 1767225600000, message: { mid: "m_2", text: "eco", is_echo: true } },
            { sender: { id: "page-9" }, delivery: { mids: ["m_0"] } },
          ],
        }],
      });
      expect(messenger.inbound.map((event) => event.externalMessageId)).toEqual(["m_1"]);
      expect(messenger.statuses).toEqual([{ providerMessageId: "m_0", status: "delivered" }]);
    });

    it("normalizes Twilio inbound forms and skips status callbacks", () => {
      expect(parseTwilioInbound({ From: "+34611222333", To: TWILIO_NUMBER, MessageSid: "SM9", Body: "Hola", NumMedia: "0" }))
        .toMatchObject({ from: "+34611222333", to: TWILIO_NUMBER, externalMessageId: "SM9", body: "Hola" });
      expect(parseTwilioInbound({ MessageSid: "SM9", MessageStatus: "delivered", From: "+1", To: "+2" })).toBeNull();
    });

    it("checks the Telegram secret token and normalizes private messages", () => {
      expect(verifyTelegramSecretToken("tg-webhook-secret", SECRETS["telegram-webhook"])).toBe(true);
      expect(verifyTelegramSecretToken("nope", SECRETS["telegram-webhook"])).toBe(false);
      expect(verifyTelegramSecretToken(undefined, SECRETS["telegram-webhook"])).toBe(false);
      const event = parseTelegramUpdate({
        update_id: 1,
        message: { message_id: 7, date: 1767225600, chat: { id: 555 }, from: { id: 9, username: "ana" }, text: "Hola" },
      });
      expect(event).toMatchObject({ externalThreadId: "555", externalMessageId: "555:7", body: "Hola", from: { handle: "@ana" } });
      expect(parseTelegramUpdate({ message: { message_id: 8, chat: { id: 555 }, from: { is_bot: true }, text: "x" } })).toBeNull();
    });
  });

  describe("24 h window and delivery", () => {
    it("sends inside the window with a free-form text message", async () => {
      await setupCompany();
      fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "wamid.OUT1" }] }));
      const { conversation } = await inboundConversation("whatsapp", "34611222333", "wamid.IN1");

      const outcome = await conversationMessageService(db).reply(companyId, conversation.id, {
        body: "Claro, te envío el presupuesto",
        attachments: [],
        idempotencyKey: "reply-1",
      }, { userId: "board-user" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://graph.facebook.com/v21.0/1100200300/messages");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ messaging_product: "whatsapp", to: "34611222333", type: "text" });
      expect(outcome.message.deliveryStatus).toBe("sent");
      expect(outcome.message.providerMessageId).toBe("wamid.OUT1");
    });

    it("rejects outside the window when the account has no approved template, without calling Meta", async () => {
      await setupCompany();
      const { conversation } = await inboundConversation("whatsapp", "34611222333", "wamid.IN2");
      await ageLastInbound(conversation.id, 25);

      const outcome = await conversationMessageService(db).reply(companyId, conversation.id, {
        body: "Seguimiento",
        attachments: [],
        idempotencyKey: "reply-2",
      }, { userId: "board-user" });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(outcome.message.deliveryStatus).toBe("failed");
      const [row] = await messagesOf(conversation.id).then((rows) => rows.filter((r) => r.direction === "outbound"));
      expect(String((row.providerReceipt as Record<string, unknown>).error)).toContain("plantilla aprobada");
    });

    it("sends the approved template outside the window", async () => {
      await setupCompany({ templates: [{ name: "reabrir_contacto", language: "es" }] });
      fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "wamid.TPL1" }] }));
      const { conversation } = await inboundConversation("whatsapp", "34611222333", "wamid.IN3");
      await ageLastInbound(conversation.id, 30);

      const outcome = await conversationMessageService(db).reply(companyId, conversation.id, {
        body: "Hola de nuevo",
        attachments: [],
        idempotencyKey: "reply-3",
      }, { userId: "board-user" });

      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body).toMatchObject({
        type: "template",
        template: { name: "reabrir_contacto", language: { code: "es" } },
      });
      expect(outcome.message.deliveryStatus).toBe("sent");
      expect(outcome.message.providerMessageId).toBe("wamid.TPL1");
    });

    it("leaves a message uncertain, never resent, when Meta answers 5xx", async () => {
      await setupCompany();
      fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 }));
      const { conversation } = await inboundConversation("whatsapp", "34611222333", "wamid.IN4");

      const outcome = await conversationMessageService(db).reply(companyId, conversation.id, {
        body: "Hola",
        attachments: [],
        idempotencyKey: "reply-4",
      }, { userId: "board-user" });

      expect(outcome.message.deliveryStatus).toBe("uncertain");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // A board user settles it by hand; the message is not resent.
      const settled = await conversationMessageService(db).reconcile(
        companyId,
        outcome.message.id,
        { userId: "board-user" },
        { outcome: "sent" },
      );
      expect(settled.deliveryStatus).toBe("sent");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("delivery callbacks and webhook intake over HTTP", () => {
    it("moves delivery forward only: delivered, read, then a late sent is ignored", async () => {
      await setupCompany();
      fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "wamid.CB1" }] }));
      const { conversation } = await inboundConversation("whatsapp", "34611222333", "wamid.IN5");
      await conversationMessageService(db).reply(companyId, conversation.id, { body: "Hola", attachments: [], idempotencyKey: "cb-1" }, { userId: "board-user" });

      const payload = JSON.stringify(whatsappStatus("wamid.CB1", "delivered"));
      await request(app).post(`/api/webhooks/meta/${companyId}`).set("Host", PUBLIC_HOST)
        .set("Content-Type", "application/json").set("X-Hub-Signature-256", metaSignature(payload)).send(payload).expect(200);
      expect((await messagesOf(conversation.id)).find((r) => r.direction === "outbound")?.deliveryStatus).toBe("delivered");

      const read = JSON.stringify(whatsappStatus("wamid.CB1", "read"));
      await request(app).post(`/api/webhooks/meta/${companyId}`).set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", metaSignature(read)).send(read).expect(200);
      const late = JSON.stringify(whatsappStatus("wamid.CB1", "sent"));
      await request(app).post(`/api/webhooks/meta/${companyId}`).set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", metaSignature(late)).send(late).expect(200);

      expect((await messagesOf(conversation.id)).find((r) => r.direction === "outbound")?.deliveryStatus).toBe("read");
    });

    it("stores a repeated signed webhook once", async () => {
      await setupCompany();
      const payload = JSON.stringify(whatsappInbound("wamid.DUP1"));
      const send = () => request(app).post(`/api/webhooks/meta/${companyId}`).set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", metaSignature(payload)).send(payload);
      await send().expect(200);
      await send().expect(200);

      const rows = await db.select().from(conversationMessages).where(eq(conversationMessages.providerMessageId, "wamid.DUP1"));
      expect(rows).toHaveLength(1);
    });

    it("rejects an invalid signature with 401 and stores nothing", async () => {
      await setupCompany();
      const payload = JSON.stringify(whatsappInbound("wamid.BAD1"));
      const response = await request(app).post(`/api/webhooks/meta/${companyId}`).set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", metaSignature(payload, "forged")).send(payload);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized" });
      expect(await db.select().from(conversationMessages)).toHaveLength(0);
    });

    it("answers the Meta GET challenge with the verify token and rejects a wrong one", async () => {
      await setupCompany();
      const ok = await request(app).get(`/api/webhooks/meta/${companyId}`).query({
        "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "abc123",
      });
      expect(ok.status).toBe(200);
      expect(ok.text).toBe("abc123");
      const wrong = await request(app).get(`/api/webhooks/meta/${companyId}`).query({
        "hub.mode": "subscribe", "hub.verify_token": "guess", "hub.challenge": "abc123",
      });
      expect(wrong.status).toBe(401);
    });

    it("keeps Twilio inbound idempotent and verifies the signature before reading the form", async () => {
      await setupCompany();
      const url = `http://${PUBLIC_HOST}/api/webhooks/twilio/${companyId}`;
      const form = { From: "+34611222333", To: TWILIO_NUMBER, Body: "Hola por SMS", MessageSid: "SM-IN-1", NumMedia: "0" };
      const sign = (params: Record<string, string>) => {
        const data = url + Object.keys(params).sort().map((key) => key + params[key]).join("");
        return createHmac("sha1", SECRETS["twilio-auth"]).update(data, "utf8").digest("base64");
      };
      const post = (params: Record<string, string>, signature: string) => request(app)
        .post(`/api/webhooks/twilio/${companyId}`).set("Host", PUBLIC_HOST)
        .set("X-Twilio-Signature", signature).type("form").send(params);

      await post(form, sign(form)).expect(200);
      await post(form, sign(form)).expect(200);
      const invalid = await post(form, "not-a-signature");
      expect(invalid.status).toBe(401);
      const rows = await db.select().from(conversationMessages).where(eq(conversationMessages.providerMessageId, "SM-IN-1"));
      expect(rows).toHaveLength(1);
      expect(rows[0].direction).toBe("inbound");
    });

    it("applies Twilio status callbacks to the outbound SMS", async () => {
      await setupCompany();
      fetchMock.mockResolvedValueOnce(jsonResponse({ sid: "SM-OUT-1", status: "queued" }, 201));
      const sms = await recordInboundMessage(db, companyId, {
        channel: "sms",
        provider: "twilio",
        externalThreadId: "+34611222333",
        externalMessageId: "SM-IN-2",
        from: { phone: "+34611222333" },
        body: "¿Hay plazas?",
      });
      const outcome = await conversationMessageService(db).reply(companyId, sms.conversation.id, {
        body: "Sí, mañana",
        attachments: [],
        idempotencyKey: "sms-1",
      }, { userId: "board-user" });
      expect(outcome.message.deliveryStatus).toBe("queued");
      expect(fetchMock.mock.calls[0][0]).toBe(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);

      const callback = { MessageSid: "SM-OUT-1", MessageStatus: "delivered", From: TWILIO_NUMBER, To: "+34611222333" };
      const url = `http://${PUBLIC_HOST}/api/webhooks/twilio/${companyId}`;
      const data = url + Object.keys(callback).sort().map((key) => key + callback[key as keyof typeof callback]).join("");
      const signature = createHmac("sha1", SECRETS["twilio-auth"]).update(data, "utf8").digest("base64");
      await request(app).post(`/api/webhooks/twilio/${companyId}`).set("Host", PUBLIC_HOST)
        .set("X-Twilio-Signature", signature).type("form").send(callback).expect(200);

      const [row] = (await messagesOf(sms.conversation.id)).filter((r) => r.direction === "outbound");
      expect(row.deliveryStatus).toBe("delivered");
    });
  });
});
