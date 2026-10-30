// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConversationInbox } from "./ConversationInbox";
import { conversationsApi } from "@/api/conversations";

const state = vi.hoisted(() => ({ companyId: "company-a", breadcrumbs: vi.fn() }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: state.companyId }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: state.breadcrumbs }) }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("@/components/inbox/ConversationSetup", () => ({ ConversationSetup: () => <div>Channel setup</div> }));
vi.mock("@/api/conversations", () => ({ conversationsApi: { list: vi.fn() } }));
vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    if (check()) return;
  }
  throw new Error(`Expected state not reached: ${container.textContent}`);
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.companyId = "company-a";
  vi.mocked(conversationsApi.list).mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("loads conversations beyond 100 using cursors, then resets pagination when filters change", async () => {
  vi.mocked(conversationsApi.list).mockImplementation(async (companyId, query) => {
    const offset = Number(query?.cursor ?? 0);
    const count = query?.channel ? 1 : 125;
    return {
      items: Array.from({ length: Math.min(25, count - offset) }, (_, i) => ({
        id: `${companyId}-${offset + i}`, companyId, subject: `${query?.channel ?? 'All'} conversation ${offset + i}`, channel: "webchat", status: "open",
      } as Awaited<ReturnType<typeof conversationsApi.list>>['items'][number])),
      nextCursor: offset + 25 < count ? String(offset + 25) : null,
    };
  });
  await act(async () => root.render(<QueryClientProvider client={client}><ConversationInbox /></QueryClientProvider>));
  await waitFor(() => container.querySelectorAll("li").length === 25);
  for (let page = 2; page <= 5; page++) {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'conversations.list.loadMore')!;
    await act(async () => button.click());
    await waitFor(() => container.querySelectorAll('li').length === page * 25);
  }
  expect(container.textContent).toContain("All conversation 124");
  expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'conversations.list.loadMore')).toBe(false);
  expect(vi.mocked(conversationsApi.list).mock.calls.map(([, query]) => query?.cursor)).toEqual([undefined, '25', '50', '75', '100']);
  const channel = container.querySelectorAll('select')[1]!;
  await act(async () => { channel.value = 'webchat'; channel.dispatchEvent(new Event('change', { bubbles: true })); });
  await waitFor(() => container.querySelectorAll('li').length === 1);
  expect(conversationsApi.list).toHaveBeenLastCalledWith('company-a', expect.objectContaining({ channel: 'webchat', cursor: undefined }));
});

it("distinguishes a new inbox from an empty filtered result", async () => {
  vi.mocked(conversationsApi.list).mockResolvedValue({ items: [], nextCursor: null });
  await act(async () => root.render(<QueryClientProvider client={client}><ConversationInbox /></QueryClientProvider>));
  await waitFor(() => container.textContent!.includes('conversations.list.firstMessage'));
  await act(async () => [...container.querySelectorAll('button')].find((item) => item.textContent === 'conversations.tabs.waiting')!.click());
  await waitFor(() => container.textContent!.includes('conversations.list.empty'));
});
