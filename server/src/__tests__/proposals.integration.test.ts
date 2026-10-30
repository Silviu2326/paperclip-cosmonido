import { randomUUID, createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agents, companies, createDb, customers, documents, proposals } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { proposalService, type ProposalServiceDeps } from "../services/proposals.js";
import { proposalRoutes, publicProposalRoutes } from "../routes/proposals.js";
import { errorHandler } from "../middleware/index.js";
import { leadIntakeService } from "../services/leads/intake.js";
import { leadService } from "../services/leads/leads.js";
import { opportunityService } from "../services/crm/opportunities.js";
import { opportunityForecastService } from "../services/crm/opportunity-forecast.js";
import { crmActivityService } from "../services/crm/activities.js";
import { commitmentService } from "../services/crm/commitments.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

const WEBHOOK_SECRET = "whsec_integration";

describePg("proposal service and routes (embedded postgres)", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-proposals-");
    db = createDb(tempDb.connectionString);
  }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `PR${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }
  function service(deps: ProposalServiceDeps = {}) {
    return proposalService(db, { publicBaseUrl: "http://localhost:3100", ...deps });
  }
  function draftInput(key = randomUUID(), overrides: Record<string, unknown> = {}) {
    return {
      title: "Implantación CRM",
      scope: [{ title: "Configuración", quantity: 1, unitPriceCents: 150000 }],
      terms: "Pago a 30 días",
      priceCents: 150000,
      depositCents: null,
      currency: "EUR",
      validUntil: null,
      idempotencyKey: key,
      ...overrides,
    } as Parameters<ReturnType<typeof proposalService>["createFromOpportunity"]>[1];
  }
  function tokenOf(row: { publicToken: string | null }) {
    return row.publicToken!;
  }

  it("creates a draft with a rendered document and is idempotent on the key", async () => {
    const c = await company("Idempotent");
    const a = await agent(c.id, "Seller");
    const key = randomUUID();
    const svc = service();
    const [first, again] = await Promise.all([
      svc.createFromOpportunity(c.id, draftInput(key), { agentId: a.id }),
      svc.createFromOpportunity(c.id, draftInput(key), { agentId: a.id }),
    ]);
    expect(again.id).toBe(first.id);
    expect(first.status).toBe("draft");
    expect(first.revision).toBe(1);
    expect(first.proposalKey).toBe(key);
    expect(first.documentId).toBeTruthy();
    const [doc] = await db.select().from(documents).where(eq(documents.id, first.documentId!));
    expect(doc.latestBody).toContain("Implantación CRM");
    expect(doc.latestBody).toContain("Precio total:");
    expect(doc.latestBody).toContain("Pago a 30 días");
    expect(await db.select().from(proposals).where(and(eq(proposals.companyId, c.id), eq(proposals.proposalKey, key)))).toHaveLength(1);
  });

  it("revising a sent proposal creates revision 2 and leaves revision 1 untouched", async () => {
    const c = await company("Revise");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    expect(sent.status).toBe("sent");

    const revised = await svc.revise(sent.id, { priceCents: 120000, title: "Implantación CRM v2" }, { agentId: a.id });
    expect(revised.revision).toBe(2);
    expect(revised.status).toBe("draft");
    expect(revised.publicToken).not.toBe(sent.publicToken);
    expect(revised.priceCents).toBe(120000);
    expect(revised.scope).toEqual(sent.scope);

    const [firstRow] = await db.select().from(proposals).where(eq(proposals.id, sent.id));
    expect(firstRow.revision).toBe(1);
    expect(firstRow.status).toBe("sent");
    expect(firstRow.priceCents).toBe(150000);
    expect(firstRow.title).toBe("Implantación CRM");

    const history = await svc.listRevisions(c.id, sent.proposalKey);
    expect(history.map((row) => row.revision)).toEqual([1, 2]);

    // Sending the new revision expires the previous sent one; its own content is still unchanged.
    const second = await svc.send(revised.id, { via: "link" }, { agentId: a.id });
    expect(second.expiredProposalIds).toEqual([sent.id]);
    const [expired] = await db.select().from(proposals).where(eq(proposals.id, sent.id));
    expect(expired.status).toBe("expired");
    expect(expired.priceCents).toBe(150000);
  });

  it("refuses to revise a draft that is not the latest revision, and accepted proposals", async () => {
    const c = await company("Latest");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    const revised = await svc.revise(sent.id, { priceCents: 1 }, { agentId: a.id });
    await expect(svc.revise(sent.id, { priceCents: 2 }, { agentId: a.id })).rejects.toMatchObject({ status: 409 });
    await svc.send(revised.id, { via: "link" }, { agentId: a.id });
    await svc.accept(tokenOf(revised), { name: "Ana", email: "ana@example.com", revision: 2 }, { ip: "127.0.0.1", userAgent: "vitest" });
    await expect(svc.revise(revised.id, { priceCents: 3 }, { agentId: a.id })).rejects.toMatchObject({ status: 409 });
  });

  it("accepting a revision different from the one sent answers 409", async () => {
    const c = await company("Mismatch");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    await svc.revise(sent.id, { priceCents: 1 }, { agentId: a.id });
    await expect(svc.accept(tokenOf(sent), { name: "Ana", email: "ana@example.com", revision: 2 }, {})).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(proposals).where(eq(proposals.id, sent.id));
    expect(row.status).toBe("sent");
    expect(row.acceptanceEvidence).toBeNull();
  });

  it("accepting the sent revision stores evidence; acceptance does not mark the deposit paid", async () => {
    const c = await company("Accept");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(randomUUID(), { depositCents: 50000 }), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    const accepted = await svc.accept(tokenOf(sent), { name: "Ana Ruiz", email: "ana@example.com", revision: 1 }, { ip: "203.0.113.5", userAgent: "UA-test" });
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptanceEvidence).toMatchObject({ name: "Ana Ruiz", email: "ana@example.com", ip: "203.0.113.5", userAgent: "UA-test", revision: 1 });
    expect(accepted.acceptedAt).toBeTruthy();
    expect(accepted.paymentStatus).not.toBe("paid");
    await expect(svc.accept(tokenOf(sent), { name: "Ana", email: "ana@example.com", revision: 1 }, {})).rejects.toMatchObject({ status: 409 });
  });

  it("a proposal past its validity answers 410 to signers", async () => {
    const c = await company("Validity");
    const a = await agent(c.id, "Seller");
    const future = new Date(Date.now() + 60_000);
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(randomUUID(), { validUntil: future }), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    const later = service({ now: () => new Date(future.getTime() + 1000) });
    await expect(later.accept(tokenOf(sent), { name: "Ana", email: "ana@example.com", revision: 1 }, {})).rejects.toMatchObject({ status: 410 });
    const expired = await service().expireDue(new Date(future.getTime() + 1000));
    expect(expired.map((row) => row.id)).toContain(sent.id);
  });

  it("sending with a deposit creates a payment link when the company has the Stripe key, otherwise explains why", async () => {
    const c = await company("Deposit");
    const a = await agent(c.id, "Seller");
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      const body = String(url).endsWith("/v1/prices") ? { id: "price_1" } : { id: "plink_1", url: "https://buy.stripe.test/plink_1" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const withKey = service({ resolveSecret: async (_companyId, key) => (key === "STRIPE_SECRET_KEY" ? "sk_test_x" : null), fetch: fakeFetch });
    const draft = await withKey.createFromOpportunity(c.id, draftInput(randomUUID(), { depositCents: 50000 }), { agentId: a.id });
    const sent = await withKey.send(draft.id, { via: "link" }, { agentId: a.id });
    expect(sent.proposal.paymentStatus).toBe("link_created");
    expect(sent.proposal.stripePaymentLinkUrl).toBe("https://buy.stripe.test/plink_1");
    expect(sent.paymentUnavailableReason).toBeNull();
    expect(calls).toHaveLength(2);

    const noKey = service({ resolveSecret: async () => null, fetch: fakeFetch });
    const draft2 = await noKey.createFromOpportunity(c.id, draftInput(randomUUID(), { depositCents: 50000 }), { agentId: a.id });
    const sentNoKey = await noKey.send(draft2.id, { via: "link" }, { agentId: a.id });
    expect(sentNoKey.proposal.status).toBe("sent");
    expect(sentNoKey.proposal.paymentStatus).toBe("none");
    expect(sentNoKey.paymentUnavailableReason).toContain("STRIPE_SECRET_KEY");
    expect(calls).toHaveLength(2);
  });

  it("via message without a message channel is refused and the proposal stays a draft", async () => {
    const c = await company("Message");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    await expect(svc.send(draft.id, { via: "message" }, { agentId: a.id })).rejects.toMatchObject({ status: 422 });
    expect((await svc.getById(draft.id))?.status).toBe("draft");
  });

  it("the public view never shows other revisions or internal identifiers", async () => {
    const c = await company("Public");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    const view = await svc.publicView(tokenOf(sent));
    const serialized = JSON.stringify(view);
    expect(view.companyName).toBe("Public");
    expect(serialized).not.toContain(c.id);
    expect(serialized).not.toContain(sent.id);
    expect(view.bodyMarkdown).toContain("Implantación CRM");
  });

  it("drafts are not visible through their public token", async () => {
    const c = await company("DraftHidden");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    await expect(svc.publicView(tokenOf(draft))).rejects.toMatchObject({ status: 404 });
  });

  it("lists only the latest revision per proposal", async () => {
    const c = await company("ListLatest");
    const a = await agent(c.id, "Seller");
    const svc = service();
    const draft = await svc.createFromOpportunity(c.id, draftInput(), { agentId: a.id });
    const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
    await svc.revise(sent.id, { priceCents: 9 }, { agentId: a.id });
    const listed = await svc.list(c.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.revision).toBe(2);
    expect(await svc.list(randomUUID())).toHaveLength(0);
  });

  it("persists the lead → opportunity → proposal journey, follow-up and forecast", async () => {
    const c = await company("Sales journey");
    const seller = await agent(c.id, "Seller");
    const actor = { actorType: "user" as const, actorId: "board-user", agentId: null, runId: null };
    const intake = await leadIntakeService(db).ingest(c.id, { source: "manual", sourceRef: randomUUID(), payload: { name: "Ana", company: "Acme", email: "ana@acme.test" } });
    await leadService(db).update(intake.lead.id, { assignedAgentId: seller.id, assignedUserId: null }, actor);
    const conversionKey = randomUUID();
    const converted = await leadService(db).convert(intake.lead.id, { createOpportunity: true, opportunityTitle: "Acme pilot", idempotencyKey: conversionKey }, actor);
    const replay = await leadService(db).convert(intake.lead.id, { createOpportunity: true, opportunityTitle: "Acme pilot", idempotencyKey: conversionKey }, actor);
    expect(replay.lead.opportunityId).toBe(converted.lead.opportunityId);
    const opps = opportunityService(db);
    const original = (await opps.findById(converted.lead.opportunityId!))!;
    expect(original.ownerAgentId).toBe(seller.id);
    expect((await opps.list(c.id, { ownerId: "unassigned" })).items).toHaveLength(0);
    expect((await opportunityForecastService(db).forecast(c.id, { periodDays: 90, ownerId: "unassigned" })).coverage.openOpportunities).toBe(0);
    const nextActionAt = new Date(Date.now() + 86_400_000).toISOString();
    const updated = await opps.update(c.id, original.id, { expectedVersion: original.version, amountCents: 100_000, currency: "EUR", probability: 60, expectedCloseAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), nextAction: "Send offer", nextActionAt, ownerAgentId: seller.id, ownerUserId: null });
    expect(updated.nextActionAt?.toISOString()).toBe(nextActionAt);
    expect(updated.probability).toBe(60);
    const forecast = await opportunityForecastService(db).forecast(c.id, { periodDays: 90, ownerId: seller.id });
    expect(forecast.coverage.included).toBe(1);
    expect(forecast.totals.weightedCents).toBe(60_000);
    const note = await crmActivityService(db).log(c.id, { subjectKind: "opportunity", subjectId: original.id, kind: "note", summary: "Buyer confirmed scope" });
    expect(note.subjectId).toBe(original.id);
    const commitment = await commitmentService(db).create(c.id, { opportunityId: original.id, customerId: original.customerId, who: "us", what: "Send offer", dueAt: nextActionAt });
    expect(commitment.what).toBe("Send offer");
    const draft = await service().createFromOpportunity(c.id, draftInput(randomUUID(), { opportunityId: original.id }), { agentId: seller.id });
    expect(draft.customerId).toBe(original.customerId);
    expect(draft.opportunityId).toBe(original.id);
    const sent = await service().send(draft.id, { via: "link" }, { agentId: seller.id });
    expect(sent.proposal.status).toBe("sent");
    expect((await service().publicView(draft.publicToken!)).title).toBe(draft.title);
  });

  it("rejects cross-company and mismatched proposal subjects without creating a draft", async () => {
    const mine = await company("Mine subjects");
    const theirs = await company("Foreign subjects");
    const [mineCustomer, otherCustomer] = await db.insert(customers).values([
      { companyId: mine.id, name: "Mine", kind: "organization" },
      { companyId: theirs.id, name: "Other", kind: "organization" },
    ]).returning();
    const opportunity = await opportunityService(db).create(theirs.id, { customerId: otherCustomer.id, title: "Foreign deal", stageKey: "new" });
    const svc = service();
    await expect(svc.createFromOpportunity(mine.id, draftInput(randomUUID(), { opportunityId: opportunity.id }), {})).rejects.toMatchObject({ status: 404 });
    await expect(svc.createFromOpportunity(mine.id, draftInput(randomUUID(), { customerId: otherCustomer.id }), {})).rejects.toMatchObject({ status: 404 });
    await expect(svc.createFromOpportunity(theirs.id, draftInput(randomUUID(), { opportunityId: opportunity.id, customerId: mineCustomer.id }), {})).rejects.toMatchObject({ status: 422 });
    expect(await svc.list(mine.id)).toEqual([]);
  });

  it("paginates latest revisions without omissions at equal timestamps and applies filters before pagination", async () => {
    const c = await company("Proposal pages");
    const svc = service();
    const drafts = await Promise.all(["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((title) => svc.createFromOpportunity(c.id, draftInput(randomUUID(), { title }), {})));
    const sent = await svc.send(drafts[0].id, { via: "link" }, {});
    const revision = await svc.revise(sent.proposal.id, { title: "Alpha revised" }, {});
    await db.update(proposals).set({ updatedAt: new Date("2026-10-29T12:00:00.123Z") }).where(eq(proposals.companyId, c.id));
    const found = [];
    let cursor: string | undefined;
    do {
      const page = await svc.listPage(c.id, { cursor, limit: 2 });
      found.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(found).toHaveLength(5);
    expect(new Set(found.map((item) => item.proposalKey)).size).toBe(5);
    expect(found.find((item) => item.proposalKey === revision.proposalKey)?.id).toBe(revision.id);
    const filtered = await svc.listPage(c.id, { q: "Alpha revised", status: "draft", limit: 1 });
    expect(filtered.items.map((item) => item.id)).toEqual([revision.id]);
    expect((await svc.listPage(randomUUID())).items).toEqual([]);
    await expect(svc.listPage(c.id, { cursor: "bad-cursor" })).rejects.toMatchObject({ status: 400 });
  });

  describe("routes", () => {
    function appFor(actor: Record<string, unknown>, deps: ProposalServiceDeps = {}) {
      const server = express();
      server.use((req, _res, next) => { (req as any).actor = actor; next(); });
      server.use(express.json({ verify: (req, _res, buf) => { (req as unknown as { rawBody: Buffer }).rawBody = buf; } }));
      server.use("/api", proposalRoutes(db, deps));
      server.use(publicProposalRoutes(db, deps));
      server.use(errorHandler);
      return server;
    }

    it("does not expose another company's proposal to a board user (404)", async () => {
      const mine = await company("Mine");
      const theirs = await company("Theirs");
      const seller = await agent(theirs.id, "Other seller");
      const foreign = await service().createFromOpportunity(theirs.id, draftInput(), { agentId: seller.id });
      const actor = { type: "board", userId: "user-1", companyIds: [mine.id], source: "session" };
      const response = await request(appFor(actor)).get(`/api/proposals/${foreign.id}`);
      expect(response.status).toBe(404);
    });

    it("webhook: a bad signature is 401, a valid signature marks the deposit paid once", async () => {
      const c = await company("Webhook");
      const a = await agent(c.id, "Seller");
      const svc = service({ resolveSecret: async (_companyId, key) => (key === "STRIPE_WEBHOOK_SECRET" ? WEBHOOK_SECRET : null) });
      const draft = await svc.createFromOpportunity(c.id, draftInput(randomUUID(), { depositCents: 50000 }), { agentId: a.id });
      const sent = (await svc.send(draft.id, { via: "link" }, { agentId: a.id })).proposal;
      // No STRIPE_SECRET_KEY in this company, so no link exists yet; the webhook still marks payment for the proposal.
      expect(sent.paymentStatus).toBe("none");
      const payload = JSON.stringify({
        id: "evt_test_1",
        type: "checkout.session.completed",
        data: { object: { payment_status: "paid", metadata: { proposalId: sent.id, companyId: c.id } } },
      });
      const deps: ProposalServiceDeps = { resolveSecret: async (_companyId, key) => (key === "STRIPE_WEBHOOK_SECRET" ? WEBHOOK_SECRET : null) };
      const app = appFor({ type: "none" }, deps);

      const badSignature = await request(app).post("/api/public/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", `t=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}`)
        .send(payload);
      expect(badSignature.status).toBe(401);
      expect((await svc.getById(sent.id))?.paymentStatus).toBe("none");

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
      const first = await request(app).post("/api/public/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", `t=${timestamp},v1=${signature}`)
        .send(payload);
      expect(first.status).toBe(200);
      expect(first.body.status).toBe("paid");
      const paid = await svc.getById(sent.id);
      expect(paid?.paymentStatus).toBe("paid");
      expect(paid?.status).toBe("sent");

      const second = await request(app).post("/api/public/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", `t=${timestamp},v1=${signature}`)
        .send(payload);
      expect(second.body.status).toBe("unchanged");
    });

    it("webhook without a signature header is 401 and for an unknown proposal is 401", async () => {
      const app = appFor({ type: "none" }, { resolveSecret: async () => WEBHOOK_SECRET });
      const missing = await request(app).post("/api/public/stripe/webhook").set("Content-Type", "application/json").send("{}");
      expect(missing.status).toBe(401);
      const unknown = await request(app).post("/api/public/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", `t=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}`)
        .send(JSON.stringify({ type: "checkout.session.completed", data: { object: { metadata: { proposalId: randomUUID() } } } }));
      expect(unknown.status).toBe(401);
    });
  });
});
