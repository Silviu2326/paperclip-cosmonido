import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { conversationRoutes } from "./conversations.js";

const service = vi.hoisted(() => ({
  findById: vi.fn(), getById: vi.fn(), messagePage: vi.fn(), list: vi.fn(), create: vi.fn(),
  setState: vi.fn(), assign: vi.fn(), link: vi.fn(),
}));
const messages = vi.hoisted(() => ({ findMessage: vi.fn(), draft: vi.fn(), send: vi.fn(), reconcile: vi.fn() }));
vi.mock("../services/conversations/conversations.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/conversations/conversations.js")>(),
  conversationService: () => service,
}));
vi.mock("../services/conversations/messages.js", () => ({ conversationMessageService: () => messages, registerConversationTransport: vi.fn() }));
vi.mock("../services/conversations/agent-dispatch.js", () => ({ conversationAgentDispatchService: () => ({}) }));
vi.mock("../services/conversations/transports/email.js", () => ({ projectEmailConversations: vi.fn(), emailTransportService: vi.fn() }));

const id = "00000000-0000-4000-8000-000000000001";
const cursor = "00000000-0000-4000-8000-000000000002";
function app(companyId = "company-a", agent = false) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = (agent
      ? { type: "agent", source: "agent_key", agentId: id, companyId }
      : { type: "board", source: "session", userId: "user-a", companyIds: [companyId] }) as Express.Request["actor"];
    next();
  });
  app.use(conversationRoutes({} as Db));
  app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  return app;
}
beforeEach(() => {
  vi.clearAllMocks();
  service.findById.mockResolvedValue({ id, companyId: "company-a" });
  service.getById.mockResolvedValue({ id, companyId: "company-a", subject: "Thread" });
  service.messagePage.mockResolvedValue({ items: [{ id: "latest-message" }], nextCursor: cursor });
  messages.findMessage.mockResolvedValue({ id, companyId: "company-a" });
});

it("returns the newest page and its history cursor in conversation detail", async () => {
  const response = await request(app()).get(`/conversations/${id}`);
  expect(response.status).toBe(200);
  expect(response.body.messages).toEqual([{ id: "latest-message" }]);
  expect(response.body.nextMessageCursor).toBe(cursor);
  expect(service.messagePage).toHaveBeenCalledWith("company-a", id, { limit: 50 });
});

it("validates and forwards an older-page request after the normal access gate", async () => {
  const response = await request(app()).get(`/conversations/${id}/messages?before=${cursor}&limit=100`);
  expect(response.status).toBe(200);
  expect(response.body.nextCursor).toBe(cursor);
  expect(service.messagePage).toHaveBeenCalledWith("company-a", id, { before: cursor, limit: 100 });
});

it.each(["before=not-a-uuid", "limit=501", "limit=0"])("rejects invalid history requests: %s", async (query) => {
  expect((await request(app()).get(`/conversations/${id}/messages?${query}`)).status).toBe(400);
  expect(service.messagePage).not.toHaveBeenCalled();
});

it("does not expose history or cursor validation across company boundaries", async () => {
  expect((await request(app("company-b")).get(`/conversations/${id}/messages?before=not-a-uuid`)).status).toBe(404);
  expect(service.messagePage).not.toHaveBeenCalled();
});

it.each([false, true])("denies every conversation mutation and message send across companies (agent=%s)", async (agent) => {
  const client = request(app("company-b", agent));
  const responses = await Promise.all([
    client.get(`/conversations/${id}`),
    client.post(`/conversations/${id}/messages`).send({ body: "Reply", idempotencyKey: "reply-1" }),
    client.patch(`/conversations/${id}/state`).send({ status: "closed" }),
    client.post(`/conversations/${id}/assign`).send({ assignedAgentId: id }),
    client.post(`/conversations/${id}/link`).send({ leadId: id }),
    client.post(`/messages/${id}/send`),
    client.post(`/messages/${id}/reconcile`).send({ outcome: "sent" }),
  ]);
  expect(responses.map((response) => response.status)).toEqual(Array(7).fill(404));
  for (const method of [service.getById, service.messagePage, service.setState, service.assign, service.link, messages.draft, messages.send, messages.reconcile]) {
    expect(method).not.toHaveBeenCalled();
  }
});

it("rejects malformed path ids before querying PostgreSQL", async () => {
  expect((await request(app()).get("/conversations/not-a-uuid")).status).toBe(400);
  expect((await request(app()).post("/messages/not-a-uuid/send")).status).toBe(400);
  expect((await request(app()).get("/companies/not-a-uuid/conversations")).status).toBe(400);
  expect(service.findById).not.toHaveBeenCalled();
  expect(messages.findMessage).not.toHaveBeenCalled();
});

it.each(["limit=0", "limit=101", "cursor=malformed", "channel=unknown"])("validates conversation list input: %s", async (query) => {
  expect((await request(app(id)).get(`/companies/${id}/conversations?${query}`)).status).toBe(400);
  expect(service.list).not.toHaveBeenCalled();
});

it("keeps company collection reads and creation behind the company access gate", async () => {
  expect((await request(app("other")).get(`/companies/${id}/conversations`)).status).toBe(403);
  expect((await request(app("other")).post(`/companies/${id}/conversations`).send({ channel: "whatsapp" })).status).toBe(403);
  expect(service.list).not.toHaveBeenCalled();
  expect(service.create).not.toHaveBeenCalled();
});

it("exposes the response window and per-message delivery failure receipt", async () => {
  service.getById.mockResolvedValue({ id, companyId: "company-a", lastInboundAt: "2026-11-06T10:00:00.000Z" });
  service.messagePage.mockResolvedValue({ items: [{ id: cursor, deliveryStatus: "failed", providerReceipt: { error: "Recipient unavailable" } }], nextCursor: null });
  const response = await request(app()).get(`/conversations/${id}`);
  expect(response.body.lastInboundAt).toBe("2026-11-06T10:00:00.000Z");
  expect(response.body.messages[0]).toMatchObject({ deliveryStatus: "failed", providerReceipt: { error: "Recipient unavailable" } });
});
