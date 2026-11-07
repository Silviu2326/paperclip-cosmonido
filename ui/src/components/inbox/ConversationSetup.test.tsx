// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConversationSetup } from "./ConversationSetup";
import { channelsApi, type ChannelAccount } from "@/api/channels";
import { webchatApi } from "@/api/webchat";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { t } from "@/i18n";

const state = vi.hoisted(() => ({ breadcrumbs: vi.fn() }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: 'company-a', selectedCompany: { name: 'Company A' } }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: state.breadcrumbs }) }));
vi.mock("@/api/companies-query", () => ({ useAccountIdentity: () => ({ settled: true, userId: 'user-a' }) }));
vi.mock("@/features/productization/ConversationDispatchSettings", () => ({ ConversationDispatchSettings: () => null }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a> }));
vi.mock("@/api/channels", () => ({ channelsApi: { list: vi.fn() } }));
vi.mock("@/api/webchat", () => ({ webchatApi: { getSettings: vi.fn(), saveSettings: vi.fn() } }));
vi.mock("@/api/chatEndpoints", () => ({ chatEndpointsApi: { list: vi.fn() } }));

let root: Root; let container: HTMLDivElement; let client: QueryClient;
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    if (check()) return;
  }
  throw new Error(`Expected setup state not reached: ${container.textContent}`);
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function render(companyId = 'company-a') {
  await act(async () => root.render(<QueryClientProvider client={client}><ConversationSetup key={companyId} companyId={companyId} /></QueryClientProvider>));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(channelsApi.list).mockReset().mockResolvedValue([]);
  vi.mocked(chatEndpointsApi.list).mockReset().mockResolvedValue([]);
  vi.mocked(webchatApi.getSettings).mockReset().mockResolvedValue({ active: false, greeting: null, brandColor: null });
  vi.mocked(webchatApi.saveSettings).mockReset().mockImplementation(async (_id, value) => value);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("opens setup on first entry, saves actual web chat settings, and keeps the real widget test available", async () => {
  await render();
  await waitFor(() => container.textContent!.includes(t('conversations.setup.state.disconnected')));
  expect(container.textContent).toContain(t('conversations.setup.title'));
  await click(t('conversations.setup.connect', { channel: t('conversations.channel.webchat') }));
  await waitFor(() => !!container.querySelector('#webchat-active'));
  await act(async () => (container.querySelector('#webchat-active') as HTMLButtonElement).click());
  await click(t('webchat.save'));
  await waitFor(() => container.textContent!.includes(t('conversations.setup.openTest')));
  expect(webchatApi.saveSettings).toHaveBeenCalledWith('company-a', { active: true, greeting: null, brandColor: null });
  await click(t('conversations.setup.openTest'));
  const frame = container.querySelector('iframe')!;
  expect(frame.srcdoc).toContain('/api/p/company-a/widget.js');
  expect(frame.srcdoc).not.toContain('Bearer');
  expect(container.textContent).toContain(t('conversations.setup.testHelp'));
  await click(t('conversations.setup.viewInbox'));
  expect(container.querySelector('iframe')).toBeNull();
});

it("uses server state after reload and never carries company A setup into company B", async () => {
  vi.mocked(webchatApi.getSettings).mockImplementation(async (id) => ({ active: id === 'company-a', greeting: null, brandColor: null }));
  await render();
  await waitFor(() => container.textContent!.includes(t('conversations.setup.manageTitle')));
  expect(container.querySelectorAll('[aria-pressed]').length).toBe(0);
  await render('company-b');
  await waitFor(() => container.textContent!.includes(t('conversations.setup.title')) && container.querySelectorAll('[aria-pressed]').length === 7);
  expect(webchatApi.getSettings).toHaveBeenCalledWith('company-b');
});

it("keeps failures distinct from missing connections and retries the failed source", async () => {
  vi.mocked(channelsApi.list).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([]);
  await render();
  await waitFor(() => !!container.querySelector('[role="alert"]'));
  const whatsapp = [...container.querySelectorAll('button')].find((node) => node.textContent!.includes('WhatsApp'))!;
  expect(whatsapp.disabled).toBe(true);
  await click(t('conversations.setup.retry'));
  await waitFor(() => !container.querySelector('[role="alert"]'));
  expect(channelsApi.list).toHaveBeenCalledTimes(2);
});

it("does not call untested or failed provider credentials verified", async () => {
  vi.mocked(channelsApi.list).mockResolvedValue([
    { id: 'account-1', kind: 'whatsapp', status: 'active', lastTestedAt: null, lastTestError: null },
    { id: 'account-2', kind: 'telegram', status: 'active', lastTestedAt: '2026-01-01', lastTestError: 'Bad token' },
  ] as ChannelAccount[]);
  await render();
  await waitFor(() => container.textContent!.includes(t('conversations.setup.state.attention')));
  expect(container.textContent).toContain(t('conversations.setup.state.pending'));
  expect(container.textContent).not.toContain(t('conversations.setup.state.verified'));
});
