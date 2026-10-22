import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { grant, revoke, recordShadowOutcome, effectiveLevel, runBench, log } = vi.hoisted(() => ({
  grant: vi.fn(),
  revoke: vi.fn(),
  recordShadowOutcome: vi.fn(),
  effectiveLevel: vi.fn(),
  runBench: vi.fn(),
  log: vi.fn(),
}));
vi.mock("../services/autonomy.js", () => ({
  autonomyService: () => ({
    matrix: vi.fn().mockResolvedValue([]),
    effectiveLevel,
    history: vi.fn().mockResolvedValue([]),
    grant,
    revoke,
    recordShadowOutcome,
  }),
}));
vi.mock("../services/autonomy-bench.js", () => ({
  autonomyBench: () => ({ run: runBench, list: vi.fn().mockResolvedValue([]), getById: vi.fn().mockResolvedValue(null) }),
}));
vi.mock("../services/activity-log.js", () => ({ logActivity: log }));
import { autonomyRoutes } from "../routes/autonomy.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const AGENT = "00000000-0000-4000-8000-000000000002";
const OTHER_AGENT = "00000000-0000-4000-8000-000000000003";
const BOARD = { type: "board", userId: "user", companyIds: [COMPANY], source: "local_implicit" };
const AGENT_ACTOR = { type: "agent", agentId: AGENT, companyId: COMPANY };

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", autonomyRoutes({} as any));
  server.use(errorHandler);
  return server;
}

describe("autonomy routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant.mockResolvedValue({ id: "policy-1", agentId: AGENT, actionType: "email", level: "send_with_approval", benchRunId: null });
    effectiveLevel.mockResolvedValue({ companyId: COMPANY, agentId: AGENT, actionType: "email", level: "draft_only", source: "default", policyId: null });
    recordShadowOutcome.mockResolvedValue({ periodStart: "2026-10-22" });
    runBench.mockResolvedValue({ id: "run-1", agentId: AGENT, actionType: "email", sampleSize: 20, status: "done", score: 0.9, threshold: 0.85, casesEvaluated: 3, costCents: 0, error: null });
  });

  it("rejects an invalid grant body with 422 before calling the service", async () => {
    const response = await request(app(BOARD)).post(`/api/companies/${COMPANY}/autonomy/grant`).send({ agentId: AGENT, actionType: "fax", level: "send_direct" });
    expect(response.status).toBe(422);
    expect(grant).not.toHaveBeenCalled();
  });

  it("does not let an agent grant autonomy (403)", async () => {
    const response = await request(app(AGENT_ACTOR)).post(`/api/companies/${COMPANY}/autonomy/grant`).send({ agentId: AGENT, actionType: "email", level: "send_with_approval" });
    expect(response.status).toBe(403);
    expect(grant).not.toHaveBeenCalled();
  });

  it("does not let an agent revoke or start a bench (403)", async () => {
    const revokeResponse = await request(app(AGENT_ACTOR)).post(`/api/companies/${COMPANY}/autonomy/revoke`).send({ agentId: AGENT, actionType: "email", reason: "x" });
    const benchResponse = await request(app(AGENT_ACTOR)).post(`/api/companies/${COMPANY}/autonomy/bench`).send({ agentId: AGENT, actionType: "email" });
    expect(revokeResponse.status).toBe(403);
    expect(benchResponse.status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
    expect(runBench).not.toHaveBeenCalled();
  });

  it("grants as a board actor and logs autonomy.granted", async () => {
    const response = await request(app(BOARD)).post(`/api/companies/${COMPANY}/autonomy/grant`).send({ agentId: AGENT, actionType: "email", level: "send_with_approval", reason: "bench passed", benchRunId: null });
    expect(response.status).toBe(201);
    expect(grant).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ agentId: AGENT, level: "send_with_approval" }), expect.objectContaining({ userId: "user" }));
    expect(log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "autonomy.granted", companyId: COMPANY }));
  });

  it("lets an agent read its own effective level but not another agent's", async () => {
    const own = await request(app(AGENT_ACTOR)).get(`/api/companies/${COMPANY}/autonomy/effective?actionType=email`);
    expect(own.status).toBe(200);
    expect(effectiveLevel).toHaveBeenCalledWith(COMPANY, AGENT, "email");

    const other = await request(app(AGENT_ACTOR)).get(`/api/companies/${COMPANY}/autonomy/effective?agentId=${OTHER_AGENT}&actionType=email`);
    expect(other.status).toBe(403);
  });

  it("validates the effective query with 422", async () => {
    const response = await request(app(BOARD)).get(`/api/companies/${COMPANY}/autonomy/effective?agentId=not-a-uuid&actionType=email`);
    expect(response.status).toBe(422);
  });

  it("lets an agent record only its own shadow outcome", async () => {
    const own = await request(app(AGENT_ACTOR)).post(`/api/companies/${COMPANY}/autonomy/shadow-outcomes`).send({ agentId: AGENT, actionType: "email", outcome: "edited" });
    expect(own.status).toBe(201);
    const foreign = await request(app(AGENT_ACTOR)).post(`/api/companies/${COMPANY}/autonomy/shadow-outcomes`).send({ agentId: OTHER_AGENT, actionType: "email", outcome: "edited" });
    expect(foreign.status).toBe(403);
    expect(recordShadowOutcome).toHaveBeenCalledTimes(1);
  });

  it("returns the finished bench run with 201 and logs start and finish", async () => {
    const response = await request(app(BOARD)).post(`/api/companies/${COMPANY}/autonomy/bench`).send({ agentId: AGENT, actionType: "email" });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: "run-1", status: "done", score: 0.9 });
    expect(runBench).toHaveBeenCalledWith(COMPANY, AGENT, "email", { sampleSize: 20, threshold: undefined }, expect.anything());
    const actions = log.mock.calls.map((call) => call[1].action);
    expect(actions).toEqual(["autonomy.bench_started", "autonomy.bench_finished"]);
  });

  it("rejects a bench request with an out-of-range sample size with 422", async () => {
    const response = await request(app(BOARD)).post(`/api/companies/${COMPANY}/autonomy/bench`).send({ agentId: AGENT, actionType: "email", sampleSize: 500 });
    expect(response.status).toBe(422);
    expect(runBench).not.toHaveBeenCalled();
  });
});
