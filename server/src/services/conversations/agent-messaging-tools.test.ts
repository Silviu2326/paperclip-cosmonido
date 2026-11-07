import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callConversationTool, conversationTextPolicy, conversationToolDefinitions } from "./message-tools.js";

const companyId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const messageId = "00000000-0000-4000-8000-000000000003";
const fetchMock = vi.fn();
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
const thread = (channel = "whatsapp", lastInboundAt: string | null = new Date().toISOString()) => ({ id: conversationId, companyId, channel, lastInboundAt, messages: [{ id: messageId, body: "Hola" }] });
const call = (name: string, args: Record<string, unknown>) => callConversationTool({ name, arguments: args, companyId, apiUrl: "http://localhost:3100/api/", token: "agent-token" });

describe("agent customer messaging tools", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it("returns window state and recent history through the authenticated API", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread()));
    const result = await call("conversation_get", { conversationId });
    expect(result).toMatchObject({ messages: [{ id: messageId }], messagingWindow: { freeReplyAllowed: true } });
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:3100/api/conversations/${conversationId}`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer agent-token");
  });

  it("supports bounded backwards history pagination", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread())).mockResolvedValueOnce(ok({ items: [], nextCursor: null }));
    const result = await call("conversation_get", { conversationId, before: messageId, limit: 10 });
    expect(result).toMatchObject({ items: [], messagingWindow: { freeReplyAllowed: true } });
    expect(fetchMock.mock.calls[1][0]).toContain(`before=${messageId}&limit=10`);
  });

  it.each(["message_reply", "message_send"])("blocks closed WhatsApp before drafting or sending with %s", async (name) => {
    fetchMock.mockResolvedValue(ok(thread("whatsapp", null)));
    await expect(call(name, { conversationId, body: "Hola" })).rejects.toMatchObject({ message: expect.stringContaining("plantilla aprobada"), details: { messagingWindow: { requiresTemplate: true } } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("permits a draft for human review outside the window", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread("whatsapp", null))).mockResolvedValueOnce(ok({ id: messageId, conversationId, body: "Hola" }));
    expect(await call("message_draft", { conversationId, body: "Hola" })).toMatchObject({ id: messageId, messagingWindow: { freeReplyAllowed: false } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized messages without creating a draft", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread()));
    await expect(call("message_reply", { conversationId, body: "a".repeat(4097) })).rejects.toThrow(/4097\/4096/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects SMS exceeding ten segments, including extension-character packing", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread("sms")));
    await expect(call("message_reply", { conversationId, body: "^".repeat(765) })).rejects.toThrow(/11 segmentos SMS/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses an explicit idempotency key and preserves the send gate result", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread())).mockResolvedValueOnce(ok({ id: messageId, conversationId, body: "Hola" })).mockResolvedValueOnce(ok({ message: { id: messageId, deliveryStatus: "draft" }, mode: "draft_only" }));
    expect(await call("message_reply", { conversationId, body: "Hola", idempotencyKey: "reply-turn-1" })).toMatchObject({ mode: "draft_only", message: { deliveryStatus: "draft" }, messagingWindow: { freeReplyAllowed: true } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ body: "Hola", idempotencyKey: "reply-turn-1" });
    expect(fetchMock.mock.calls[2][0]).toContain(`/messages/${messageId}/send`);
  });

  it("generates a stable key for retries of the same inbound turn", async () => {
    const conversation = thread();
    for (let i = 0; i < 2; i++) fetchMock.mockResolvedValueOnce(ok(conversation)).mockResolvedValueOnce(ok({ id: messageId, conversationId, body: "Hola" })).mockResolvedValueOnce(ok({ message: { id: messageId } }));
    await call("message_reply", { conversationId, body: "Hola" });
    await call("message_reply", { conversationId, body: "Hola" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).idempotencyKey).toBe(JSON.parse(fetchMock.mock.calls[4][1].body).idempotencyKey);
  });

  it.each(["sent", "queued", "uncertain"])("does not resend an identical %s reply from the current turn", async (deliveryStatus) => {
    fetchMock.mockResolvedValueOnce(ok({ ...thread(), messages: [{ id: messageId, direction: "outbound", body: "Hola", deliveryStatus, createdAt: new Date(Date.now() + 1000).toISOString() }] }));
    expect(await call("message_reply", { conversationId, body: "Hola" })).toMatchObject({ reused: true, message: { id: messageId, deliveryStatus }, action: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send a different draft returned for a reused idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread())).mockResolvedValueOnce(ok({ id: messageId, conversationId, body: "Different message" }));
    await expect(call("message_reply", { conversationId, body: "Hola", idempotencyKey: "same-key" })).rejects.toThrow(/idempotencia/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks a stored draft's thread and text before sending", async () => {
    fetchMock.mockResolvedValueOnce(ok(thread())).mockResolvedValueOnce(ok({ message: { id: messageId } }));
    expect(await call("message_send", { conversationId, messageId })).toMatchObject({ messagingWindow: { freeReplyAllowed: true } });
    fetchMock.mockReset().mockResolvedValueOnce(ok({ ...thread(), messages: [] }));
    await expect(call("message_send", { conversationId, messageId })).rejects.toThrow(/borrador/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains the conversationId required to safely send an existing draft", async () => {
    await expect(call("message_send", { messageId })).rejects.toThrow(/Incluye conversationId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["waiting_them", "closed"])("uses the existing state contract for %s", async (status) => {
    fetchMock.mockResolvedValueOnce(ok(thread())).mockResolvedValueOnce(ok({ status }));
    expect(await call("conversation_set_state", { conversationId, status })).toMatchObject({ status, messagingWindow: { freeReplyAllowed: true } });
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
  });

  it("rejects cross-company data before any mutation and surfaces API failures", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...thread(), companyId: "other" }));
    await expect(call("message_reply", { conversationId, body: "Hola" })).rejects.toThrow(/company/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    await expect(call("conversation_get", { conversationId })).rejects.toThrow("Forbidden");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("publishes the additional arguments in tool definitions", () => {
    expect(JSON.stringify(conversationToolDefinitions())).toContain("idempotencyKey");
    expect(JSON.stringify(conversationToolDefinitions())).toContain("limit");
  });
});

describe("channel text policies", () => {
  it.each([["whatsapp", 4096], ["telegram", 4096], ["messenger", 2000], ["instagram", 1000]])("sets %s's free-text limit", (channel, maxLength) => {
    expect(conversationTextPolicy(String(channel), "Hola").maxLength).toBe(maxLength);
  });
  it("counts SMS GSM extension characters and Unicode segmentation", () => {
    expect(conversationTextPolicy("sms", "a".repeat(160))).toMatchObject({ segments: 1, length: 160 });
    expect(conversationTextPolicy("sms", "a".repeat(161))).toMatchObject({ segments: 2 });
    expect(conversationTextPolicy("sms", "^".repeat(81))).toMatchObject({ segments: 2, length: 162 });
    expect(conversationTextPolicy("sms", "🙂".repeat(36))).toMatchObject({ segments: 2, length: 72, maxLength: 670 });
    expect(conversationTextPolicy("sms", "^".repeat(765)).segments).toBe(11);
    expect(conversationTextPolicy("sms", "🙂".repeat(335)).segments).toBe(11);
  });
});
