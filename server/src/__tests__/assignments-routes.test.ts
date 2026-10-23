import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, log, getById, list, update, cancel, canReadIssue, goalForIssue, issueReadCondition } = vi.hoisted(() => ({
  create: vi.fn(),
  log: vi.fn(),
  getById: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
  canReadIssue: vi.fn(),
  goalForIssue: vi.fn(),
  issueReadCondition: vi.fn(),
}));
vi.mock("../services/assignments.js", () => ({ assignmentService: () => ({ list, getById, create, update, cancel }) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: log }));
vi.mock("../services/assignment-costs.js", () => ({ resolveGoalIdForIssue: goalForIssue }));
vi.mock("../services/authorization.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/authorization.js")>()),
  canActorReadIssuePrivacy: canReadIssue,
  issueReadSqlCondition: issueReadCondition,
}));
import { assignmentRoutes } from "../routes/assignments.js";
import { errorHandler } from "../middleware/index.js";
const companyId = "00000000-0000-4000-8000-000000000001";
const otherCompanyId = "00000000-0000-4000-8000-000000000002";
const issueId = "00000000-0000-4000-8000-000000000003";
const assignmentId = "00000000-0000-4000-8000-000000000004";
const boardActor = { type: "board", userId: "user", companyIds: [companyId], source: "session" };

function issueDb(issue: { id: string; companyId: string } | null) {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => issue ? [issue] : []) })) })),
  };
}

function app(actor: Record<string, unknown>, db: object = issueDb({ id: issueId, companyId })) {
  const server = express(); server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", assignmentRoutes(db as any));
  server.use(errorHandler);
  return server;
}

const assignment = (overrides: Record<string, unknown> = {}) => ({ id: assignmentId, companyId, rootIssueId: issueId, rootIssue: null, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  canReadIssue.mockResolvedValue(true);
  issueReadCondition.mockResolvedValue({ sql: "privacy-predicate" });
  list.mockResolvedValue([]);
  update.mockResolvedValue(assignment());
  cancel.mockResolvedValue(assignment());
  goalForIssue.mockResolvedValue(assignmentId);
  getById.mockResolvedValue(assignment());
});

describe("assignment routes", () => {
  it("rejects incomplete acceptance criteria with 422", async () => {
    const response = await request(app(boardActor)).post(`/api/companies/${companyId}/assignments`).send({ title: "Work", budgetCents: 0, assigneeAgentId: "00000000-0000-4000-8000-000000000002", idempotencyKey: "key" });
    expect(response.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not let agent actors create an assignment", async () => {
    const response = await request(app({ type: "agent", agentId: "agent", companyId })).post(`/api/companies/${companyId}/assignments`).send({ title: "Work", acceptanceCriteria: "Pass", budgetCents: 0, assigneeAgentId: "00000000-0000-4000-8000-000000000002", idempotencyKey: "key" });
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes the actor privacy predicate into the paginated company list", async () => {
    const response = await request(app(boardActor)).get(`/api/companies/${companyId}/assignments?limit=20`);
    expect(response.status).toBe(200);
    expect(issueReadCondition).toHaveBeenCalledWith(expect.any(Object), boardActor);
    expect(list).toHaveBeenCalledWith(companyId, expect.objectContaining({ limit: 20, issueReadCondition: { sql: "privacy-predicate" } }));
  });

  it("returns the assignment for a readable same-company root issue", async () => {
    const response = await request(app(boardActor)).get(`/api/issues/${issueId}/assignment`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(assignmentId);
    expect(canReadIssue).toHaveBeenCalledWith(expect.any(Object), boardActor, expect.objectContaining({ id: issueId, companyId }));
    expect(getById).toHaveBeenCalledWith(assignmentId);
  });

  it("does not look up assignment metadata when the same-company issue is private", async () => {
    canReadIssue.mockResolvedValue(false);
    const response = await request(app(boardActor)).get(`/api/issues/${issueId}/assignment`);
    expect(response.status).toBe(404);
    expect(goalForIssue).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
  });

  it("uses not-found and does not read privacy for a nonexistent issue", async () => {
    const response = await request(app(boardActor, issueDb(null))).get(`/api/issues/${issueId}/assignment`);
    expect(response.status).toBe(404);
    expect(canReadIssue).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
  });

  it("hides an issue in another company before checking privacy or assignment metadata", async () => {
    const response = await request(app({ ...boardActor, companyIds: [otherCompanyId] }, issueDb({ id: issueId, companyId }))).get(`/api/issues/${issueId}/assignment`);
    expect(response.status).toBe(404);
    expect(canReadIssue).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
  });

  it("hides the legacy assignment alias when its root issue is private", async () => {
    canReadIssue.mockResolvedValue(false);
    getById.mockResolvedValue(assignment({ rootIssue: { id: issueId, companyId } }));
    const response = await request(app(boardActor)).get(`/api/assignments/${assignmentId}`);
    expect(response.status).toBe(404);
    expect(canReadIssue).toHaveBeenCalledWith(expect.any(Object), boardActor, expect.objectContaining({ id: issueId, companyId }));
  });

  it("keeps the legacy assignment alias available for a readable root issue", async () => {
    getById.mockResolvedValue(assignment({ rootIssue: { id: issueId, companyId } }));
    const response = await request(app(boardActor)).get(`/api/assignments/${assignmentId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(assignmentId);
  });

  it("rejects legacy patch and cancel before mutation when the root is private", async () => {
    canReadIssue.mockResolvedValue(false);
    getById.mockResolvedValue(assignment({ rootIssue: { id: issueId, companyId } }));
    const patch = await request(app(boardActor)).patch(`/api/assignments/${assignmentId}`).send({ title: "Updated" });
    const cancelResponse = await request(app(boardActor)).post(`/api/assignments/${assignmentId}/cancel`);
    expect(patch.status).toBe(404);
    expect(cancelResponse.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("hides a cross-company legacy assignment without a privacy check", async () => {
    getById.mockResolvedValue(assignment({ companyId: otherCompanyId }));
    const response = await request(app(boardActor)).get(`/api/assignments/${assignmentId}`);
    expect(response.status).toBe(404);
    expect(canReadIssue).not.toHaveBeenCalled();
  });

  it("does not return a private assignment root through a readable subtask", async () => {
    const subtaskId = "00000000-0000-4000-8000-000000000005";
    goalForIssue.mockResolvedValue(assignmentId);
    canReadIssue.mockImplementation(async (_db, _actor, issue) => issue.id === subtaskId);
    getById.mockResolvedValue(assignment({ rootIssue: { id: issueId, companyId } }));
    const response = await request(app(boardActor, issueDb({ id: subtaskId, companyId }))).get(`/api/issues/${subtaskId}/assignment`);
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(canReadIssue).toHaveBeenCalledTimes(2);
  });
});
