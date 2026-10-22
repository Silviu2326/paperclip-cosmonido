import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromProposal, fromOpportunity, retry, getById, list } = vi.hoisted(() => ({
  fromProposal: vi.fn(),
  fromOpportunity: vi.fn(),
  retry: vi.fn(),
  getById: vi.fn(),
  list: vi.fn(),
}));
vi.mock("../services/handoff.js", () => ({
  handoffService: () => ({ fromProposal, fromOpportunity, retry, getById, getBySource: vi.fn(), list }),
}));

import { handoffRoutes } from "../routes/handoff.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const PROPOSAL = "00000000-0000-4000-8000-000000000003";
const RECEIPT = "00000000-0000-4000-8000-000000000004";
const AGENT = "00000000-0000-4000-8000-000000000002";

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", handoffRoutes({} as any));
  server.use(errorHandler);
  return server;
}

const board = { type: "board", userId: "board-user", companyIds: [COMPANY], source: "local_implicit" };
const agent = { type: "agent", agentId: AGENT, companyId: COMPANY };
const receipt = { id: RECEIPT, companyId: COMPANY, status: "partial", stepsDone: ["project"], error: "boom" };

describe("handoff routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromProposal.mockResolvedValue({ ...receipt, status: "complete" });
    retry.mockResolvedValue({ ...receipt, status: "complete" });
    getById.mockResolvedValue(receipt);
  });

  it("answers 422 for an invalid from-proposal body and never calls the service", async () => {
    const response = await request(app(board))
      .post(`/api/companies/${COMPANY}/handoffs/from-proposal`)
      .send({ proposalId: "not-a-uuid" });
    expect(response.status).toBe(422);
    expect(fromProposal).not.toHaveBeenCalled();
  });

  it("answers 422 for an opportunity handoff without its acceptance criteria", async () => {
    const response = await request(app(board))
      .post(`/api/companies/${COMPANY}/handoffs/from-opportunity`)
      .send({ opportunityId: PROPOSAL, title: "Sin criterio", budgetCents: 0 });
    expect(response.status).toBe(422);
    expect(fromOpportunity).not.toHaveBeenCalled();
  });

  it("lets an agent start a handoff and answers 201 when the receipt is complete", async () => {
    const response = await request(app(agent))
      .post(`/api/companies/${COMPANY}/handoffs/from-proposal`)
      .send({ proposalId: PROPOSAL });
    expect(response.status).toBe(201);
    expect(fromProposal).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ proposalId: PROPOSAL }), { agentId: AGENT });
  });

  it("answers 202 with the partial receipt when a step failed", async () => {
    fromProposal.mockResolvedValueOnce(receipt);
    const response = await request(app(board))
      .post(`/api/companies/${COMPANY}/handoffs/from-proposal`)
      .send({ proposalId: PROPOSAL });
    expect(response.status).toBe(202);
    expect(response.body.status).toBe("partial");
  });

  it("refuses an agent retry with 403", async () => {
    const response = await request(app(agent)).post(`/api/handoffs/${RECEIPT}/retry`).send({});
    expect(response.status).toBe(403);
    expect(retry).not.toHaveBeenCalled();
  });

  it("lets a board user retry a partial receipt", async () => {
    const response = await request(app(board)).post(`/api/handoffs/${RECEIPT}/retry`).send({});
    expect(response.status).toBe(200);
    expect(retry).toHaveBeenCalledWith(RECEIPT, { userId: "board-user" });
  });
});
