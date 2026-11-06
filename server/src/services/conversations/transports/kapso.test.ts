import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { createCustomerChannelAccountSchema, updateCustomerChannelAccountSchema } from "@paperclipai/shared";
import { channelInboundRoutes } from "../../../routes/channels-inbound.js";
import { registerConversationTransport, transportForChannel, transportForCompany } from "../messages.js";
import { customerChannelService, probeRequest, toChannelAccountView, type ChannelAccountRow, type FetchLike } from "../../customer-channels/accounts.js";
import { ExternalActionUncertainError } from "../../external-action-gate.js";
import { createMetaTransport } from "./meta.js";
import { createKapsoTransport, parseKapsoWebhook, verifyKapsoSignature } from "./kapso.js";
import { TransportRejectedError, type OutboundMessage } from "./types.js";

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(), secret: vi.fn(), inbound: vi.fn(), status: vi.fn(),
  secretByName: vi.fn(), log: vi.fn(),
}));
vi.mock("../../customer-channels/accounts.js", async (original) => ({
  ...await original<typeof import("../../customer-channels/accounts.js")>(),
  listActiveAccounts: mocks.accounts, readCompanySecret: mocks.secret,
}));
vi.mock("../inbound.js", () => ({ recordInboundMessage: mocks.inbound }));
vi.mock("./delivery-status.js", () => ({ applyProviderDeliveryStatus: mocks.status }));
vi.mock("../../secrets.js", () => ({ secretService: () => ({ getByName: mocks.secretByName }) }));
vi.mock("../../activity-log.js", () => ({ logActivity: mocks.log }));

const companyId = randomUUID();
const phoneId = "123456789";
const secret = "kapso-webhook-secret";
const account: ChannelAccountRow = {
  id: randomUUID(), companyId, provider: "kapso", kind: "whatsapp", label: "WhatsApp",
  externalAccountId: phoneId, providerAccountSid: "+34600000000", tokenSecretName: "kapso-key",
  verifySecretName: "kapso-signature", challengeSecretName: null, status: "active",
  approvedTemplates: [], lastTestedAt: null, lastTestError: null, createdAt: new Date(), updatedAt: new Date(),
};
const outbound: OutboundMessage = {
  companyId, messageId: randomUUID(), conversationId: randomUUID(), channel: "whatsapp",
  externalThreadId: "34611111111", body: "Hola", subject: null, to: {}, replyToProviderMessageId: null, actor: {},
};
function dbWithRows(rows: unknown[]): Db {
  const chain = {
    from: () => chain, where: () => chain, orderBy: () => chain,
    limit: async () => rows,
    then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  return { select: () => chain } as unknown as Db;
}
function fixture(message: Record<string, unknown> = {}) {
  return { phone_number_id: phoneId, message: {
    id: "wamid.in", from: "34611111111", timestamp: "1767225600", type: "text", text: { body: "Hola" }, ...message,
  } };
}
function nativePayload() {
  return { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneId }, messages: [fixture().message],
    statuses: [{ id: "wamid.out", status: "read" }],
  } }] }] };
}
function signature(raw: string) { return createHmac("sha256", secret).update(raw).digest("hex"); }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.mockResolvedValue([account]);
  mocks.secret.mockImplementation(async (_db, _companyId, name) => name === "kapso-signature" ? secret : "api-key");
  mocks.secretByName.mockResolvedValue({ id: randomUUID() });
  mocks.inbound.mockResolvedValue({ created: true });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Kapso signatures and payloads", () => {
  it("verifies raw bytes, hex and sha256 prefix; rejects missing, forged and malformed signatures", () => {
    const raw = JSON.stringify(fixture());
    expect(verifyKapsoSignature(raw, signature(raw), secret)).toBe(true);
    expect(verifyKapsoSignature(Buffer.from(raw), `sha256=${signature(raw)}`, secret)).toBe(true);
    for (const bad of [undefined, "no", "a".repeat(64)]) expect(verifyKapsoSignature(raw, bad, secret)).toBe(false);
    expect(verifyKapsoSignature(raw + " ", signature(raw), secret)).toBe(false);
    expect(verifyKapsoSignature(raw, signature(raw), "")).toBe(false);
  });
  it("parses documented v2 header events and preserves media metadata", () => {
    expect(parseKapsoWebhook(fixture(), "whatsapp.message.received").inbound[0]).toMatchObject({
      accountExternalId: phoneId, externalThreadId: "34611111111", externalMessageId: "wamid.in", body: "Hola",
      from: { phone: "+34611111111" }, occurredAt: new Date(1767225600000),
    });
    const parsed = parseKapsoWebhook({ ...fixture({ type: "image", image: { id: "media-1", mime_type: "image/jpeg", caption: "Foto" } }), event: "whatsapp.message.received" });
    expect(parsed.inbound[0].attachments).toEqual([{ type: "image", id: "media-1", mimeType: "image/jpeg", caption: "Foto" }]);
  });
  it("accepts native Meta envelopes without object/field and scopes statuses to the number", () => {
    const parsed = parseKapsoWebhook(nativePayload());
    expect(parsed.inbound).toHaveLength(1);
    expect(parsed.statuses).toEqual([{ accountExternalId: phoneId, providerMessageId: "wamid.out", status: "read" }]);
  });
  it("accepts buffered v2 and legacy text fields, ignores malformed messages and outbound echoes", () => {
    const legacy = { whatsapp_config: { phone_number_id: phoneId }, message: { id: "old", from: "+34611111111", message_type: "text", content: "Legacy" } };
    const result = parseKapsoWebhook({ batch: true, type: "whatsapp.message.received", data: [fixture(), legacy, null, fixture({ id: null }), fixture({ kapso: { direction: "outbound" } })] });
    expect(result.inbound.map((event) => event.body)).toEqual(["Hola", "Legacy"]);
    for (const payload of [null, [], {}, { entry: [null, {}] }]) expect(parseKapsoWebhook(payload)).toEqual({ inbound: [], statuses: [] });
  });
  it.each(["sent", "delivered", "read", "failed"])("normalizes %s without creating inbound messages", (status) => {
    const parsed = parseKapsoWebhook({ ...fixture(), event: `whatsapp.message.${status}` });
    expect(parsed.inbound).toEqual([]);
    expect(parsed.statuses[0]).toMatchObject({ status, providerMessageId: "wamid.in", accountExternalId: phoneId });
  });
});

describe("Kapso outbound", () => {
  const db = dbWithRows([{ lastInboundAt: new Date() }]);
  it("sends text with API key, message idempotency key and configured base URL", async () => {
    vi.stubEnv("KAPSO_API_BASE_URL", "https://kapso.example/");
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response({ messages: [{ id: "wamid.out" }] }));
    expect(await createKapsoTransport(db, { fetch }).send(outbound)).toMatchObject({ status: "sent", providerMessageId: "wamid.out", receipt: { usedTemplate: false, accountExternalId: phoneId } });
    expect(fetch).toHaveBeenCalledWith(`https://kapso.example/meta/whatsapp/v24.0/${phoneId}/messages`, expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-API-Key": "api-key", "Idempotency-Key": outbound.messageId }) }));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ messaging_product: "whatsapp", to: outbound.externalThreadId, type: "text", text: { body: "Hola" }, biz_opaque_callback_data: outbound.messageId });
  });
  it("requires a configured approved template outside 24 hours and sends it unchanged", async () => {
    const old = dbWithRows([{ lastInboundAt: new Date(Date.now() - 24 * 3600_000 - 1) }]);
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response({ messages: [{ id: "wamid.template" }] }));
    const transport = createKapsoTransport(old, { fetch });
    await expect(transport.send(outbound)).rejects.toBeInstanceOf(TransportRejectedError);
    expect(fetch).not.toHaveBeenCalled();
    mocks.accounts.mockResolvedValue([{ ...account, approvedTemplates: [{ name: "hello", language: "es" }] }]);
    await transport.send(outbound);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ type: "template", template: { name: "hello", language: { code: "es" } } });
  });
  it("rejects 4xx definitively and treats network, 5xx and missing receipts as uncertain", async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValueOnce(response({ error: { message: "Bad recipient" } }, 400))
      .mockResolvedValueOnce(response({}, 503)).mockRejectedValueOnce(new Error("reset"))
      .mockResolvedValueOnce(response({}));
    const transport = createKapsoTransport(db, { fetch });
    await expect(transport.send(outbound)).rejects.toThrow("Bad recipient");
    for (let i = 0; i < 3; i++) await expect(transport.send(outbound)).rejects.toBeInstanceOf(ExternalActionUncertainError);
  });
  it("aborts a real stalled HTTP request and never retries it", async () => {
    let received = 0;
    const sockets = new Set<import("node:net").Socket>();
    const server = createServer((_req, _res) => { received++; });
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    vi.stubEnv("KAPSO_API_BASE_URL", `http://127.0.0.1:${address.port}`);
    try {
      await expect(createKapsoTransport(db, { timeoutMs: 150 }).send(outbound)).rejects.toBeInstanceOf(ExternalActionUncertainError);
      expect(received).toBe(1);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
  it("reconciles by documented WAMID lookup; missing ids and read failures remain uncertain", async () => {
    const stored = dbWithRows([{ providerReceipt: { accountExternalId: phoneId } }]);
    const fetch = vi.fn<FetchLike>().mockResolvedValueOnce(response({ id: "wamid.out", kapso: { direction: "outbound", status: "delivered" } }))
      .mockResolvedValueOnce(response({}, 404));
    const transport = createKapsoTransport(stored, { fetch });
    const input = { companyId, messageId: outbound.messageId, providerMessageId: "wamid.out" };
    expect(await transport.reconcile!(input)).toMatchObject({ status: "delivered", providerMessageId: "wamid.out" });
    expect(fetch.mock.calls[0][0]).toContain(`/${phoneId}/messages/wamid.out?fields=kapso(direction,status)`);
    expect(await transport.reconcile!(input)).toEqual({ status: "uncertain" });
    expect(await transport.reconcile!({ ...input, providerMessageId: null })).toEqual({ status: "uncertain" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("chooses Kapso only for active WhatsApp accounts and keeps Meta for old receipts and other channels", async () => {
    const meta = createMetaTransport(db);
    const kapso = createKapsoTransport(db);
    registerConversationTransport(meta);
    registerConversationTransport(kapso, { defaultForChannel: false });
    expect(transportForChannel("whatsapp")).toBe(meta);
    expect(await transportForCompany(db, companyId, "whatsapp")).toBe(kapso);
    expect(await transportForCompany(db, companyId, "whatsapp", "meta")).toBe(meta);
    expect(await transportForCompany(db, companyId, "messenger")).toBe(meta);
    expect(mocks.accounts).toHaveBeenCalledWith(db, companyId, "kapso");
    mocks.accounts.mockResolvedValue([]);
    expect(await transportForCompany(db, companyId, "whatsapp")).toBe(meta);
    expect(await transportForCompany(db, companyId, "whatsapp", "kapso")).toBe(kapso);
  });
});

describe("Kapso account contract", () => {
  it("accepts secret aliases and rejects missing credentials, wrong kind and invalid number id", () => {
    const input = { provider: "kapso", kind: "whatsapp", label: "WA", externalAccountId: phoneId, apiKeySecretName: "key", webhookSecretName: "signature", displayPhoneNumber: "+34600000000" };
    expect(createCustomerChannelAccountSchema.parse(input)).toEqual(input);
    expect(createCustomerChannelAccountSchema.safeParse({ ...input, apiKeySecretName: undefined }).success).toBe(false);
    expect(createCustomerChannelAccountSchema.safeParse({ ...input, kind: "sms" }).success).toBe(false);
    expect(createCustomerChannelAccountSchema.safeParse({ ...input, externalAccountId: "../other" }).success).toBe(false);
    expect(updateCustomerChannelAccountSchema.parse({ apiKeySecretName: "rotated" })).toEqual({ apiKeySecretName: "rotated" });
  });
  it("persists aliases in existing columns and returns names rather than credentials", async () => {
    const values = vi.fn().mockReturnValue({ returning: async () => [account] });
    const db = dbWithRows([]);
    Object.assign(db, { insert: () => ({ values }) });
    await customerChannelService(db).create(companyId, { provider: "kapso", kind: "whatsapp", label: "WA", externalAccountId: phoneId,
      apiKeySecretName: "kapso-key", webhookSecretName: "kapso-signature", displayPhoneNumber: "+34600000000" }, { actorType: "user", actorId: "board" });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ tokenSecretName: "kapso-key", verifySecretName: "kapso-signature", providerAccountSid: "+34600000000" }));
    expect(toChannelAccountView(account)).toMatchObject({ apiKeySecretName: "kapso-key", webhookSecretName: "kapso-signature", displayPhoneNumber: "+34600000000" });
  });
  it("probes phone metadata with X-API-Key and the configured base URL", () => {
    vi.stubEnv("KAPSO_API_BASE_URL", "https://kapso.example/");
    expect(probeRequest(account, "key")).toEqual({ url: `https://kapso.example/meta/whatsapp/v24.0/${phoneId}?fields=id,display_phone_number`, headers: { "X-API-Key": "key" } });
  });
});

describe("Kapso webhook route", () => {
  function app(rows = [account]) {
    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody: Buffer }).rawBody = buf; } }));
    app.use("/api", channelInboundRoutes(dbWithRows(rows)));
    return app;
  }
  async function post(payload: unknown, sig?: string, event = "whatsapp.message.received") {
    const raw = JSON.stringify(payload);
    return request(app()).post(`/api/webhooks/kapso/${companyId}`).set("Content-Type", "application/json")
      .set("X-Webhook-Event", event).set("X-Webhook-Signature", sig ?? signature(raw)).send(raw);
  }
  it("rejects forged signatures before calling inbound persistence", async () => {
    expect((await post(fixture(), "a".repeat(64))).status).toBe(401);
    expect(mocks.inbound).not.toHaveBeenCalled();
  });
  it("records verified inbound through the existing durable deduplication service", async () => {
    expect((await post(fixture())).status).toBe(200);
    expect(mocks.inbound).toHaveBeenCalledWith(expect.anything(), companyId, expect.objectContaining({ provider: "kapso", channel: "whatsapp", externalMessageId: "wamid.in" }));
  });
  it("ignores messages and statuses for numbers not owned by the verified account", async () => {
    expect((await post({ ...fixture(), phone_number_id: "other" })).status).toBe(200);
    expect((await post({ ...fixture(), phone_number_id: "other" }, undefined, "whatsapp.message.read")).status).toBe(200);
    expect(mocks.inbound).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("applies native Meta statuses under provider kapso and processes the inbound message", async () => {
    expect((await post(nativePayload())).status).toBe(200);
    expect(mocks.status).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyId, provider: "kapso", providerMessageId: "wamid.out", status: "read" }));
    expect(mocks.inbound).toHaveBeenCalledTimes(1);
  });
});
