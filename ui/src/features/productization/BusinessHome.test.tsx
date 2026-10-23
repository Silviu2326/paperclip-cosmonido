// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessHome } from "./BusinessHome";

const seen = vi.hoisted(() => ({ props: null as null | { initialPath: string; initialDays: number } }));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key, i18n: { language: "es" } }),
}));
vi.mock("@/lib/router", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> };
});
vi.mock("@/api/companies-query", () => ({ useAccountIdentity: () => ({ settled: true, userId: "user-1" }) }));
vi.mock("@/api/client", () => ({ requestResponse: vi.fn(async () => new Response(JSON.stringify({ path: "entrepreneur", connections: [] }))) }));
vi.mock("@/api/response", () => ({ readApiJson: async (response: Response) => response.json() }));
vi.mock("@/components/crm/OpportunityForecastPanel", () => ({ OpportunityForecastPanel: () => null }));
vi.mock("@/pages/OutcomeMetrics", () => ({
  OutcomeMetrics: (props: { initialPath: string; initialDays: number }) => { seen.props = props; return <div data-testid="metrics" />; },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Where() { return <output data-testid="where">{useLocation().search}</output>; }

async function render(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><BusinessHome companyId="c1" /><Where /></MemoryRouter></QueryClientProvider>);
  });
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
}

beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); seen.props = null; });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("keeps the results block closed unless the URL asks for it", async () => {
  await render("/dashboard");
  expect(container.querySelector('[data-testid="metrics"]')).toBeNull();
});

it("opens the results block with the path and period from the URL", async () => {
  await render("/dashboard?results=1&path=agency&days=90");
  expect(container.querySelector('[data-testid="metrics"]')).not.toBeNull();
  expect(seen.props).toMatchObject({ initialPath: "agency", initialDays: 90 });
});

it("falls back to the saved path and 30 days when the URL values are invalid", async () => {
  await render("/dashboard?results=1&path=bogus&days=14");
  expect(seen.props).toMatchObject({ initialPath: "entrepreneur", initialDays: 30 });
});
