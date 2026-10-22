import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { svc, log } = vi.hoisted(() => ({
  svc: {
    list: vi.fn(),
    getById: vi.fn(),
    listRevisions: vi.fn(),
    createFromOpportunity: vi.fn(),
    revise: vi.fn(),
    send: vi.fn(),
    markViewed: vi.fn(),
    publicView: vi.fn(),
    accept: vi.fn(),
    reject: vi.fn(),
    handleStripeWebhook: vi.fn(),
  },
  log: vi.fn(),
}));

vi.mock("../services/proposals.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/proposals.js")>();
  return {
    ...actual,
    // The real signature check runs inside the service; here the stub mirrors it so the route wiring is tested end to end.
    proposalService: () => svc,
  };
});
vi.mock("../services/activity-log.js", () => ({ logActivity: log }));

import { proposalRoutes, publicProposalRoutes, renderPublicProposalHtml } from "../routes/proposals.js";
import { verifyStripeSignature } from "../services/stripe-payment-links.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const OTHER_COMPANY = "00000000-0000-4000-8000-000000000009";
const PROPOSAL = "00000000-0000-4000-8000-000000000101";
const AGENT = "00000000-0000-4000-8000-000000000002";
const WEBHOOK_SECRET = "whsec_route_test";

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL,
    companyId: COMPANY,
    proposalKey: "key-1",
    revision: 1,
    title: "Propuesta",
    status: "draft",
    paymentStatus: "none",
    priceCents: 100000,
    currency: "EUR",
    scope: [],
    publicToken: "tok",
    ...overrides,
  };
}

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use(express.json({
    verify: (req, _res, buf) => { (req as unknown as { rawBody: Buffer }).rawBody = buf; },
  }));
  server.use("/api", proposalRoutes({} as any));
  server.use(publicProposalRoutes({} as any));
  server.use(errorHandler);
  return server;
}

const board = { type: "board", userId: "user", companyIds: [COMPANY], source: "local_implicit" };
const agent = { type: "agent", agentId: AGENT, companyId: COMPANY };

describe("proposal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getById.mockResolvedValue(proposal());
  });

  it("creates a proposal for an agent of the same company and logs it", async () => {
    svc.createFromOpportunity.mockResolvedValue(proposal());
    const response = await request(app(agent)).post(`/api/companies/${COMPANY}/proposals`).send({
      title: "Propuesta",
      scope: [{ title: "Trabajo" }],
      priceCents: 100000,
      currency: "EUR",
      idempotencyKey: "key-1",
    });
    expect(response.status).toBe(201);
    expect(log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "proposal.created", companyId: COMPANY }));
  });

  it("does not let an agent create a proposal in another company", async () => {
    const response = await request(app(agent)).post(`/api/companies/${OTHER_COMPANY}/proposals`).send({
      title: "Propuesta",
      scope: [{ title: "Trabajo" }],
      priceCents: 1,
      currency: "EUR",
      idempotencyKey: "key-1",
    });
    expect(response.status).toBe(403);
    expect(svc.createFromOpportunity).not.toHaveBeenCalled();
  });

  it("answers 422 for an invalid create body", async () => {
    const response = await request(app(board)).post(`/api/companies/${COMPANY}/proposals`).send({ title: "" });
    expect(response.status).toBe(422);
    expect(svc.createFromOpportunity).not.toHaveBeenCalled();
  });

  it("returns 404 for a proposal of another company, without revealing it exists", async () => {
    svc.getById.mockResolvedValue(proposal({ companyId: OTHER_COMPANY }));
    // local_implicit boards bypass company checks by design, so use a session board limited to COMPANY.
    const sessionBoard = { type: "board", userId: "user", companyIds: [COMPANY], source: "session" };
    const response = await request(app(sessionBoard)).get(`/api/proposals/${PROPOSAL}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Proposal not found" });
  });

  it("returns 404 when the proposal does not exist", async () => {
    svc.getById.mockResolvedValue(null);
    const response = await request(app(agent)).get(`/api/proposals/${PROPOSAL}`);
    expect(response.status).toBe(404);
  });

  it("sends a proposal and logs the send", async () => {
    svc.send.mockResolvedValue({
      proposal: proposal({ status: "sent", revision: 1 }),
      publicUrl: "/api/public/proposals/tok/view",
      paymentUnavailableReason: null,
      messageId: null,
      expiredProposalIds: [],
    });
    const response = await request(app(agent)).post(`/api/proposals/${PROPOSAL}/send`).send({ via: "link" });
    expect(response.status).toBe(200);
    expect(response.body.publicUrl).toBe("/api/public/proposals/tok/view");
    expect(log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "proposal.sent" }));
  });

  it("rejects a message send with a 422 when the service has no message channel", async () => {
    const { HttpError } = await import("../errors.js");
    svc.send.mockRejectedValue(new HttpError(422, "Message sending is not available yet; use via=link"));
    const response = await request(app(board)).post(`/api/proposals/${PROPOSAL}/send`).send({ via: "message" });
    expect(response.status).toBe(422);
  });
});

describe("public proposal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.markViewed.mockResolvedValue(proposal({ status: "viewed" }));
    svc.publicView.mockResolvedValue({
      title: "<script>alert(1)</script>",
      companyName: "Acme & Co",
      revision: 1,
      scope: [{ title: "Trabajo <b>", description: "x" }],
      terms: "Pagar a 30 días",
      priceCents: 100000,
      depositCents: 50000,
      currency: "EUR",
      validUntil: null,
      status: "sent",
      paymentStatus: "link_created",
      paymentUrl: "https://buy.stripe.com/test",
      bodyMarkdown: null,
    });
  });

  it("renders the signing page with user content escaped", async () => {
    const response = await request(app(board)).get("/api/public/proposals/tok/view");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).not.toContain("<script>alert(1)</script>");
    expect(response.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(response.text).toContain("Acme &amp; Co");
    expect(response.text).toContain("Trabajo &lt;b&gt;");
  });

  it("serves the JSON view without internal identifiers", async () => {
    const response = await request(app(board)).get("/api/public/proposals/tok");
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(COMPANY);
    expect(response.body.companyName).toBe("Acme & Co");
  });

  it("maps an accept conflict from the service to 409", async () => {
    const { HttpError } = await import("../errors.js");
    svc.accept.mockRejectedValue(new HttpError(409, "The revision shown does not match"));
    const response = await request(app(board)).post("/api/public/proposals/tok/accept").send({ name: "Ana", email: "ana@example.com", revision: 2 });
    expect(response.status).toBe(409);
  });

  it("validates the accept body with 422", async () => {
    const response = await request(app(board)).post("/api/public/proposals/tok/accept").send({ name: "", email: "no", revision: 0 });
    expect(response.status).toBe(422);
    expect(svc.accept).not.toHaveBeenCalled();
  });

  it("webhook without a signature header is rejected with 401", async () => {
    const { HttpError } = await import("../errors.js");
    svc.handleStripeWebhook.mockRejectedValue(new HttpError(401, "Missing Stripe signature"));
    const response = await request(app(board)).post("/api/public/stripe/webhook").set("Content-Type", "application/json").send({ type: "checkout.session.completed" });
    expect(response.status).toBe(401);
  });

  it("webhook with a tampered HMAC is rejected with 401, and a valid HMAC marks the payment", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { metadata: { proposalId: PROPOSAL } } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const goodSignature = `t=${timestamp},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex")}`;

    // Mirrors the service: verify with the company secret, then record the payment.
    svc.handleStripeWebhook.mockImplementation(async ({ rawBody, signature }: { rawBody: Buffer; signature?: string }) => {
      const { HttpError } = await import("../errors.js");
      if (!signature || !verifyStripeSignature({ rawBody, header: signature, secret: WEBHOOK_SECRET })) {
        throw new HttpError(401, "Invalid Stripe signature");
      }
      return { status: "paid", proposalId: PROPOSAL, companyId: COMPANY };
    });

    const bad = await request(app(board)).post("/api/public/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", goodSignature.replace(/v1=.*/, `v1=${"0".repeat(64)}`))
      .send(payload);
    expect(bad.status).toBe(401);

    const good = await request(app(board)).post("/api/public/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", goodSignature)
      .send(payload);
    expect(good.status).toBe(200);
    expect(good.body).toEqual({ received: true, status: "paid" });
    expect(log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "proposal.paid", companyId: COMPANY }));
  });
});

describe("renderPublicProposalHtml", () => {
  it("does not render an accept form for an accepted proposal", () => {
    const html = renderPublicProposalHtml({
      title: "T", companyName: "C", revision: 1, scope: [], terms: null, priceCents: 0, depositCents: null,
      currency: "EUR", validUntil: null, status: "accepted", paymentStatus: "none", paymentUrl: null, bodyMarkdown: null,
    }, "tok");
    expect(html).not.toContain('id="sign"');
    expect(html).toContain("Aceptada");
  });
});
