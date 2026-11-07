// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountDeletionZone } from "./AccountDeletionZone";

const mocks = vi.hoisted(() => ({
  accountDeletion: vi.fn(),
  requestAccountDeletion: vi.fn(),
  cancelAccountDeletion: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      (options?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => options?.[name] ?? ""),
  }),
}));
vi.mock("@/api/productization-security", () => ({ productizationSecurityApi: mocks }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function flush() {
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
}

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><AccountDeletionZone userId="user-1" accountId="account-1" accountName="Acme Ltd" /></QueryClientProvider>);
  });
}

async function openZone() {
  const details = container.querySelector("details")!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.accountDeletion.mockResolvedValue(null);
  mocks.requestAccountDeletion.mockResolvedValue({ id: "deletion-1", status: "cooling", blockerCode: null, coolingEndsAt: new Date().toISOString() });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it("fetches nothing until the danger zone is opened", async () => {
  await render();
  await flush();
  expect(mocks.accountDeletion).not.toHaveBeenCalled();
  await openZone();
  expect(mocks.accountDeletion).toHaveBeenCalledWith("account-1");
  expect(container.textContent).toContain("Acme Ltd");
});

it("keeps the request disabled until the exact phrase is typed, then targets this account", async () => {
  await render();
  await openZone();
  const button = () => [...container.querySelectorAll("button")].find((item) => item.textContent === "securitySettings.requestDeletion")!;
  expect(button().disabled).toBe(true);
  const input = container.querySelector("input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, "DELETE COMMERCIAL ACCOUNT");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button().disabled).toBe(false);
  await act(async () => { button().click(); });
  await flush();
  expect(mocks.requestAccountDeletion).toHaveBeenCalledWith("account-1", "DELETE COMMERCIAL ACCOUNT");
});
