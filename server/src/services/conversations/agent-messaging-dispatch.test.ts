import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents, agentWakeupRequests, companies, companyMemberships, contacts,
  conversationAgentDispatches, conversationAgentDispatchSettings, conversationMessages,
  conversations, createDb, issues, type Db,
} from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import { conversationAgentDispatchService, type ConversationDispatchWakeupOptions } from "./agent-dispatch.js";
import { getConversationMessagingWindow } from "./messaging-window.js";

// These tests resume a persisted task. Task creation and billing are outside this boundary.
vi.mock("../issues.js", () => ({ issueService: () => { throw new Error("Unexpected task creation"); } }));
vi.mock("../productization/entitlements.js", () => ({ productizationEntitlementsService: () => { throw new Error("Unexpected quota reservation"); } }));

const support = await getEmbeddedPostgresTestSupport();
if (!support.supported) console.warn(`Skipping agent messaging dispatch database tests: ${support.reason}`);

(support.supported ? describe : describe.skip)("agent messaging dispatch database boundaries", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: Db;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-agent-messaging-");
    db = createDb(database.connectionString);
  }, 300_000);
  afterAll(async () => {
    await db?.$client.end({ timeout: 0 });
    await database?.cleanup();
  });

  async function fixture(count = 1) {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const responsibleUserId = randomUUID();
    const conversationId = randomUUID();
    const now = new Date();
    await db.insert(companies).values({ id: companyId, name: "Messaging", issuePrefix: `M${companyId.slice(0, 6)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Customer care", role: "sales", status: "idle", adapterType: "process" });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: responsibleUserId, status: "active", membershipRole: "member" });
    await db.insert(conversationAgentDispatchSettings).values({ companyId, agentId, responsibleUserId, enabled: true, createdByUserId: responsibleUserId });
    const [contact] = await db.insert(contacts).values({ companyId, displayName: "Ana", primaryPhone: "+34600123456", language: "es" }).returning();
    await db.insert(conversations).values({ id: conversationId, companyId, channel: "whatsapp", contactId: contact.id, lastInboundAt: now });
    const rows = [];
    for (let index = 0; index < count; index++) {
      const [message] = await db.insert(conversationMessages).values({ companyId, conversationId, direction: "inbound", actorKind: "contact", body: `Customer question ${index}`, deliveryStatus: "delivered", createdAt: new Date(now.getTime() - count + index) }).returning();
      const [dispatch] = await db.insert(conversationAgentDispatches).values({ companyId, conversationId, sourceMessageId: message.id, agentId, responsibleUserId, nextAttemptAt: new Date(now.getTime() - 1000) }).returning();
      rows.push(dispatch);
    }
    return { companyId, conversationId, agentId, responsibleUserId, now, rows };
  }

  it("claims only one source message from a thread under simultaneous workers", async () => {
    const { rows, now, companyId } = await fixture(2);
    const service = conversationAgentDispatchService(db);
    const claims = await Promise.all([service.claimNext("worker-a", now), service.claimNext("worker-b", now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(rows.map((row) => row.id)).toContain(claims.find(Boolean)!.id);
    const stored = await db.select().from(conversationAgentDispatches).where(eq(conversationAgentDispatches.companyId, companyId));
    expect(stored.filter((row) => row.status === "leased")).toHaveLength(1);
    // Leave this isolated fixture terminal, so subsequent tests have no outstanding work.
    await db.update(conversationAgentDispatches).set({ status: "skipped" }).where(eq(conversationAgentDispatches.companyId, companyId));
  });

  it("defers a second wake while the first task is active, including after its lease expires", async () => {
    const { rows, companyId, agentId, now } = await fixture(2);
    const [task] = await db.insert(issues).values({ companyId, title: "Reply", status: "in_progress", assigneeAgentId: agentId }).returning();
    await db.update(conversationAgentDispatches).set({ status: "leased", issueId: task.id, leaseOwner: "old-worker", leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() - 1), nextAttemptAt: new Date(now.getTime() + 1000) }).where(eq(conversationAgentDispatches.id, rows[0].id));
    expect(await conversationAgentDispatchService(db).claimNext("second-worker", now)).toBeNull();
    await db.update(conversationAgentDispatches).set({ status: "skipped" }).where(eq(conversationAgentDispatches.companyId, companyId));
  });

  it("includes WhatsApp contact, window, recent history and guidance in the durable wake context", async () => {
    const { rows, companyId, conversationId, agentId, now } = await fixture();
    const [task] = await db.insert(issues).values({ companyId, title: "Reply", status: "todo", assigneeAgentId: agentId }).returning();
    await db.update(conversationAgentDispatches).set({ issueId: task.id }).where(eq(conversationAgentDispatches.id, rows[0].id));
    const wake = vi.fn(async (_agent: string, options: ConversationDispatchWakeupOptions) => {
      const [receipt] = await db.insert(agentWakeupRequests).values({ companyId, agentId, source: options.source, status: "queued", idempotencyKey: options.idempotencyKey }).returning();
      return { id: receipt.id };
    });
    expect(await conversationAgentDispatchService(db).processNext("worker", wake, now)).toMatchObject({ outcome: "wake_queued" });
    expect(wake).toHaveBeenCalledTimes(1);
    const context = wake.mock.calls[0][1].contextSnapshot;
    expect(context).toMatchObject({ channel: "whatsapp", contact: { name: "Ana", phone: "+34600123456" }, replyLanguage: "es", messagingWindow: { freeReplyAllowed: true }, recentMessages: [{ body: "Customer question 0" }] });
    expect(context.communicationGuidance).toContain("one question per message");
    expect(await getConversationMessagingWindow(db, companyId, conversationId, now)).toMatchObject({ freeReplyAllowed: true });
    await expect(getConversationMessagingWindow(db, randomUUID(), conversationId, now)).rejects.toThrow("Conversation not found");
    expect(await conversationAgentDispatchService(db).processNext("retry", wake, now)).toMatchObject({ outcome: "idle" });
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("skips an inbound turn already answered while a prior wake was running", async () => {
    const { companyId, conversationId, now } = await fixture();
    await db.update(conversations).set({ lastOutboundAt: now }).where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)));
    const wake = vi.fn();
    expect(await conversationAgentDispatchService(db).processNext("worker", wake, now)).toMatchObject({ outcome: "skipped" });
    expect(wake).not.toHaveBeenCalled();
  });
});
