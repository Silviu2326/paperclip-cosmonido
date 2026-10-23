// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SecuritySettings } from "./SecuritySettings";

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getTwoFactorEnabled: vi.fn(),
  retention: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));
vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: unknown }) => <a href={to} {...rest}>{children as never}</a>,
}));
vi.mock("@/api/companies-query", () => ({ useAccountIdentity: () => ({ settled: true, failed: false, userId: "user-1" }) }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-1", selectedCompany: { id: "company-1", name: "Acme" } }) }));
vi.mock("@/api/auth", () => ({ authApi: { listSessions: mocks.listSessions, getTwoFactorEnabled: mocks.getTwoFactorEnabled } }));
vi.mock("@/api/productization-security", () => ({
  productizationSecurityApi: { retention: mocks.retention },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function renderSection(section?: "access" | "retention") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  flushSync(() => root.render(<QueryClientProvider client={client}><SecuritySettings section={section} /></QueryClientProvider>));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.listSessions.mockResolvedValue([]);
  mocks.getTwoFactorEnabled.mockResolvedValue(false);
  mocks.retention.mockResolvedValue({ revision: 1, enforcement: "active", blocker: null, conversations: { enabled: false, days: 365 }, files: { enabled: false, days: 30 } });
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it("defaults to the access section and only loads the user's own sign-in data", async () => {
  renderSection();
  await vi.waitFor(() => expect(mocks.listSessions).toHaveBeenCalled());
  expect(mocks.getTwoFactorEnabled).toHaveBeenCalled();
  expect(mocks.retention).not.toHaveBeenCalled();
  expect(container.querySelector('[data-settings-scope="user"]')).not.toBeNull();
  const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
  expect(hrefs).toContain("/company/settings/retention");
  expect(hrefs).not.toContain("/company/settings/account-deletion");
  expect(container.querySelector("#retention-conversation-days")).toBeNull();
});

it("retention section loads only the company policy and keeps the preview-first flow", async () => {
  renderSection("retention");
  await vi.waitFor(() => expect(mocks.retention).toHaveBeenCalledWith("company-1"));
  expect(mocks.listSessions).not.toHaveBeenCalled();
  expect(mocks.getTwoFactorEnabled).not.toHaveBeenCalled();
  expect(container.querySelector('[data-settings-scope="company"]')?.textContent).toContain("Acme");
  await vi.waitFor(() => expect(container.querySelector("#retention-conversation-days")).not.toBeNull());
  const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
  expect(buttons).toContain("securitySettings.previewRecords");
  expect(buttons).not.toContain("securitySettings.confirmSave");
});
