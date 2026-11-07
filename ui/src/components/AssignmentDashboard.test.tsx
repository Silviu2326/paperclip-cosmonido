// @vitest-environment node

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import type { DashboardCostWindow, DashboardSummary } from "@paperclipai/shared";
import { AssignmentDashboard } from "./AssignmentDashboard";

const mockDialogActions = vi.hoisted(() => ({ openNewIssue: vi.fn() }));
beforeEach(async () => { await i18n.changeLanguage("en"); });
vi.mock("../context/DialogContext", () => ({ useDialogActions: () => mockDialogActions }));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

const costWindow: DashboardCostWindow = {
  spendCents: 1250,
  eventCount: 4,
  assignmentCents: 1000,
  unattributedCents: 250,
  coveragePercent: 80,
  pricingComplete: true,
  from: "2026-10-21T00:00:00.000Z",
  to: "2026-10-21T12:00:00.000Z",
};

function summary(overrides: Partial<DashboardSummary>): DashboardSummary {
  return {
    companyId: "company-1",
    agents: { active: 0, running: 0, paused: 0, error: 0 },
    tasks: { open: 0, inProgress: 0, blocked: 0, done: 0 },
    costs: { monthSpendCents: 0, monthBudgetCents: 0, monthUtilizationPercent: 0 },
    pendingApprovals: 0,
    budgets: { activeIncidents: 0, pendingApprovals: 0, pausedAgents: 0, pausedProjects: 0 },
    runActivity: [],
    ...overrides,
  };
}

describe("AssignmentDashboard", () => {
  it("renders nothing for servers that do not send the new sections", () => {
    expect(renderToStaticMarkup(<AssignmentDashboard data={summary({})} />)).toBe("");
  });

  it("links every item to its action", () => {
    const html = renderToStaticMarkup(
      <AssignmentDashboard
        data={summary({
          activeAssignments: {
            items: [{
              id: "goal-1", title: "Launch series", status: "in_progress", assigneeAgentId: "agent-1",
              assigneeName: "Editor", rootIssueId: "issue-1", spendCents: 500, budgetCents: 2000,
              lastEventAt: "2026-10-21T10:00:00.000Z", href: "/assignments/goal-1",
            }],
          },
          needsYou: {
            items: [
              { kind: "approval", id: "approval-1", title: "hire_agent", createdAt: "2026-10-21T09:00:00.000Z", href: "/approvals/approval-1" },
              { kind: "decision", id: "decision-1", title: "Pick a tone", createdAt: "2026-10-21T09:30:00.000Z", href: "/decisions" },
              { kind: "deliverable_review", id: "review-1", title: "Launch series", createdAt: "2026-10-21T09:45:00.000Z", href: "/assignments/goal-1" },
            ],
            counts: { approvals: 1, decisions: 1, deliverableReviews: 1 },
          },
          costsToday: costWindow,
          costsThisWeek: { ...costWindow, spendCents: 9000 },
        })}
      />,
    );
    expect(html).toContain('href="/assignments/goal-1"');
    expect(html).toContain('href="/approvals/approval-1"');
    expect(html).toContain('href="/decisions"');
    expect(html).toContain('href="/costs"');
    expect(html).toContain("Launch series");
    expect(html).toContain("$12.50");
    expect(html).toContain("$90.00");
    expect(html).toContain("80% in tasks with results");
  });

  it("shows an error in the failing section only", () => {
    const html = renderToStaticMarkup(
      <AssignmentDashboard
        data={summary({
          activeAssignments: { items: [{
            id: "goal-1", title: "Still visible", status: "planned", assigneeAgentId: null, assigneeName: null,
            rootIssueId: null, spendCents: 0, budgetCents: null, lastEventAt: null, href: "/assignments/goal-1",
          }] },
          needsYou: { error: "approvals table unavailable" },
          costsToday: costWindow,
          costsThisWeek: { error: "timeout" },
        })}
      />,
    );
    expect(html).toContain("Still visible");
    expect(html).toContain("approvals table unavailable");
    expect(html).toContain("timeout");
    expect(html).toContain("$12.50");
    expect(html.match(/role="alert"/g)?.length).toBe(3);
  });

  it("keeps each of the other sections usable when any single section fails", () => {
    const active = { items: [{
      id: "goal-1", title: "Active title", status: "in_progress", assigneeAgentId: null, assigneeName: "Editor",
      rootIssueId: null, spendCents: 0, budgetCents: null, lastEventAt: null, href: "/assignments/goal-1",
    }] };
    const needs = {
      items: [{ kind: "deliverable_review" as const, id: "review-1", title: "Review title", createdAt: "2026-10-21T09:45:00.000Z", href: "/issues/issue-9" }],
      counts: { approvals: 0, decisions: 0, deliverableReviews: 1 },
    };
    const base = { activeAssignments: active, needsYou: needs, costsToday: costWindow, costsThisWeek: costWindow };

    const activeFailed = renderToStaticMarkup(<AssignmentDashboard data={summary({ ...base, activeAssignments: { error: "boom" } })} />);
    expect(activeFailed).toContain("boom");
    expect(activeFailed).toContain("Review title");
    expect(activeFailed).toContain('href="/issues/issue-9"');
    expect(activeFailed).toContain("$12.50");
    expect(activeFailed.match(/role="alert"/g)?.length).toBe(1);

    const costsFailed = renderToStaticMarkup(
      <AssignmentDashboard data={summary({ ...base, costsToday: { error: "no today" }, costsThisWeek: { error: "no week" } })} />,
    );
    expect(costsFailed).toContain("Active title");
    expect(costsFailed).toContain("Review title");
    expect(costsFailed).toContain("no today");
    expect(costsFailed).toContain("no week");
    expect(costsFailed).toContain('href="/costs"');
    expect(costsFailed.match(/role="alert"/g)?.length).toBe(2);
  });

  it("still renders every card, with an error each, when all sections fail", () => {
    const html = renderToStaticMarkup(
      <AssignmentDashboard
        data={summary({
          activeAssignments: { error: "a" }, needsYou: { error: "b" }, costsToday: { error: "c" }, costsThisWeek: { error: "d" },
        })}
      />,
    );
    expect(html).not.toContain("assignment-dashboard-empty");
    for (const id of ["active", "decisions", "reviews", "costs"]) expect(html).toContain(`data-testid="assignment-dashboard-${id}"`);
    expect(html.match(/role="alert"/g)?.length).toBe(5);
    expect(html).toContain('href="/costs"');
  });

  it("sends decisions and reviews to separate cards", () => {
    const html = renderToStaticMarkup(
      <AssignmentDashboard
        data={summary({
          activeAssignments: { items: [] },
          needsYou: {
            items: [
              { kind: "approval", id: "a1", title: "hire_agent", createdAt: "2026-10-21T09:00:00.000Z", href: "/approvals/a1" },
              { kind: "deliverable_review", id: "r1", title: "Cut A", createdAt: "2026-10-21T09:10:00.000Z", href: "/assignments/goal-1" },
            ],
            counts: { approvals: 1, decisions: 0, deliverableReviews: 1 },
          },
          costsToday: costWindow,
          costsThisWeek: costWindow,
        })}
      />,
    );
    const decisions = html.slice(html.indexOf('data-testid="assignment-dashboard-decisions"'), html.indexOf('data-testid="assignment-dashboard-reviews"'));
    const reviews = html.slice(html.indexOf('data-testid="assignment-dashboard-reviews"'), html.indexOf('data-testid="assignment-dashboard-costs"'));
    expect(decisions).toContain('href="/approvals/a1"');
    expect(decisions).not.toContain("Cut A");
    expect(reviews).toContain('href="/assignments/goal-1"');
    expect(reviews).not.toContain("hire_agent");
  });

  it("offers to create a new task when there is no data", () => {
    const html = renderToStaticMarkup(
      <AssignmentDashboard
        data={summary({
          activeAssignments: { items: [] },
          needsYou: { items: [], counts: { approvals: 0, decisions: 0, deliverableReviews: 0 } },
          costsToday: { ...costWindow, spendCents: 0, eventCount: 0, assignmentCents: 0, unattributedCents: 0, coveragePercent: null },
          costsThisWeek: { ...costWindow, spendCents: 0, coveragePercent: null },
        })}
      />,
    );
    expect(html).toContain('data-testid="assignment-dashboard-empty"');
    expect(html).toContain("New task");
    expect(html).toContain("<button");
    expect(html).not.toContain('href="/assignments"');
  });
});
