// @vitest-environment node

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import type { AssignmentCostTotals, GoalCostReport, GoalCostSummary } from "@paperclipai/shared";
import { AssignmentCostsReportView, AssignmentCostsView } from "./AssignmentCosts";
beforeEach(async () => { await i18n.changeLanguage("en"); });

vi.mock("@/lib/router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

function totals(costCents: number, eventCount = 1): AssignmentCostTotals {
  return {
    eventCount, estimatedEventCount: 0, unpricedEventCount: 0, costCents,
    costCentsExact: `${costCents}.0000000`, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
  };
}

const summary: GoalCostSummary = {
  companyId: "company-1", goalId: "goal-1", title: "Video series", kind: "assignment",
  budgetCents: 1000, remainingBudgetCents: 350, overBudget: false,
  total: totals(650, 3),
  byAgent: [
    { agentId: "agent-1", agentName: "Editor", ...totals(600, 2) },
    { agentId: null, agentName: null, ...totals(50) },
  ],
  byProvider: [
    { provider: "openai", usageKind: "llm", ...totals(600, 2) },
    { provider: "elevenlabs", usageKind: "media", ...totals(50) },
  ],
  byDeliverable: [
    { workProductId: "wp-1", title: "Cut A", issueId: "issue-1", ...totals(500) },
    { workProductId: null, title: null, issueId: null, ...totals(150, 2) },
  ],
  unattributed: totals(50),
};

describe("AssignmentCostsView", () => {
  it("shows spend against budget with the unattributed bucket and deliverable links", () => {
    const html = renderToStaticMarkup(<AssignmentCostsView summary={summary} />);
    expect(html).toContain("$6.50");
    expect(html).toContain("$10.00");
    expect(html).toContain('aria-valuenow="65"');
    expect(html).toContain('href="/agents/agent-1"');
    expect(html).toContain('href="/issues/issue-1"');
    expect(html).toContain("Cut A");
    expect(html).toContain("No agent (unattributed)");
    expect(html).toContain("Not tied to a deliverable");
    expect(html).toContain("media");
    expect(html).not.toContain("spent more than its budget");
  });

  it("flags an overrun, including a zero budget, and caps the bar", () => {
    const over = renderToStaticMarkup(<AssignmentCostsView summary={{ ...summary, total: totals(1500), remainingBudgetCents: 0, overBudget: true }} />);
    expect(over).toContain("exceeded its budget");
    expect(over).toContain('aria-valuenow="100"');

    const zero = renderToStaticMarkup(<AssignmentCostsView summary={{ ...summary, budgetCents: 0, remainingBudgetCents: 0, overBudget: true }} />);
    expect(zero).toContain("exceeded its budget");
    expect(zero).not.toContain("progressbar");

    const none = renderToStaticMarkup(<AssignmentCostsView summary={{ ...summary, budgetCents: null, remainingBudgetCents: null }} />);
    expect(none).toContain("No budget set");
  });
});

describe("AssignmentCostsReportView", () => {
  const report: GoalCostReport = {
    companyId: "company-1",
    rows: [
      { goalId: "goal-1", title: "Video series", kind: "assignment", status: "active", budgetCents: 1000, ...totals(650, 3) },
      { goalId: "goal-2", title: "Plain goal", kind: "goal", status: "active", budgetCents: null, ...totals(200) },
    ],
    unattributed: totals(50),
    total: totals(900, 5),
  };

  it("links assignments, folds plain goals together and always shows unattributed", () => {
    const html = renderToStaticMarkup(<AssignmentCostsReportView report={report} />);
    expect(html).toContain("Costs by task with a result");
    expect(html).toContain('href="/assignments/goal-1"');
    expect(html).not.toContain('href="/assignments/goal-2"');
    expect(html).toContain("Other goals");
    expect(html).toContain('data-testid="costs-unattributed"');
    expect(html).toContain("$0.50");
  });

  it("shows the empty state only when there is nothing at all", () => {
    const empty = { ...report, rows: [], unattributed: totals(0, 0), total: totals(0, 0) };
    expect(renderToStaticMarkup(<AssignmentCostsReportView report={empty} />)).toContain("No tasks with results yet.");
    const onlyUnattributed = { ...empty, unattributed: totals(50) };
    const html = renderToStaticMarkup(<AssignmentCostsReportView report={onlyUnattributed} />);
    expect(html).not.toContain("No tasks with results yet.");
    expect(html).toContain('data-testid="costs-unattributed"');
  });
});
