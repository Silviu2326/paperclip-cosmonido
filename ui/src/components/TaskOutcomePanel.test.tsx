// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskOutcomePanel, TaskStandaloneReviewPanel } from "./TaskOutcomePanel";

const mockApi = vi.hoisted(() => ({
  getForIssue: vi.fn(),
  contextUsage: vi.fn(),
}));
const mockLocation = vi.hoisted(() => ({ hash: "" }));

vi.mock("@/api/assignments", () => ({ assignmentsApi: mockApi }));
vi.mock("@/lib/router", () => ({ useLocation: () => mockLocation }));
vi.mock("@/components/DeliverableReviewPanel", () => ({
  DeliverableReviewPanel: () => <div data-testid="deliverable-review-panel" />,
}));

describe("TaskOutcomePanel", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockLocation.hash = "";
    mockApi.getForIssue.mockReset();
    mockApi.contextUsage.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
  });

  async function render(issueId = "issue-root-1") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const mountedRoot = createRoot(container);
    root = mountedRoot;
    await act(async () => {
      mountedRoot.render(<QueryClientProvider client={client}><TaskOutcomePanel issueId={issueId} /><TaskStandaloneReviewPanel issueId={issueId} /></QueryClientProvider>);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  it("opens the common result disclosure from the assignment legacy hash and defers context and review until open", async () => {
    mockLocation.hash = "#outcome";
    mockApi.getForIssue.mockResolvedValue({
      id: "assignment-1",
      rootIssueId: "issue-root-1",
      acceptanceCriteria: "Has a verified source",
      expectedDeliverable: "Source file",
      budgetCents: 0,
      assignmentStatus: "awaiting_review",
    });

    await render();

    const disclosure = container.querySelector<HTMLDetailsElement>("details[data-testid='task-outcome-review']");
    expect(disclosure?.open).toBe(true);
    expect(container.querySelector("#outcome")).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="deliverable-review-panel"]')).toHaveLength(1);
    expect(mockApi.getForIssue).toHaveBeenCalledExactlyOnceWith("issue-root-1");
    expect(mockApi.contextUsage).not.toHaveBeenCalled();
  });

  it("keeps review controls unmounted while a result disclosure is collapsed", async () => {
    mockApi.getForIssue.mockResolvedValue({
      id: "assignment-1",
      rootIssueId: "issue-root-1",
      acceptanceCriteria: "Has a verified source",
      expectedDeliverable: null,
      budgetCents: 0,
      assignmentStatus: "awaiting_review",
    });
    await render();
    expect(container.querySelector<HTMLDetailsElement>("details[data-testid='task-outcome-review']")?.open).toBe(false);
    expect(container.querySelector('[data-testid="deliverable-review-panel"]')).toBeNull();
  });

  it("adds no outcome surface for a simple task", async () => {
    mockApi.getForIssue.mockResolvedValue(null);
    await render();
    expect(container.querySelector("[data-testid='task-outcome-review']")).toBeNull();
    expect(container.querySelectorAll('[data-testid="deliverable-review-panel"]')).toHaveLength(1);
  });
});
