// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationSettings } from "./NotificationSettings";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  pushConfig: vi.fn(),
  pushSubscriptions: vi.fn(),
  updatePreferences: vi.fn(),
  requestPermission: vi.fn(),
  identity: { settled: true, failed: false, userId: "user-1" as string | null },
}));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? "")),
  }),
}));
vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: unknown }) => <a href={to} {...rest}>{children as never}</a>,
}));
vi.mock("../api/companies-query", () => ({ useAccountIdentity: () => mocks.identity }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-1", selectedCompany: { id: "company-1", name: "Acme" } }) }));
vi.mock("../api/product-notifications", () => ({
  productNotificationsApi: {
    snapshot: mocks.snapshot,
    pushConfig: mocks.pushConfig,
    pushSubscriptions: mocks.pushSubscriptions,
    updatePreferences: mocks.updatePreferences,
  },
}));
vi.mock("../features/productization/notifications/browser-notification", () => ({
  clearForegroundProductNotifications: vi.fn(),
  requestBrowserNotificationPermission: mocks.requestPermission,
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function renderView(view?: "preferences" | "inbox") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  flushSync(() => root.render(<QueryClientProvider client={client}><NotificationSettings view={view} /></QueryClientProvider>));
}

beforeEach(() => {
  Object.assign(mocks.identity, { settled: true, failed: false, userId: "user-1" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.snapshot.mockResolvedValue({
    preferences: { companyId: "company-1", categories: ["decisions", "reviews", "tasks"], browserEnabled: false, remotePushEnabled: false, remotePushStatus: "disabled", whatsappStatus: "blocked_authorized_channel_required", updatedAt: new Date().toISOString() },
    items: [{ key: "decision:1", category: "decisions", title: "Approve the launch budget", summary: "Needs a board response", href: "/decisions/1", createdAt: new Date().toISOString(), revision: "1", sourceType: "decision", sourceId: "1" }],
    counts: { decisions: 1, reviews: 0, tasks: 0 },
  });
  mocks.pushConfig.mockResolvedValue({ enabled: false, publicKey: null });
  mocks.pushSubscriptions.mockResolvedValue([]);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("inbox view lists notices as links and never loads push queries or saves anything", async () => {
  renderView("inbox");
  await vi.waitFor(() => expect(container.textContent).toContain("Approve the launch budget"));
  expect(mocks.snapshot).toHaveBeenCalledWith("company-1");
  expect(mocks.pushConfig).not.toHaveBeenCalled();
  expect(mocks.pushSubscriptions).not.toHaveBeenCalled();
  expect(mocks.updatePreferences).not.toHaveBeenCalled();
  const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
  expect(hrefs).toContain("/decisions/1");
  expect(hrefs).toContain("/company/settings/notifications");
  expect(container.querySelector('[role="checkbox"]')).toBeNull();
  expect(container.textContent).toContain("nothing is approved or resolved from this list");
});

it("preferences view shows categories and destinations without mounting the feed", async () => {
  renderView();
  await vi.waitFor(() => expect(mocks.pushConfig).toHaveBeenCalledWith("company-1"));
  await vi.waitFor(() => expect(mocks.pushSubscriptions).toHaveBeenCalledWith("company-1"));
  await vi.waitFor(() => expect(container.querySelectorAll('[role="checkbox"]').length).toBe(3));
  expect(container.textContent).not.toContain("Approve the launch budget");
  expect(container.textContent).toContain("Remote web push");
  const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
  expect(hrefs).toContain("/inbox/notifications");
  expect(mocks.updatePreferences).not.toHaveBeenCalled();
});

it("does not save a permission response after leaving preferences", async () => {
  vi.stubGlobal("Notification", { permission: "default" });
  let resolvePermission!: (permission: string) => void;
  mocks.requestPermission.mockReturnValue(new Promise<string>((resolve) => { resolvePermission = resolve; }));
  renderView();
  await vi.waitFor(() => expect(container.querySelectorAll('[role="checkbox"]').length).toBe(3));
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Enable browser notices");
  expect(button).toBeDefined();
  await vi.waitFor(() => expect(button!.disabled).toBe(false));
  button!.click();
  expect(mocks.requestPermission).toHaveBeenCalledOnce();
  renderView("inbox");
  resolvePermission("granted");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.updatePreferences).not.toHaveBeenCalled();
});

it("does not fetch preferences or show an empty inbox while identity is unknown", () => {
  Object.assign(mocks.identity, { settled: false, failed: true, userId: null });
  renderView("inbox");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not load your session");
  expect(container.textContent).not.toContain("Nothing needs your attention");
  expect(mocks.snapshot).not.toHaveBeenCalled();
  expect(mocks.pushConfig).not.toHaveBeenCalled();
});
