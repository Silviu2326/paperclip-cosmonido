import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  agents,
  autonomyPolicies,
  companies,
  companyMemberships,
  conversationMessages,
  conversations,
  createDb,
  externalActions,
  leads,
  principalPermissionGrants,
  type Db,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { recordInboundMessage } from "./inbound.js";
import { conversationService } from "./conversations.js";
import { conversationMessageService, registerConversationTransport } from "./messages.js";
import { ExternalActionUncertainError } from "../external-action-gate.js";
import type { ConversationTransport, OutboundMessage } from "./transports/types.js";

const embedded = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embedded.supported ? describe : describe.skip;
if (!embedded.supported) {
  console.warn(`Skipping conversation tests on this host: ${embedded.reason ?? "unsupported environment"}`);
}

describeEmbeddedPostgres("conversation inbox", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const send = vi.fn<(m: OutboundMessage) => Promise<{ status: "sent"; providerMessageId: string }>>();
  const reconcile = vi.fn<() => Promise<{ status: "sent"; providerMessageId: string }>>();
  const fakeTransport: ConversationTransport = {
    provider: "fake",
    channels: ["webchat"],
    send: async (m) => send(m),
    reconcile: async () => reconcile(),
  };

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-conversations-");
    db = createDb(tempDb.connectionString);
    registerConversationTransport(fakeTransport);
  }, 300_000);

  afterEach(async () => {
    send.mockReset();
    reconcile.mockReset();
    await db.delete(activityLog);
    await db.delete(externalActions);
    await db.delete(conversationMessages);
    await db.delete(conversations);
    await db.delete(leads);
    await db.delete(autonomyPolicies);
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function setup(grants: string[] = ["channels:message"]) {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    const agentId = randomUUID();
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Sales",
      role: "sales",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
    });
    // Company grants for the agent (A1 creates these for real agents). Default: messages on.
    await db.insert(companyMemberships).values({ companyId, principalType: "agent", principalId: agentId, status: "active", membershipRole: "member" });
    for (const permissionKey of grants) {
      await db.insert(principalPermissionGrants).values({ companyId, principalType: "agent", principalId: agentId, permissionKey });
    }
    return { companyId, agentId };
  }

  function inbound(companyId: string, externalMessageId: string, thread = "thread-1") {
    return recordInboundMessage(db, companyId, {
      channel: "webchat",
      externalThreadId: thread,
      externalMessageId,
      from: { email: "Ana@Example.com" },
      body: "Hola, quiero un presupuesto",
    });
  }

  it("pages through more than 100 conversations without a phantom final page", async () => {
    const { companyId } = await setup();
    await db.insert(conversations).values(Array.from({ length: 125 }, (_, index) => ({
      companyId, channel: "webchat", subject: `Conversation ${index}`,
      lastMessageAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    })));
    const service = conversationService(db);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(companyId, { limit: 25, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(125);
    expect(new Set(ids).size).toBe(125);
  });

  it("opens the newest messages and reads all older history, including tied timestamps", async () => {
    const { companyId } = await setup();
    const [conversation] = await db.insert(conversations).values({ companyId, channel: "webchat" }).returning();
    const rows = Array.from({ length: 550 }, (_, index) => ({
      id: randomUUID(), companyId, conversationId: conversation!.id,
      direction: "inbound", actorKind: "contact", body: `Message ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, Math.floor(index / 3))),
    }));
    await db.insert(conversationMessages).values(rows);
    const service = conversationService(db);
    const first = await service.messagePage(companyId, conversation!.id, { limit: 50 });
    expect(first.items.some((item) => item.body === "Message 549")).toBe(true);
    // Arriving messages must not shift any of the older-page boundaries.
    await db.insert(conversationMessages).values({
      companyId, conversationId: conversation!.id, direction: "inbound", actorKind: "contact", body: "New arrival",
      createdAt: new Date(Date.UTC(2026, 1, 1)),
    });
    let items = first.items;
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await service.messagePage(companyId, conversation!.id, { limit: 50, before: cursor });
      items = [...page.items, ...items];
      cursor = page.nextCursor;
    }
    expect(items).toHaveLength(550);
    expect(new Set(items.map((item) => item.id)).size).toBe(550);
    const expected = rows.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    expect(items.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    const [other] = await db.insert(conversations).values({ companyId, channel: "webchat" }).returning();
    await expect(service.messagePage(companyId, other!.id, { limit: 50, before: items[0]!.id })).rejects.toThrow("Invalid message cursor");
    expect((await service.messagePage(randomUUID(), conversation!.id, { limit: 50 })).items).toEqual([]);
  });

  it("records an inbound message once per (provider, provider message id)", async () => {
    const { companyId } = await setup();
    const first = await inbound(companyId, "msg-1");
    const second = await inbound(companyId, "msg-1");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.message.id).toBe(first.message.id);
    expect(await db.select().from(conversationMessages)).toHaveLength(1);
    expect(await db.select().from(conversations)).toHaveLength(1);
    expect(first.conversation.status).toBe("waiting_us");
    expect(first.conversation.slaDueAt).not.toBeNull();
  });

  it("keeps one conversation per thread and the earliest pending deadline", async () => {
    const { companyId } = await setup();
    const a = await inbound(companyId, "msg-1");
    const b = await inbound(companyId, "msg-2");

    expect(b.conversation.id).toBe(a.conversation.id);
    expect(b.conversation.slaDueAt).toBe(a.conversation.slaDueAt);
    expect(b.conversation.lastInboundAt).not.toBeNull();
  });

  it("creates a lead for a thread with no customer", async () => {
    const { companyId } = await setup();
    const result = await inbound(companyId, "msg-1");
    expect(result.conversation.leadId).not.toBeNull();
    const rows = await db.select().from(leads).where(eq(leads.companyId, companyId));
    expect(rows).toHaveLength(1);
  });

  it("does not send a draft for an agent at draft_only (the default level)", async () => {
    const { companyId, agentId } = await setup();
    const { conversation } = await inbound(companyId, "msg-1");
    const svc = conversationMessageService(db);
    const draft = await svc.draft(companyId, conversation.id, { body: "Respuesta", attachments: [], idempotencyKey: "k-1" }, { agentId });

    const outcome = await svc.send(companyId, draft.id, { agentId });

    expect(outcome.mode).toBe("draft");
    expect(outcome.message.deliveryStatus).toBe("draft");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses to send from an agent without the channels:message grant, even with send_direct", async () => {
    const { companyId, agentId } = await setup([]);
    await db.insert(autonomyPolicies).values({ companyId, agentId, actionType: "message", level: "send_direct" });
    const { conversation } = await inbound(companyId, "msg-1");
    const svc = conversationMessageService(db);
    const draft = await svc.draft(companyId, conversation.id, { body: "Respuesta", attachments: [], idempotencyKey: "k-1" }, { agentId });

    await expect(svc.send(companyId, draft.id, { agentId })).rejects.toMatchObject({
      status: 403,
      details: { code: "agent_capability_disabled" },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends directly for an agent with a send_direct policy", async () => {
    const { companyId, agentId } = await setup();
    await db.insert(autonomyPolicies).values({ companyId, agentId, actionType: "message", level: "send_direct" });
    send.mockResolvedValueOnce({ status: "sent", providerMessageId: "prov-1" });
    const { conversation } = await inbound(companyId, "msg-1");
    const svc = conversationMessageService(db);
    const draft = await svc.draft(companyId, conversation.id, { body: "Respuesta", attachments: [], idempotencyKey: "k-1" }, { agentId });

    const outcome = await svc.send(companyId, draft.id, { agentId });

    expect(outcome.mode).toBe("direct");
    expect(outcome.message.deliveryStatus).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never resends an uncertain message; only reconcile settles it", async () => {
    const { companyId } = await setup();
    const { conversation } = await inbound(companyId, "msg-1");
    const svc = conversationMessageService(db);
    const draft = await svc.draft(companyId, conversation.id, { body: "Respuesta", attachments: [], idempotencyKey: "k-1" }, {
      userId: "board-user",
    });
    send.mockRejectedValueOnce(new ExternalActionUncertainError("timeout after request left"));

    const first = await svc.send(companyId, draft.id, { userId: "board-user" });
    expect(first.message.deliveryStatus).toBe("uncertain");
    expect(first.action?.status).toBe("uncertain");

    await expect(svc.send(companyId, draft.id, { userId: "board-user" })).rejects.toMatchObject({ status: 409 });
    expect(send).toHaveBeenCalledTimes(1);

    reconcile.mockResolvedValueOnce({ status: "sent", providerMessageId: "prov-7" });
    const settled = await svc.reconcile(companyId, draft.id, { userId: "board-user" });
    expect(settled.deliveryStatus).toBe("sent");
    expect(settled.providerMessageId).toBe("prov-7");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses manual settlement from an agent", async () => {
    const { companyId, agentId } = await setup();
    const { conversation } = await inbound(companyId, "msg-1");
    const svc = conversationMessageService(db);
    const draft = await svc.draft(companyId, conversation.id, { body: "x", attachments: [], idempotencyKey: "k-2" }, { agentId });
    send.mockRejectedValueOnce(new ExternalActionUncertainError("unknown"));
    await db.insert(autonomyPolicies).values({ companyId, agentId, actionType: "message", level: "send_direct" });
    await svc.send(companyId, draft.id, { agentId });

    await expect(
      svc.reconcile(companyId, draft.id, { agentId }, { outcome: "failed" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
