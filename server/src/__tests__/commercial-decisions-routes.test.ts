import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { create, listOpen, get, resolve, createRemoteLink, describeRemote, resolveRemote } = vi.hoisted(() => ({
  create: vi.fn(), listOpen: vi.fn(), get: vi.fn(), resolve: vi.fn(), createRemoteLink: vi.fn(), describeRemote: vi.fn(), resolveRemote: vi.fn(),
}));
vi.mock("../services/commercial-decisions.js", () => ({
  commercialDecisionService: () => ({ create, listOpen, get, resolve, createRemoteLink, describeRemote, resolveRemote }),
}));
vi.mock("../services/decisions.js", () => ({ decisionService: () => ({}) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: vi.fn() }));

import { commercialDecisionRoutes, publicDecisionRoutes } from "../routes/commercial-decisions.js";
import { errorHandler } from "../middleware/index.js";
import { HttpError } from "../errors.js";

const companyId = "00000000-0000-4000-8000-000000000001";
const decisionOptions = { wakeOriginAgent: async () => undefined };

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", commercialDecisionRoutes({} as any, decisionOptions));
  server.use(errorHandler);
  return server;
}

function publicApp() {
  const server = express();
  server.use(express.json());
  server.use(publicDecisionRoutes({} as any, decisionOptions));
  server.use(errorHandler);
  return server;
}

const validCreateBody = {
  type: "approve_send",
  title: "Enviar?",
  body: "Borrador listo.",
  subject: { kind: "message_draft", id: "draft-1" },
  subjectVersion: "v1",
  options: [{ id: "send", label: "Enviar", effect: { kind: "none" } }],
  idempotencyKey: "route-test-1",
};

describe("commercial decision routes", () => {
  it("rejects a board actor creating a commercial decision with 403", async () => {
    const response = await request(app({ type: "board", userId: "user-1", companyIds: [companyId], source: "session" }))
      .post(`/api/companies/${companyId}/commercial-decisions`)
      .send(validCreateBody);
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/agent runs/);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 422 for a public resolve with an invalid body", async () => {
    const token = "a".repeat(43);
    const response = await request(publicApp())
      .post(`/api/public/decisions/${token}/resolve`)
      .send({ optionId: "" });
    expect(response.status).toBe(422);
    expect(resolveRemote).not.toHaveBeenCalled();
  });

  it("maps an expired public token to 410 without leaking company ids", async () => {
    describeRemote.mockRejectedValueOnce(new HttpError(410, "Decision link has expired or was already used"));
    const response = await request(publicApp()).get(`/api/public/decisions/${"b".repeat(43)}`);
    expect(response.status).toBe(410);
    expect(JSON.stringify(response.body)).not.toContain(companyId);
  });

  it("passes a valid public resolve to the service", async () => {
    resolveRemote.mockResolvedValueOnce({ applied: true, decision: { status: "decided", chosenOptionId: "send" } });
    const response = await request(publicApp())
      .post(`/api/public/decisions/${"c".repeat(43)}/resolve`)
      .send({ optionId: "send" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ applied: true, status: "decided", chosenOptionId: "send" });
  });

  it("forbids a board actor from resolving through a non-board actor", async () => {
    const response = await request(app({ type: "agent", agentId: "00000000-0000-4000-8000-000000000002", companyId, runId: "00000000-0000-4000-8000-000000000003" }))
      .post("/api/commercial-decisions/00000000-0000-4000-8000-000000000004/resolve")
      .send({ optionId: "send" });
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });
});
