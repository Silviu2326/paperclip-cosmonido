import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { conversationRoutes } from "./conversations.js";

const service = vi.hoisted(() => ({ findById: vi.fn(), getById: vi.fn(), messagePage: vi.fn() }));
vi.mock("../services/conversations/conversations.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/conversations/conversations.js")>(),
  conversationService: () => service,
}));
vi.mock("../services/conversations/messages.js", () => ({ conversationMessageService: () => ({}), registerConversationTransport: vi.fn() }));
vi.mock("../services/conversations/agent-dispatch.js", () => ({ conversationAgentDispatchService: () => ({}) }));
vi.mock("../services/conversations/transports/email.js", () => ({ projectEmailConversations: vi.fn(), emailTransportService: vi.fn() }));

const id = "00000000-0000-4000-8000-000000000001";
const cursor = "00000000-0000-4000-8000-000000000002";
function app(companyId = "company-a") {
  const app = express();
  app.use((req, _res, next) => {
    req.actor = { type: "board", source: "session", userId: "user-a", companyIds: [companyId] } as Express.Request["actor"];
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
