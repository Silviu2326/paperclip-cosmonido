import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { QualificationCriteria } from "@paperclipai/shared";

const { log } = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock("../services/activity-log.js", async (importOriginal) => ({ ...(await importOriginal<object>()), logActivity: log }));

import { leadQualificationRoutes } from "../routes/leads.js";
import { commitmentRoutes, commercialTriggerRoutes } from "../routes/commitments.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const LEAD_ID = "00000000-0000-4000-8000-000000000003";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000004";
const AGENT_ID = "00000000-0000-4000-8000-000000000002";

const criteria: QualificationCriteria = {
  version: "2026-10",
  threshold: 60,
  criteria: [{ key: "budget", label: "Presupuesto", weight: 100 }],
};

// The routes under test reject before touching the database, so a placeholder db is enough.
const db = {} as Parameters<typeof leadQualificationRoutes>[0];

function app(actor: Record<string, unknown>, mount: (router: express.Router) => void) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = actor;
    next();
  });
  const router = express.Router();
  mount(router);
  server.use("/api", router);
  server.use(errorHandler);
  return server;
}

const board = { type: "board", userId: "user", companyIds: [COMPANY_ID], source: "local_implicit" };
const agent = { type: "agent", agentId: AGENT_ID, companyId: COMPANY_ID };

describe("lead qualification routes", () => {
  const qualifyApp = (actor: Record<string, unknown>) => app(actor, (router) => {
    router.use(leadQualificationRoutes(db, { qualification: { loadCriteria: async () => criteria } }));
  });

  it("answers 422 when the qualify body is invalid", async () => {
    const response = await request(qualifyApp(agent)).post(`/api/companies/${COMPANY_ID}/leads/${LEAD_ID}/qualify`).send({ assessments: [] });
    expect(response.status).toBe(422);
  });

  it("answers 422 and lists the unknown criterion", async () => {
    const response = await request(qualifyApp(board))
      .post(`/api/companies/${COMPANY_ID}/leads/${LEAD_ID}/qualify`)
      .send({ assessments: [{ criterion: "vibes", met: true, note: null }], sources: [] });
    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toContain("vibes");
  });

  it("rejects a malformed lead id before qualifying", async () => {
    const response = await request(qualifyApp(board))
      .post(`/api/companies/${COMPANY_ID}/leads/not-a-uuid/qualify`)
      .send({ assessments: [{ criterion: "budget", met: true, note: null }], sources: [] });
    expect(response.status).toBe(400);
  });

  it("refuses an agent key from another company", async () => {
    const response = await request(qualifyApp({ ...agent, companyId: "00000000-0000-4000-8000-0000000000ff" }))
      .post(`/api/companies/${COMPANY_ID}/leads/${LEAD_ID}/qualify`)
      .send({ assessments: [{ criterion: "budget", met: true, note: null }], sources: [] });
    expect(response.status).toBe(403);
  });

  it("answers 422 for an enrichment body with a missing query", async () => {
    const response = await request(qualifyApp(agent)).post(`/api/companies/${COMPANY_ID}/enrichment`).send({});
    expect(response.status).toBe(422);
  });

  it("answers 422 with the configuration message when no enrichment provider is set", async () => {
    const response = await request(qualifyApp(agent)).post(`/api/companies/${COMPANY_ID}/enrichment`).send({ query: "acme.com" });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe("No enrichment connection configured (Exa, Firecrawl or Tavily)");
  });
});

describe("commitment routes", () => {
  const extractApp = app(agent, (router) => {
    router.use(commitmentRoutes(db));
  });

  it("answers 422 when the extract body is invalid", async () => {
    const response = await request(extractApp)
      .post(`/api/companies/${COMPANY_ID}/conversations/${CONVERSATION_ID}/commitments/extract`)
      .send({ candidates: [{ who: "someone", what: "x", confidence: 2 }] });
    expect(response.status).toBe(422);
  });

  it("returns normalized candidates with persistence reported as unavailable", async () => {
    const response = await request(extractApp)
      .post(`/api/companies/${COMPANY_ID}/conversations/${CONVERSATION_ID}/commitments/extract`)
      .send({ candidates: [
        { who: "us", what: "Send the proposal", confidence: 0.9, evidence: null },
        { who: "us", what: "send the proposal.", confidence: 0.6, evidence: null },
      ] });
    expect(response.status).toBe(200);
    expect(response.body.candidates).toHaveLength(1);
    expect(response.body.persisted).toMatchObject({ created: 0, existing: 0 });
    expect(response.body.persisted.unavailable).toContain("Sprint 2");
  });
});

describe("commercial trigger routes", () => {
  const triggerApp = (deps: Parameters<typeof commercialTriggerRoutes>[1]) => app(board, (router) => {
    router.use(commercialTriggerRoutes(db, deps));
  });

  it("answers 422 for an unknown trigger kind", async () => {
    const response = await request(triggerApp({ findWaitingRuns: vi.fn(), advanceRun: vi.fn(), stopSequence: vi.fn() }))
      .post(`/api/companies/${COMPANY_ID}/commercial-triggers`)
      .send({ kind: "exploded", subjectKind: "lead", subjectId: "x" });
    expect(response.status).toBe(422);
  });

  it("advances waiting runs and returns the counts", async () => {
    const advanceRun = vi.fn(async () => undefined);
    const response = await request(triggerApp({
      findWaitingRuns: vi.fn(async () => [{ id: "run-1", currentStepKind: "wait", nextActionAt: null }]),
      advanceRun,
      stopSequence: vi.fn(async () => undefined),
    }))
      .post(`/api/companies/${COMPANY_ID}/commercial-triggers`)
      .send({ kind: "no_reply", subjectKind: "opportunity", subjectId: "opp-1" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ advanced: 1, stopped: 0 });
    expect(advanceRun).toHaveBeenCalledWith("run-1", "no_reply");
  });
});
