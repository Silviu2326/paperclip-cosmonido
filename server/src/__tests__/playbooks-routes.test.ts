import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { create, log } = vi.hoisted(() => ({ create: vi.fn(), log: vi.fn() }));
vi.mock("../services/playbooks.js", () => ({
  playbookService: () => ({
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    getRun: vi.fn().mockResolvedValue(null),
    create,
    createFromTemplate: vi.fn(),
    update: vi.fn(),
    newDraftFrom: vi.fn(),
    publishVersion: vi.fn(),
    archive: vi.fn(),
    usage: vi.fn().mockResolvedValue([]),
    listRuns: vi.fn().mockResolvedValue([]),
    start: vi.fn(),
    advance: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  }),
  listPlaybookTemplates: () => [],
}));
vi.mock("../services/activity-log.js", () => ({ logActivity: log }));
import { playbookRoutes } from "../routes/playbooks.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const AGENT = "00000000-0000-4000-8000-000000000002";

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  server.use("/api", playbookRoutes({} as any));
  server.use(errorHandler);
  return server;
}

const boardActor = { type: "board", userId: "user", companyIds: [COMPANY], source: "local_implicit" };
const agentActor = { type: "agent", agentId: AGENT, companyId: COMPANY };

describe("playbook routes", () => {
  it("rejects an invalid playbook body with 422 before calling the service", async () => {
    const response = await request(app(boardActor))
      .post(`/api/companies/${COMPANY}/playbooks`)
      .send({ key: "Bad Key", name: "", steps: [] });
    expect(response.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not let agent actors create a playbook", async () => {
    const response = await request(app(agentActor))
      .post(`/api/companies/${COMPANY}/playbooks`)
      .send({
        key: "inbound",
        name: "Inbound",
        steps: [{ key: "respond", kind: "respond", autonomy: "draft_only" }],
      });
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not let agent actors pause a run", async () => {
    const response = await request(app(agentActor))
      .post(`/api/playbook-runs/${AGENT}/pause`)
      .send({});
    expect(response.status).toBe(403);
  });
});
