// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConversationMessage } from "@paperclipai/shared";
import { ConversationDetail } from "./ConversationDetail";
import { conversationsApi } from "@/api/conversations";

const state = vi.hoisted(() => ({ id: "conversation-a", breadcrumbs: vi.fn() }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: 'company-a' }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: state.breadcrumbs }) }));
vi.mock("@/lib/router", () => ({ useParams: () => ({ conversationId: state.id }), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/api/conversations", () => ({ conversationsApi: { get: vi.fn(), messages: vi.fn() } }));
vi.mock("@/components/inbox/ConversationActions", () => ({ ConversationActions: () => null }));
vi.mock("@/components/inbox/ConversationComposer", () => ({ ConversationComposer: () => null }));
vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root; let container: HTMLDivElement; let client: QueryClient;
const message = (index: number): ConversationMessage => ({ id: `m-${index}`, body: `Message ${index}`, direction: 'inbound', deliveryStatus: 'delivered', createdAt: '2026-01-01T00:00:00Z' } as ConversationMessage);
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 80; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    if (check()) return;
  }
  throw new Error('Expected thread state not reached');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("shows the newest messages first and reaches history beyond 500 without duplicates", async () => {
  vi.mocked(conversationsApi.get).mockResolvedValue({ id: state.id, subject: 'Long thread', channel: 'webchat', status: 'open', messages: Array.from({ length: 50 }, (_, i) => message(500 + i)), nextMessageCursor: 'm-500' } as Awaited<ReturnType<typeof conversationsApi.get>>);
  vi.mocked(conversationsApi.messages).mockImplementation(async (_id, before) => {
    const end = Number(before.slice(2));
    return { items: Array.from({ length: 50 }, (_, i) => message(end - 50 + i)), nextCursor: end > 50 ? `m-${end - 50}` : null };
  });
  await act(async () => root.render(<QueryClientProvider client={client}><ConversationDetail /></QueryClientProvider>));
  await waitFor(() => container.querySelectorAll('[data-message-id]').length === 50);
  expect(container.querySelector('[data-message-id="m-549"]')).not.toBeNull();
  for (let page = 2; page <= 11; page++) {
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'conversations.thread.loadOlder')!.click());
    await waitFor(() => container.querySelectorAll('[data-message-id]').length === page * 50);
  }
  expect([...container.querySelectorAll('[data-message-id]')].map((node) => node.getAttribute('data-message-id'))).toEqual(Array.from({ length: 550 }, (_, i) => `m-${i}`));
  expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'conversations.thread.loadOlder')).toBe(false);
});
