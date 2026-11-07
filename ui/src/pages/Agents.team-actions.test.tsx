// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../context/ToastContext";
import { Agents } from "./Agents";
import { i18n } from "../i18n";
import { DEFAULT_LOCALE } from "../i18n/locales";

const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn(), org: vi.fn() }));
const mockOpenNewAgent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/agents/all", search: "", hash: "", state: null }),
  useNavigate: () => vi.fn(),
}));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-1" }) }));
vi.mock("../context/DialogContext", () => ({ useDialogActions: () => ({ openNewAgent: mockOpenNewAgent }) }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }));
vi.mock("../context/SidebarContext", () => ({ useSidebar: () => ({ isMobile: false }) }));
vi.mock("../api/agents", () => ({ agentsApi: mockAgentsApi }));
vi.mock("../api/builtInAgents", () => ({ builtInAgentsApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../api/environments", () => ({
  environmentsApi: { list: vi.fn().mockResolvedValue([]), capabilities: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: { liveRunsForCompany: vi.fn().mockResolvedValue([]) } }));
vi.mock("../api/instanceSettings", () => ({
  instanceSettingsApi: {
    get: vi.fn().mockResolvedValue({
      id: "instance-settings-1",
      defaultEnvironmentId: null,
      general: {
        censorUsernameInLogs: true,
        feedbackDataSharingPreference: "prompt",
        backupRetention: { dailyDays: 7, weeklyWeeks: 4, monthlyMonths: 1 },
        executionMode: "any",
      },
      experimental: {
        enableEnvironments: false,
        enableIsolatedWorkspaces: true,
        enableStreamlinedLeftNavigation: false,
        enableAgentChat: false,
        enableConferenceRoomChat: false,
        enableIssuePlanDecompositions: true,
        enableExperimentalFileViewer: false,
        enableExternalObjects: false,
        enableBuiltInAgents: false,
        autoRestartDevServerWhenIdle: false,
      },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    }),
  },
}));
vi.mock("../api/resourceMemberships", () => ({
  resourceMembershipsApi: {
    listMine: vi.fn().mockResolvedValue({
      projectMemberships: {},
      agentMemberships: {},
      starredProjectIds: [],
      starredAgentIds: [],
      projectStarredAt: {},
      agentStarredAt: {},
      updatedAt: null,
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "Alpha",
    urlKey: "alpha",
    role: "engineer",
    title: null,
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function flushReact() {
  flushSync(() => {});
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("Agents team actions", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  async function renderAgents() {
    flushSync(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Agents />
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
  }

  function hrefs(): string[] {
    return Array.from(container.querySelectorAll("a")).map((anchor) => anchor.getAttribute("href") ?? "");
  }

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockAgentsApi.list.mockResolvedValue([makeAgent()]);
    mockAgentsApi.org.mockResolvedValue([]);
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    queryClient.clear();
    container.remove();
    await i18n.changeLanguage(DEFAULT_LOCALE);
    vi.clearAllMocks();
  });

  it("keeps the roster and adds the team-template, skills, autonomy and office entries", async () => {
    await renderAgents();

    // The default view depends on the layout flag; the roster itself is the list view.
    const listToggle = container.querySelector<HTMLButtonElement>('button[aria-label="List view"], button[aria-label="Vista de lista"]');
    expect(listToggle).not.toBeNull();
    flushSync(() => listToggle!.click());
    await flushReact();

    expect(container.textContent).toContain("Alpha");
    const links = hrefs();
    expect(links).toContain("/productization#team");
    expect(links).toContain("/skills");
    expect(links).toContain("/autonomy");
    expect(links).toContain("/office");
    // Creating a team must not point at the editor that only saves drafts.
    expect(links).not.toContain("/business-builder");
  });

  it("still opens the single-agent dialog instead of forcing the team flow", async () => {
    await renderAgents();

    const newAgent = Array.from(container.querySelectorAll("button")).find((button) =>
      /new agent|nuevo agente/i.test(button.textContent ?? ""),
    );
    expect(newAgent).toBeDefined();
    flushSync(() => newAgent!.click());
    expect(mockOpenNewAgent).toHaveBeenCalledTimes(1);
  });

  it("still offers both entries when the company has no agents yet", async () => {
    mockAgentsApi.list.mockResolvedValue([]);
    await renderAgents();

    expect(hrefs()).toContain("/productization#team");
    const buttons = Array.from(container.querySelectorAll("button")).map((button) => button.textContent ?? "");
    expect(buttons.some((label) => /new agent|nuevo agente/i.test(label))).toBe(true);
  });
});
