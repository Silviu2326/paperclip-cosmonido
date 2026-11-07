// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { ContactCreateDialog } from "./ContactCreateDialog";

vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./SalesCustomerPicker", () => ({ SalesCustomerPicker: () => <div>customer picker</div> }));
vi.mock("@/api/crm", () => ({ crmApi: { contacts: { create: vi.fn(), update: vi.fn() } } }));

const contact = {
  id: "person-1", companyId: "company-1", displayName: "Ana PÃ©rez", firstName: "Ana", lastName: "PÃ©rez",
  primaryEmail: "ana@example.com", primaryPhone: "555-0100", title: "Director", language: "es",
  preferredChannel: "email", consents: { email: true }, status: "active", archivedAt: null,
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
} as Contact;

describe("person edit dialog", () => {
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

  it("updates editable fields and leaves existing consent fields untouched", async () => {
    vi.mocked(crmApi.contacts.update).mockResolvedValue(contact);
    await act(async () => root.render(<QueryClientProvider client={client}><ContactCreateDialog open onOpenChange={() => {}} companyId="company-1" contact={contact} /></QueryClientProvider>));
    const name = document.querySelector<HTMLInputElement>("#contact-create-name")!;
    await act(async () => {
      name.value = "Ana MarÃ­a PÃ©rez";
      name.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const form = document.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(crmApi.contacts.update).toHaveBeenCalledWith("person-1", expect.objectContaining({ displayName: contact.displayName, primaryEmail: contact.primaryEmail, primaryPhone: contact.primaryPhone, title: contact.title }));
    expect(vi.mocked(crmApi.contacts.update).mock.calls[0][1]).not.toHaveProperty("consents");
    expect(crmApi.contacts.create).not.toHaveBeenCalled();
  });
});
