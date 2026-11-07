// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { CrmQuickActions } from "./CrmQuickActions";

const openNewIssue = vi.fn();
vi.mock("@/context/DialogContext", () => ({ useDialogActions: () => ({ openNewIssue }) }));
vi.mock("@/api/crm", () => ({ crmApi: { customers: { listContacts: vi.fn() } } }));
vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string, options?: { name?: string }) => key === "crmQuick.taskTitle" ? `Work for ${options?.name}` : key }) }));
vi.mock("@/lib/router", () => ({ useActiveCompanyPrefix: () => "ACM" }));

describe("CrmQuickActions", () => {
  let root: Root;
  let container: HTMLDivElement;
  let queryClient: QueryClient;
  const customer = { id: "customer-1", companyId: "company-1", name: "Acme", contactEmail: "saved@example.com", phone: null } as Customer;

  beforeEach(() => {
    openNewIssue.mockReset();
    vi.mocked(crmApi.customers.listContacts).mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => root.render(<QueryClientProvider client={queryClient}><CrmQuickActions target={{ kind: "customer", customer }} onEdit={vi.fn()} /></QueryClientProvider>));
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
  });

  it("does not fetch linked contacts until Contactar opens its dialog", async () => {
    vi.mocked(crmApi.customers.listContacts).mockResolvedValue([]);
    expect(crmApi.customers.listContacts).not.toHaveBeenCalled();
    const contactButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("crmQuick.contact"));
    await act(async () => { contactButton!.click(); await Promise.resolve(); });
    expect(crmApi.customers.listContacts).toHaveBeenCalledWith("customer-1");
    await vi.waitFor(() => expect(document.body.querySelector('a[href="mailto:saved@example.com"]')).not.toBeNull());
  });

  it("opens the standard task dialog with agent instructions and the CRM record link", () => {
    const taskButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("crmQuick.assignAgent"));
    act(() => taskButton!.click());
    expect(openNewIssue).toHaveBeenCalledWith(expect.objectContaining({
      title: "Work for Acme",
      description: expect.stringContaining("/customers/customer-1"),
      navigateOnCreate: true,
    }));
  });
});
