import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { companies, contacts, conversationMessages, conversations, createDb, leads, type Db } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import { recordInboundMessage } from "./inbound.js";
import { conversationListQuerySchema, conversationService } from "./conversations.js";
import { applyProviderDeliveryStatus } from "./transports/delivery-status.js";

const embedded = await getEmbeddedPostgresTestSupport();
const describeDatabase = embedded.supported ? describe : describe.skip;
if (!embedded.supported) console.warn(`Skipping reliability database tests: ${embedded.reason}`);

describeDatabase("conversation reliability against PostgreSQL", () => {
  let db: Db;
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-conversation-reliability-");
    db = createDb(database.connectionString);
  }, 300_000);
  afterAll(async () => { await database?.cleanup(); });

  async function company() {
    const id = randomUUID();
    await db.insert(companies).values({ id, name: "Reliability", issuePrefix: `R${id.replace(/-/g, "").slice(0, 6).toUpperCase()}` });
    return id;
  }
  function inbound(companyId: string, messageId: string, options: {
    thread?: string; provider?: string; phone?: string; at?: string; channel?: "whatsapp" | "sms";
  } = {}) {
    return recordInboundMessage(db, companyId, {
      channel: options.channel ?? "whatsapp", provider: options.provider ?? "meta",
      externalThreadId: options.thread ?? "thread", externalMessageId: messageId,
      from: { phone: options.phone ?? "34611222333" }, body: messageId,
      occurredAt: new Date(options.at ?? "2026-11-06T10:00:00Z"),
    });
  }

  it("deduplicates concurrent retries and a provider change by company/channel/message", async () => {
    const companyId = await company();
    const results = await Promise.all(Array.from({ length: 5 }, () => inbound(companyId, "retry")));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    const retry = await inbound(companyId, "retry", { provider: "kapso", thread: "changed-provider-thread" });
    expect(retry.created).toBe(false);
    expect(retry.conversation.id).toBe(results[0]!.conversation.id);
    expect(await db.select().from(conversations).where(eq(conversations.companyId, companyId))).toHaveLength(1);
    expect(await db.select().from(leads).where(eq(leads.companyId, companyId))).toHaveLength(1);
    expect((await inbound(await company(), "retry")).created).toBe(true);
  });

  it("resolves simultaneous threads and channel phone formats to one contact", async () => {
    const companyId = await company();
    const results = await Promise.all([
      inbound(companyId, "wa", { thread: "wa", phone: "34611222333" }),
      inbound(companyId, "sms", { thread: "sms", phone: "+34 (611) 222-333", channel: "sms", provider: "twilio" }),
    ]);
    expect(results.every((result) => result.created)).toBe(true);
    const people = await db.select().from(contacts).where(eq(contacts.companyId, companyId));
    expect(people).toHaveLength(1);
    expect(people[0]!.primaryPhone).toBe("+34611222333");
    const intake = await db.select().from(leads).where(eq(leads.companyId, companyId));
    expect(intake).toHaveLength(2); // Each thread has its own lead; both share the contact.
    expect(new Set(intake.map((lead) => lead.contactId))).toEqual(new Set([people[0]!.id]));
    expect(new Set(results.map((result) => result.conversation.contactId))).toEqual(new Set([people[0]!.id]));
  });

  it("reports existing provider-index collisions clearly without creating a ghost thread", async () => {
    const companyId = await company();
    await inbound(companyId, "provider-collision");
    await expect(inbound(companyId, "provider-collision", { channel: "sms", thread: "other-channel" }))
      .rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(conversations).where(eq(conversations.companyId, companyId))).toHaveLength(1);
  });

  it("orders history by occurredAt and keeps the earliest unanswered SLA", async () => {
    const companyId = await company();
    const newest = await inbound(companyId, "new", { at: "2026-11-06T10:00:00Z" });
    const oldest = await inbound(companyId, "old", { at: "2026-11-06T09:00:00Z" });
    expect(oldest.conversation.lastInboundAt).toBe("2026-11-06T10:00:00.000Z");
    expect(oldest.conversation.lastMessageAt).toBe("2026-11-06T10:00:00.000Z");
    expect(oldest.conversation.slaDueAt).toBe("2026-11-06T13:00:00.000Z");
    const page = await conversationService(db).messagePage(companyId, newest.conversation.id, { limit: 50 });
    expect(page.items.map((message) => message.body)).toEqual(["old", "new"]);
    await conversationService(db).recordOutboundSent(newest.conversation.id, new Date("2026-11-06T11:00:00Z"));
    const delayed = await inbound(companyId, "delayed", { at: "2026-11-06T10:30:00Z" });
    expect(delayed.conversation.status).toBe("waiting_them");
    expect(delayed.conversation.slaDueAt).toBeNull();
    const fresh = await inbound(companyId, "fresh", { at: "2026-11-06T12:00:00Z" });
    await conversationService(db).recordOutboundSent(newest.conversation.id, new Date("2026-11-06T10:45:00Z"));
    const afterLateOutbound = await conversationService(db).getById(companyId, newest.conversation.id);
    expect(afterLateOutbound?.status).toBe("waiting_us");
    expect(afterLateOutbound?.slaDueAt).toBe(fresh.conversation.slaDueAt);
    expect(afterLateOutbound?.lastOutboundAt).toBe("2026-11-06T11:00:00.000Z");
  });

  it("rejects invalid inbound ids and timestamps before writing", async () => {
    const companyId = await company();
    await expect(inbound(companyId, " ")).rejects.toMatchObject({ status: 400 });
    await expect(inbound(companyId, "invalid-time", { at: "invalid" })).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(conversations).where(eq(conversations.companyId, companyId))).toHaveLength(0);
  });

  it("pages tied microsecond timestamps and null dates without shifting on new arrivals", async () => {
    const companyId = await company();
    await db.insert(conversations).values(Array.from({ length: 6 }, (_, i) => ({ companyId, channel: "sms", subject: String(i) })));
    await db.execute(sql`update conversations set last_message_at = '2026-11-06T10:00:00.000123Z' where company_id = ${companyId} and subject <> '5'`);
    const service = conversationService(db);
    const first = await service.list(companyId, { limit: 2 });
    expect(conversationListQuerySchema.safeParse({ cursor: first.nextCursor }).success).toBe(true);
    await db.insert(conversations).values({ companyId, channel: "sms", lastMessageAt: new Date("2026-11-07T10:00:00Z") });
    const ids = first.items.map((item) => item.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await service.list(companyId, { limit: 2, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    }
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("rejects cross-company CRM references during creation", async () => {
    const otherCompany = await company();
    const original = await inbound(otherCompany, "other");
    await expect(conversationService(db).create(await company(), {
      channel: "whatsapp", priority: "normal", leadId: original.conversation.leadId,
    }, { userId: "board" })).rejects.toMatchObject({ status: 400 });
  });

  async function outbound(status: string) {
    const companyId = await company();
    const [conversation] = await db.insert(conversations).values({ companyId, channel: "whatsapp" }).returning();
    const [message] = await db.insert(conversationMessages).values({
      companyId, conversationId: conversation!.id, direction: "outbound", actorKind: "user",
      body: "Reply", deliveryStatus: status, provider: "kapso", providerMessageId: randomUUID(),
    }).returning();
    const apply = (next: "read" | "delivered" | "sent" | "failed", receipt?: Record<string, unknown>) => applyProviderDeliveryStatus(db, {
      companyId, provider: "kapso", providerMessageId: message!.providerMessageId!, status: next, receipt,
    });
    const load = async () => (await db.select().from(conversationMessages).where(and(eq(conversationMessages.companyId, companyId), eq(conversationMessages.id, message!.id))))[0]!;
    return { apply, load };
  }

  it("keeps concurrent delivered/read callbacks monotone and idempotent", async () => {
    const { apply, load } = await outbound("sent");
    await Promise.all([apply("read"), apply("delivered"), apply("sent")]);
    expect((await load()).deliveryStatus).toBe("read");
    expect(await apply("delivered")).toBe(false);
    expect(await apply("failed", { error: "late failure" })).toBe(false);
    expect(await apply("read")).toBe(false);
  });

  it.each(["draft", "uncertain", "delivered", "read", "failed"])("rejects failed from %s", async (status) => {
    const { apply, load } = await outbound(status);
    expect(await apply("failed")).toBe(false);
    expect((await load()).deliveryStatus).toBe(status);
  });

  it.each(["queued", "sent"])("preserves the failure receipt from %s", async (status) => {
    const { apply, load } = await outbound(status);
    expect(await apply("failed", { error: "Recipient unavailable", code: "131026" })).toBe(true);
    expect((await load()).providerReceipt).toMatchObject({ error: "Recipient unavailable", code: "131026", lastStatus: "failed" });
    expect(await apply("failed", { error: "Duplicate" })).toBe(false);
    expect((await load()).providerReceipt?.error).toBe("Recipient unavailable");
  });
});

it.each(["garbage", "-1", "9999999999", Buffer.from('{"id":"invalid","at":null}').toString("base64url")])("rejects malformed conversation cursor %s", (cursor) => {
  expect(conversationListQuerySchema.safeParse({ cursor }).success).toBe(false);
});
