import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { explain } = vi.hoisted(() => ({ explain: vi.fn() }));
vi.mock("../services/agent-explain.js", () => ({ agentExplainService: () => ({ explain }) }));
import { agentExplainRoutes } from "../routes/agent-explain.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const OTHER_COMPANY = "00000000-0000-4000-8000-000000000009";
const ACTION = "00000000-0000-4000-8000-000000000003";

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", agentExplainRoutes({} as any));
  server.use(errorHandler);
  return server;
}

const board = { type: "board", userId: "user", companyIds: [COMPANY], source: "local_implicit" };

describe("agent explain routes", () => {
  it("rejects a request without kind with 400", async () => {
    const response = await request(app(board)).get(`/api/companies/${COMPANY}/agent-actions/${ACTION}/explain`);
    expect(response.status).toBe(400);
    expect(explain).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind with 400", async () => {
    const response = await request(app(board)).get(`/api/companies/${COMPANY}/agent-actions/${ACTION}/explain?kind=message`);
    expect(response.status).toBe(400);
    expect(explain).not.toHaveBeenCalled();
  });

  it("returns the explanation for a valid kind", async () => {
    explain.mockResolvedValueOnce({ companyId: COMPANY, missing: ["run"], timeline: [] });
    const response = await request(app(board)).get(`/api/companies/${COMPANY}/agent-actions/${ACTION}/explain?kind=proposal`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ companyId: COMPANY, missing: ["run"], timeline: [] });
    expect(explain).toHaveBeenCalledWith(COMPANY, "proposal", ACTION);
  });

  it("forbids an agent reading another company", async () => {
    const response = await request(app({ type: "agent", agentId: ACTION, companyId: OTHER_COMPANY }))
      .get(`/api/companies/${COMPANY}/agent-actions/${ACTION}/explain?kind=run`);
    expect(response.status).toBe(403);
    expect(explain).not.toHaveBeenCalled();
  });
});
