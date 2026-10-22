import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { create, log } = vi.hoisted(() => ({ create: vi.fn(), log: vi.fn() }));
vi.mock("../services/assignments.js", () => ({ assignmentService: () => ({ list: vi.fn().mockResolvedValue([]), getById: vi.fn(), create, update: vi.fn(), cancel: vi.fn() }) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: log }));
import { assignmentRoutes } from "../routes/assignments.js";
import { errorHandler } from "../middleware/index.js";

function app(actor: Record<string, unknown>) {
  const server = express(); server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", assignmentRoutes({} as any));
  server.use(errorHandler);
  return server;
}

describe("assignment routes", () => {
  it("rejects incomplete acceptance criteria with 422", async () => {
    const response = await request(app({ type: "board", userId: "user", companyIds: ["company"], source: "local_implicit" })).post("/api/companies/00000000-0000-4000-8000-000000000001/assignments").send({ title: "Work", budgetCents: 0, assigneeAgentId: "00000000-0000-4000-8000-000000000002", idempotencyKey: "key" });
    expect(response.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not let agent actors create an assignment", async () => {
    const response = await request(app({ type: "agent", agentId: "00000000-0000-4000-8000-000000000002", companyId: "00000000-0000-4000-8000-000000000001" })).post("/api/companies/00000000-0000-4000-8000-000000000001/assignments").send({ title: "Work", acceptanceCriteria: "Pass", budgetCents: 0, assigneeAgentId: "00000000-0000-4000-8000-000000000002", idempotencyKey: "key" });
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});
