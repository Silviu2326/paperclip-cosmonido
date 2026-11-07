// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AutonomyMatrixCell } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autonomy } from "./Autonomy";
import { i18n } from "../i18n";
import { DEFAULT_LOCALE } from "../i18n/locales";

const mockSearch = vi.hoisted(() => ({ params: new URLSearchParams(), setParams: vi.fn() }));
const mockAutonomyApi = vi.hoisted(() => ({ matrix: vi.fn() }));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
  useSearchParams: () => [mockSearch.params, mockSearch.setParams],
}));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-1" }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }));
vi.mock("@/api/autonomy", () => ({ autonomyApi: mockAutonomyApi }));
vi.mock("@/api/agents", () => ({ agentsApi: mockAgentsApi }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeCell(agentId: string): AutonomyMatrixCell {
  return {
    agentId,
    actionType: "email",
    level: "draft_only",
    source: "default",
    policyId: null,
    stats: { agentId, actionType: "email", drafts: 0, sentUnchanged: 0, edited: 0, rejected: 0, unchangedRatio: null, windowDays: 14 },
    latestBench: null,
    canRaise: false,
    nextLevel: null,
  } as AutonomyMatrixCell;
}

async function flushReact() {
  flushSync(() => {});
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("Autonomy agent filter", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  async function renderPage() {
    flushSync(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Autonomy />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
  }

  function rowNames(): string[] {
    return Array.from(container.querySelectorAll("tbody th[scope='row']")).map((cell) => cell.textContent ?? "");
  }

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockSearch.params = new URLSearchParams();
    mockSearch.setParams.mockClear();
    mockAutonomyApi.matrix.mockResolvedValue([makeCell("agent-1"), makeCell("agent-2")]);
    mockAgentsApi.list.mockResolvedValue([
      { id: "agent-1", name: "Alpha" },
      { id: "agent-2", name: "Beta" },
    ]);
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    queryClient.clear();
    container.remove();
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("shows every agent and a link back to the team when no agent is requested", async () => {
    await renderPage();

    expect(rowNames()).toEqual(["Alpha", "Beta"]);
    expect(container.querySelector('a[href="/agents/all"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("filters the matrix to the requested agent and can clear the filter", async () => {
    mockSearch.params = new URLSearchParams("agent=agent-2");
    await renderPage();

    expect(rowNames()).toEqual(["Beta"]);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Beta");

    const showAll = Array.from(container.querySelectorAll("button")).find((button) =>
      /show all agents|ver todos los agentes/i.test(button.textContent ?? ""),
    );
    expect(showAll).toBeDefined();
    flushSync(() => showAll!.click());

    expect(mockSearch.setParams).toHaveBeenCalledTimes(1);
    const update = mockSearch.setParams.mock.calls[0]![0] as (current: URLSearchParams) => URLSearchParams;
    expect(update(new URLSearchParams("agent=agent-2&other=1")).toString()).toBe("other=1");
  });

  it("does not pretend to filter when the requested agent has no autonomy rows", async () => {
    mockSearch.params = new URLSearchParams("agent=missing-agent");
    await renderPage();

    expect(rowNames()).toEqual(["Alpha", "Beta"]);
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/all agents are shown|todos los agentes/i);
  });
});
