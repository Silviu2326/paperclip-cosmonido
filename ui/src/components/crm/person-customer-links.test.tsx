// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmApi } from "../../api/crm";
import { ContactCreateDialog } from "./ContactCreateDialog";
import { PersonCustomerLinks } from "./PersonCustomerLinks";
import type { ContactLinkedCustomer } from "../../api/crm";

vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("./SalesCustomerPicker", () => ({ SalesCustomerPicker: ({ value, onChange }: { value: string; onChange: (id: string) => void }) =>
  <select aria-label="Customer picker" value={value} onChange={(event) => onChange(event.target.value)}><option value="">None</option><option value="customer-1">Cliente</option></select>,
}));
vi.mock("../../api/crm", () => ({ crmApi: {
  contacts: { create: vi.fn() },
  customers: { linkContact: vi.fn(), unlinkContact: vi.fn() },
} }));

describe("people and customer linking", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ""; });
  function render(node: React.ReactNode) {
    act(() => root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>));
  }
  function chooseCustomer() {
    act(() => {
      const select = document.querySelector("select")!;
      select.value = "customer-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  async function click(text: string) {
    await act(async () => {
      [...document.querySelectorAll("button")].find((button) => button.textContent === text)!.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  function namePerson() {
    act(() => {
      const input = document.getElementById("contact-create-name")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Ana");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("includes the selected customer when creating a person", async () => {
    vi.mocked(crmApi.contacts.create).mockResolvedValue({ id: "person-1" } as never);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<ContactCreateDialog open companyId="company-1" onOpenChange={() => {}} />);
    namePerson();
    chooseCustomer();
    await click("crm.contacts.create");
    expect(crmApi.contacts.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ displayName: "Ana", customerId: "customer-1" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crm-customer-contacts", "customer-1"] });
  });

  it("keeps customer selection optional", async () => {
    vi.mocked(crmApi.contacts.create).mockResolvedValue({ id: "person-1" } as never);
    render(<ContactCreateDialog open companyId="company-1" onOpenChange={() => {}} />);
    namePerson();
    await click("crm.contacts.create");
    expect(vi.mocked(crmApi.contacts.create).mock.calls[0][1]).not.toHaveProperty("customerId");
  });

  it("preserves the customer when creating from a customer's Contacts tab", async () => {
    vi.mocked(crmApi.contacts.create).mockResolvedValue({ id: "person-1" } as never);
    render(<ContactCreateDialog open companyId="company-1" customerId="fixed-customer" onOpenChange={() => {}} />);
    expect(document.querySelector("select")).toBeNull();
    namePerson();
    await click("crm.contacts.create");
    expect(crmApi.contacts.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ customerId: "fixed-customer" }));
  });

  it("links an existing person and refreshes both sides of the relationship", async () => {
    vi.mocked(crmApi.customers.linkContact).mockResolvedValue({});
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<PersonCustomerLinks companyId="company-1" contactId="person-1" linked={[]} loading={false} loadError={false} />);
    await click("crm.contacts.linkCustomer");
    chooseCustomer();
    await click("crm.customers.link");
    expect(crmApi.customers.linkContact).toHaveBeenCalledWith("customer-1", { contactId: "person-1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crm-customer-contacts", "customer-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: expect.arrayContaining(["person-1", "customers"]) });
  });

  it("surfaces unlink failure and keeps the linked customer visible", async () => {
    vi.mocked(crmApi.customers.unlinkContact).mockRejectedValue(new Error("network"));
    const linked = [{ customer: { id: "customer-1", name: "Cliente" }, role: null, isPrimary: false }] as ContactLinkedCustomer[];
    render(<PersonCustomerLinks companyId="company-1" contactId="person-1" linked={linked} loading={false} loadError={false} />);
    await click("crm.customers.unlink");
    expect(crmApi.customers.unlinkContact).toHaveBeenCalledWith("customer-1", "person-1");
    expect(document.body.textContent).toContain("crm.contacts.customerLinkError");
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/customers/customer-1");
  });
});
