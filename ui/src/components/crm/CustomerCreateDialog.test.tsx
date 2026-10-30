// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmApi } from "../../api/crm";
import { ApiError } from "../../api/client";
import type { Customer } from "@paperclipai/shared";
import { CustomerCreateDialog } from "./CustomerCreateDialog";

vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../api/crm", () => ({ crmApi: { customers: { create: vi.fn(), update: vi.fn() } } }));

describe("CustomerCreateDialog", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onCreated = vi.fn();
  const create = vi.mocked(crmApi.customers.create);

  beforeEach(() => {
    create.mockReset();
    vi.mocked(crmApi.customers.update).mockReset();
    onCreated.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    act(() => root.render(
      <QueryClientProvider client={client}>
        <CustomerCreateDialog open companyId="company-1" onOpenChange={() => {}} onCreated={onCreated} />
      </QueryClientProvider>,
    ));
    setField("name", "Cliente de prueba");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  function setField(field: string, value: string) {
    act(() => {
      const input = document.getElementById(`customer-create-${field}`) as HTMLInputElement | HTMLTextAreaElement;
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit() {
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  it("creates a customer without asking for or sending a domain", async () => {
    expect(document.getElementById("customer-create-domain")).toBeNull();
    create.mockResolvedValueOnce({ id: "customer-1" } as never);
    await submit();
    expect(create).toHaveBeenLastCalledWith("company-1", expect.objectContaining({ name: "Cliente de prueba", notes: null }));
    expect(create.mock.calls[0][1]).not.toHaveProperty("domain");
    expect(onCreated).toHaveBeenCalledWith({ id: "customer-1" });
  });

  it("does not label unrelated errors as invalid domains", async () => {
    create.mockRejectedValueOnce(new ApiError("Unavailable", 500, null));
    await submit();
    expect(document.body.textContent).toContain("crm.customers.createError");
    expect(document.body.textContent).not.toContain("crm.customers.invalidDomain");
  });

  it("submits optional contact, address and fiscal details with notes", async () => {
    const details = {
      contactName: "Ana López", contactEmail: "ana@example.com", phone: "+34 612 345 678",
      address: "Calle Mayor 1", city: "Madrid", postalCode: "28001", country: "España",
      legalName: "Cliente SL", taxId: "B12345678", notes: "Servicio mensual",
    };
    for (const [key, value] of Object.entries(details)) setField(key, ` ${value} `);
    create.mockResolvedValueOnce({ id: "customer-1" } as never);
    await submit();
    expect(create).toHaveBeenCalledWith("company-1", expect.objectContaining(details));
  });

  it("prefills saved details and allows clearing a field when editing", async () => {
    const customer = { id: "customer-1", name: "Cliente", kind: "organization", tags: ["VIP"],
      contactName: "Ana", phone: "612345678", taxId: "B12345678", notes: "Nota" } as Customer;
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    act(() => root.render(
      <QueryClientProvider client={client}>
        <CustomerCreateDialog open companyId="company-1" onOpenChange={() => {}} customer={customer} />
      </QueryClientProvider>,
    ));
    expect((document.getElementById("customer-create-contactName") as HTMLInputElement).value).toBe("Ana");
    setField("phone", "");
    vi.mocked(crmApi.customers.update).mockResolvedValueOnce(customer);
    await submit();
    expect(crmApi.customers.update).toHaveBeenCalledWith("customer-1", expect.objectContaining({
      contactName: "Ana", phone: null, taxId: "B12345678", notes: "Nota", tags: ["VIP"],
    }));
    expect(create).not.toHaveBeenCalled();
  });
});
