import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, costEvents, createDb, goals, issues, issueWorkProducts } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { assignmentCostService, resolveGoalIdForIssue } from "../services/assignment-costs.js";
import { deriveAssignmentStatus, utcDayStart, utcWeekStart } from "../services/assignment-dashboard.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres assignment cost tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describe("deriveAssignmentStatus", () => {
  it("prefers pending reviews, then requested changes, then acceptance", () => {
    expect(deriveAssignmentStatus({ goalStatus: "active", rootIssueStatus: "in_progress", reviewStates: ["pending"] })).toBe("awaiting_review");
    expect(deriveAssignmentStatus({ goalStatus: "active", rootIssueStatus: "todo", reviewStates: ["changes_requested"] })).toBe("changes_requested");
    expect(deriveAssignmentStatus({ goalStatus: "achieved", rootIssueStatus: "done", reviewStates: ["accepted"] })).toBe("accepted");
    expect(deriveAssignmentStatus({ goalStatus: "cancelled", rootIssueStatus: "todo", reviewStates: ["pending"] })).toBe("cancelled");
    expect(deriveAssignmentStatus({ goalStatus: "planned", rootIssueStatus: null, reviewStates: [] })).toBe("planned");
    expect(deriveAssignmentStatus({ goalStatus: "active", rootIssueStatus: "in_progress", reviewStates: [] })).toBe("in_progress");
  });
});

describe("dashboard cost windows", () => {
  it("anchors today and the week (Monday) to UTC", () => {
    const now = new Date("2026-10-21T15:30:00.000Z"); // Wednesday
    expect(utcDayStart(now).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(utcWeekStart(now).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(utcWeekStart(new Date("2026-10-18T10:00:00.000Z")).toISOString()).toBe("2026-10-12T00:00:00.000Z"); // Sunday
  });
});

describeEmbeddedPostgres("assignment cost attribution", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-assignment-costs-");
    db = createDb(tempDb.connectionString);
  }, 90_000);

  afterEach(async () => {
    await db.delete(costEvents);
    await db.delete(issueWorkProducts);
    await db.update(goals).set({ rootIssueId: null });
    await db.delete(issues);
    await db.delete(goals);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed() {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    await db.insert(companies).values([
      { id: companyId, name: "Costs", issuePrefix: `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}` },
      { id: otherCompanyId, name: "Other", issuePrefix: `O${otherCompanyId.replace(/-/g, "").slice(0, 6).toUpperCase()}` },
    ]);
    await db.insert(agents).values([
      { id: agentId, companyId, name: "Editor", role: "engineer", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {} },
      { id: otherAgentId, companyId: otherCompanyId, name: "Other", role: "engineer", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {} },
    ]);
    return { companyId, otherCompanyId, agentId, otherAgentId };
  }

  async function assignment(companyId: string, title: string, rootIssueId: string, budgetCents: number | null = null) {
    const [goal] = await db.insert(goals).values({ companyId, title, kind: "assignment", status: "active", budgetCents, rootIssueId }).returning();
    return goal;
  }

  function event(companyId: string, agentId: string, over: Partial<typeof costEvents.$inferInsert>) {
    return {
      companyId, agentId, provider: "openai", biller: "openai", billingType: "metered_api", model: "gpt",
      costCents: 100, occurredAt: new Date(), inputTokens: 10, outputTokens: 5, ...over,
    } satisfies typeof costEvents.$inferInsert;
  }

  it("sums descendant task cost, reports unattributed explicitly and ignores other companies", async () => {
    const { companyId, otherCompanyId, agentId, otherAgentId } = await seed();
    const rootId = randomUUID();
    const childId = randomUUID();
    const grandchildId = randomUUID();
    const strayId = randomUUID();
    await db.insert(issues).values([
      { id: rootId, companyId, title: "Root" },
      { id: childId, companyId, title: "Child", parentId: rootId },
      { id: grandchildId, companyId, title: "Grandchild", parentId: childId },
      { id: strayId, companyId, title: "Unrelated" },
    ]);
    const goal = await assignment(companyId, "Video series", rootId, 1000);
    await db.insert(costEvents).values([
      event(companyId, agentId, { issueId: rootId, costCents: 100 }),
      event(companyId, agentId, { issueId: childId, costCents: 200 }),
      // Immutable legacy receipt without goal: attributed through the tree.
      event(companyId, agentId, { issueId: grandchildId, costCents: 300 }),
      // Stamped receipt for the same goal stays counted once.
      event(companyId, agentId, { issueId: grandchildId, goalId: goal.id, costCents: 50 }),
      event(companyId, agentId, { issueId: strayId, costCents: 40 }),
      event(companyId, agentId, { costCents: 10 }),
      event(otherCompanyId, otherAgentId, { costCents: 9999 }),
    ]);

    const service = assignmentCostService(db);
    const report = await service.byGoal(companyId, { allTime: true });
    const row = report.rows.find((candidate) => candidate.goalId === goal.id);
    expect(row?.costCents).toBe(650);
    expect(row?.budgetCents).toBe(1000);
    expect(report.unattributed.costCents).toBe(50);
    expect(report.unattributed.eventCount).toBe(2);
    expect(report.total.costCents).toBe(700);
    expect(report.rows.reduce((sum, candidate) => sum + candidate.costCents, 0) + report.unattributed.costCents).toBe(report.total.costCents);

    const summary = await service.goalSummary(companyId, goal.id);
    expect(summary.total.costCents).toBe(650);
    expect(summary.remainingBudgetCents).toBe(350);
    expect(summary.overBudget).toBe(false);
    expect(summary.byAgent).toHaveLength(1);
    expect(summary.byAgent[0]?.agentName).toBe("Editor");

    await expect(service.goalSummary(otherCompanyId, goal.id)).rejects.toMatchObject({ status: 404 });
    const otherReport = await service.byGoal(otherCompanyId, { allTime: true });
    expect(otherReport.rows).toHaveLength(0);
    expect(otherReport.total.costCents).toBe(9999);
  });

  it("never counts a task with several work products more than once", async () => {
    const { companyId, agentId } = await seed();
    const rootId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      { id: rootId, companyId, title: "Root" },
      { id: childId, companyId, title: "Child", parentId: rootId },
    ]);
    const goal = await assignment(companyId, "Deliverables", rootId);
    await db.insert(issueWorkProducts).values([
      { companyId, issueId: childId, type: "media", provider: "paperclip", title: "Cut A", status: "active", isPrimary: true },
      { companyId, issueId: childId, type: "media", provider: "paperclip", title: "Cut B", status: "active" },
      { companyId, issueId: childId, type: "document", provider: "paperclip", title: "Notes", status: "active" },
    ]);
    await db.insert(costEvents).values([
      event(companyId, agentId, { issueId: childId, costCents: 120 }),
      event(companyId, agentId, { issueId: rootId, costCents: 30 }),
    ]);

    const summary = await assignmentCostService(db).goalSummary(companyId, goal.id);
    expect(summary.total.costCents).toBe(150);
    expect(summary.byDeliverable.reduce((sum, row) => sum + row.costCents, 0)).toBe(150);
    expect(summary.byDeliverable.find((row) => row.title === "Cut A")?.costCents).toBe(120);
    expect(summary.byDeliverable.find((row) => row.workProductId === null)?.costCents).toBe(30);
  });

  it("attributes nested assignments to the nearest root only", async () => {
    const { companyId, agentId } = await seed();
    const outerRoot = randomUUID();
    const innerRoot = randomUUID();
    const innerChild = randomUUID();
    await db.insert(issues).values([
      { id: outerRoot, companyId, title: "Outer" },
      { id: innerRoot, companyId, title: "Inner", parentId: outerRoot },
      { id: innerChild, companyId, title: "Inner child", parentId: innerRoot },
    ]);
    const outer = await assignment(companyId, "Outer", outerRoot);
    const inner = await assignment(companyId, "Inner", innerRoot);
    await db.insert(costEvents).values([
      event(companyId, agentId, { issueId: innerChild, costCents: 70 }),
      event(companyId, agentId, { issueId: outerRoot, costCents: 30 }),
    ]);

    const report = await assignmentCostService(db).byGoal(companyId, { allTime: true });
    expect(report.rows.find((row) => row.goalId === inner.id)?.costCents).toBe(70);
    expect(report.rows.find((row) => row.goalId === outer.id)?.costCents).toBe(30);
    expect(report.total.costCents).toBe(100);
    expect(await resolveGoalIdForIssue(db, companyId, innerChild)).toBe(inner.id);
    expect(await resolveGoalIdForIssue(db, companyId, outerRoot)).toBe(outer.id);
  });

  it("keeps fractional-cent spend exact and flags a sub-cent overrun", async () => {
    const { companyId, agentId } = await seed();
    const rootId = randomUUID();
    await db.insert(issues).values({ id: rootId, companyId, title: "Root" });
    const goal = await assignment(companyId, "Tiny", rootId, 0);
    await db.insert(costEvents).values([
      event(companyId, agentId, { issueId: rootId, costCents: 0.1 }),
      event(companyId, agentId, { issueId: rootId, costCents: 0.2 }),
      event(companyId, agentId, { costCents: 0.0000001 }),
    ]);

    const service = assignmentCostService(db);
    const summary = await service.goalSummary(companyId, goal.id);
    expect(summary.total.costCentsExact).toBe("0.3000000");
    expect(summary.total.costCents).toBe(0.3);
    expect(summary.overBudget).toBe(true);
    expect(summary.remainingBudgetCents).toBe(0);

    const report = await service.byGoal(companyId, { allTime: true });
    expect(report.unattributed.costCentsExact).toBe("0.0000001");
    expect(report.total.costCentsExact).toBe("0.3000001");
  });

  it("reports coverage and pricing completeness for a window", async () => {
    const { companyId, agentId } = await seed();
    const rootId = randomUUID();
    await db.insert(issues).values({ id: rootId, companyId, title: "Root" });
    await assignment(companyId, "Covered", rootId);
    const now = new Date();
    await db.insert(costEvents).values([
      event(companyId, agentId, { issueId: rootId, costCents: 75, occurredAt: now }),
      event(companyId, agentId, { costCents: 25, occurredAt: now, costStatus: "unpriced" }),
    ]);

    const windowStart = new Date(now.getTime() - 60_000);
    const coverage = await assignmentCostService(db).coverage(companyId, windowStart, new Date(now.getTime() + 60_000));
    expect(coverage.spendCents).toBe(100);
    expect(coverage.assignmentCents).toBe(75);
    expect(coverage.unattributedCents).toBe(25);
    expect(coverage.coveragePercent).toBe(75);
    expect(coverage.pricingComplete).toBe(false);
  });
});
