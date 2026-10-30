// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Opportunity } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { Opportunities } from "./Opportunities";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { setBreadcrumbs, navigate } = vi.hoisted(() => ({ setBreadcrumbs: vi.fn(), navigate: vi.fn() }));
vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-1" }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs }) }));
vi.mock("@/lib/router", () => ({ useLocation: () => ({ pathname: "/QA/sales/opportunities", search: "" }), useNavigate: () => navigate, Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/api/crm", () => ({ crmApi: { opportunities: { list: vi.fn(), changeStage: vi.fn() } } }));
vi.mock("@/api/auth", () => ({ authApi: { getSession: async () => null } }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: async () => [] } }));
vi.mock("@/api/access", () => ({ accessApi: { listUserDirectory: async () => ({ users: [] }) } }));
vi.mock("@/components/crm/OpportunityForecastPanel", () => ({ OpportunityForecastPanel: () => null }));

const item = (id: string, title: string) => ({ id, companyId: "company-1", title, stageKey: "new", status: "open", version: 4, amountCents: 10000, currency: "EUR", nextAction: null, nextActionAt: null, ownerUserId: null, ownerAgentId: null } as Opportunity);

describe("sales pipeline", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    vi.mocked(crmApi.opportunities.list).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(crmApi.opportunities.changeStage).mockResolvedValue({ mode: "direct", opportunity: null, externalAction: { id: "action", status: "succeeded", mode: "direct" } });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ""; });
  async function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><Opportunities /></QueryClientProvider>); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  }
  function button(text: string) { return [...document.querySelectorAll("button")].find((node) => node.textContent === text)!; }
  async function click(node: HTMLElement) { await act(async () => { node.click(); await new Promise((resolve) => setTimeout(resolve, 30)); }); }

  it("starts in kanban, including empty stages and visible creation actions", async () => {
    await mount();
    expect(button("crm.opportunities.board").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("section[aria-label]")).toHaveLength(6);
    expect(button("salesWorkspace.newLead")).toBeTruthy();
    expect(button("crm.opportunities.create.title")).toBeTruthy();
    expect(crmApi.opportunities.list).toHaveBeenCalledWith("company-1", expect.objectContaining({ status: "open" }));
  });

  it("loads the next server page and keeps both sets of cards with an explicit partial-results notice", async () => {
    vi.mocked(crmApi.opportunities.list).mockImplementation(async (_company, query) => query?.cursor === "next" ? { items: [item("two", "Second deal")], nextCursor: null } : { items: [item("one", "First deal")], nextCursor: "next" });
    await mount();
    expect(document.body.textContent).toContain("salesWorkspace.partialResults");
    await click(button("salesWorkspace.loadMore"));
    expect(document.body.textContent).toContain("First deal"); expect(document.body.textContent).toContain("Second deal");
    expect(document.body.textContent).not.toContain("salesWorkspace.partialResults");
    expect(crmApi.opportunities.list).toHaveBeenCalledWith("company-1", expect.objectContaining({ cursor: "next" }));
  });

  it("asks for a loss reason before changing the stage and sends the loaded version", async () => {
    vi.mocked(crmApi.opportunities.list).mockResolvedValue({ items: [item("one", "Pilot")], nextCursor: null });
    await mount();
    const select = document.querySelector("article select") as HTMLSelectElement;
    act(() => { select.value = "lost"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(crmApi.opportunities.changeStage).not.toHaveBeenCalled();
    const reason = document.getElementById("lost-reason") as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reason, "Budget changed"); reason.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(crmApi.opportunities.changeStage).toHaveBeenCalledWith("one", { stageKey: "lost", expectedVersion: 4, reason: "Budget changed" });
  });
});
