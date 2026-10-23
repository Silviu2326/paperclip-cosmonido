import { beforeEach, describe, expect, it, vi } from "vitest";

const coverage = vi.hoisted(() => vi.fn());

vi.mock("../middleware/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../services/assignment-costs.js", () => ({
  assignmentCostService: () => ({ coverage, byGoal: vi.fn(async () => ({ rows: [] })) }),
}));

import { assignmentDashboardService, deriveAssignmentStatus, latestReviewStates } from "../services/assignment-dashboard.js";

/** Query-builder double: every chained call returns itself and awaiting yields `rows`. */
function chain(rows: unknown[]): unknown {
  const proxy: unknown = new Proxy(() => undefined, {
    get: (_target, prop) => (prop === "then" ? (resolve: (value: unknown[]) => unknown) => resolve(rows) : () => proxy),
  });
  return proxy;
}

const emptyDb = { select: () => chain([]) };
const brokenDb = { select: () => { throw new Error('relation "approvals" does not exist'); } };

const window = {
  spendCents: 100, eventCount: 1, assignmentCents: 100, unattributedCents: 0, coveragePercent: 100,
  pricingComplete: true, from: "2026-10-19T00:00:00.000Z", to: "2026-10-21T12:00:00.000Z",
};
const testActor = { type: "board" as const, source: "local_implicit" as const };

describe("latestReviewStates", () => {
  it("lets the newest review of a target supersede older verdicts", () => {
    expect(latestReviewStates([
      { targetKind: "work_product", targetId: "a", state: "changes_requested", createdAt: "2026-10-20T10:00:00.000Z" },
      { targetKind: "work_product", targetId: "a", state: "accepted", createdAt: "2026-10-21T10:00:00.000Z" },
    ])).toEqual(["accepted"]);
    expect(latestReviewStates([
      { targetKind: "work_product", targetId: "a", state: "accepted", createdAt: new Date("2026-10-20T10:00:00.000Z") },
      { targetKind: "work_product", targetId: "a", state: "pending", createdAt: new Date("2026-10-21T10:00:00.000Z") },
      { targetKind: "document_revision", targetId: "a", state: "changes_requested", createdAt: new Date("2026-10-19T10:00:00.000Z") },
    ]).sort()).toEqual(["changes_requested", "pending"]);
  });

  it("derives the status from the latest verdicts, not from history", () => {
    const history = [
      { targetKind: "work_product", targetId: "a", state: "changes_requested", createdAt: "2026-10-20T10:00:00.000Z" },
      { targetKind: "work_product", targetId: "a", state: "accepted", createdAt: "2026-10-21T10:00:00.000Z" },
    ];
    expect(deriveAssignmentStatus({ goalStatus: "active", rootIssueStatus: "done", reviewStates: latestReviewStates(history) })).toBe("accepted");
    expect(deriveAssignmentStatus({ goalStatus: "active", rootIssueStatus: "todo", reviewStates: latestReviewStates(history.slice(0, 1)) })).toBe("changes_requested");
    expect(deriveAssignmentStatus({ goalStatus: "active", rootIssueStatus: "in_review", reviewStates: [] })).toBe("awaiting_review");
  });
});

describe("assignmentDashboardService.sections", () => {
  beforeEach(() => coverage.mockReset());

  it("returns every section when nothing fails", async () => {
    coverage.mockResolvedValue(window);
    const sections = await assignmentDashboardService(emptyDb as never).sections("company-1", testActor, new Date("2026-10-21T12:00:00.000Z"));
    expect(sections.activeAssignments).toEqual({ items: [] });
    expect(sections.needsYou).toEqual({ items: [], counts: { approvals: 0, decisions: 0, deliverableReviews: 0 } });
    expect(sections.costsToday).toEqual(window);
    expect(sections.costsThisWeek).toEqual(window);
  });

  it("isolates a failing cost section from the others", async () => {
    coverage
      .mockResolvedValueOnce(window)
      .mockRejectedValueOnce(new Error("snapshot too old"));
    const sections = await assignmentDashboardService(emptyDb as never).sections("company-1", testActor, new Date("2026-10-21T12:00:00.000Z"));
    expect(sections.costsToday).toEqual(window);
    expect(sections.costsThisWeek).toEqual({ error: "Section unavailable" });
    expect(sections.activeAssignments).toEqual({ items: [] });
    expect(sections.needsYou?.error).toBeUndefined();
  });

  it("marks only the database-backed sections when the database reads fail, without leaking details", async () => {
    coverage.mockResolvedValue(window);
    const sections = await assignmentDashboardService(brokenDb as never).sections("company-1", testActor, new Date("2026-10-21T12:00:00.000Z"));
    expect(sections.activeAssignments).toEqual({ error: "Section unavailable" });
    expect(sections.needsYou).toEqual({ error: "Section unavailable" });
    expect(sections.costsToday).toEqual(window);
    expect(sections.costsThisWeek).toEqual(window);
    expect(JSON.stringify(sections)).not.toContain("approvals");
  });
});
