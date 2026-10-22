// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmApi } from "../../api/crm";
import { OpportunityCreateDialog } from "./OpportunityCreateDialog";

vi.mock("@/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../api/crm", () => ({
  crmApi: {
    customers: { list: vi.fn() },
    opportunities: { create: vi.fn() },
  },
}));

const createMock = vi.mocked(crmApi.opportunities.create);

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

function field(id: string) {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
}

function buttonByText(text: string) {
  return [...document.querySelectorAll("button")].find((button) => button.textContent === text) as HTMLButtonElement;
}

describe("OpportunityCreateDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    createMock.mockReset();
    vi.mocked(crmApi.customers.list).mockResolvedValue({ items: [], nextCursor: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  function render(customerId?: string) {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OpportunityCreateDialog open onOpenChange={() => {}} companyId="company-1" customerId={customerId} />
        </QueryClientProvider>,
      );
    });
  }

  it("creates an opportunity for the preselected customer with the amount in cents", async () => {
    createMock.mockResolvedValue({ id: "opp-1" } as never);
    render("customer-1");

    act(() => {
      setValue(field("opportunity-create-title") as HTMLInputElement, "Plan anual");
      setValue(field("opportunity-create-amount") as HTMLInputElement, "120,50");
      setValue(field("opportunity-create-next-action") as HTMLInputElement, "Llamar el lunes");
    });
    await act(async () => {
      (document.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith("company-1", {
      customerId: "customer-1",
      title: "Plan anual",
      stageKey: "new",
      amountCents: 12050,
      currency: "EUR",
      nextAction: "Llamar el lunes",
      idempotencyKey: expect.any(String),
    });
    expect(customerPicker()).toBeNull();
  });

  it("keeps the same idempotency key when a failed submit is retried", async () => {
    createMock.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ id: "opp-2" } as never);
    render("customer-1");

    act(() => setValue(field("opportunity-create-title") as HTMLInputElement, "Pedido"));
    const submit = () =>
      act(async () => {
        (document.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    await submit();
    expect(document.body.textContent).toContain("crm.opportunities.create.error");
    await submit();

    expect(createMock).toHaveBeenCalledTimes(2);
    const [firstKey, secondKey] = createMock.mock.calls.map((call) => call[1].idempotencyKey);
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  it("disables the submit action until a title and a customer are present", () => {
    render("customer-1");
    const submitButton = buttonByText("crm.opportunities.create.submit");
    expect(submitButton.disabled).toBe(true);
    act(() => setValue(field("opportunity-create-title") as HTMLInputElement, "Pedido"));
    expect(buttonByText("crm.opportunities.create.submit").disabled).toBe(false);
  });

  it("places cancel on the left and the primary action on the right in the same row", () => {
    render("customer-1");
    const cancel = buttonByText("crm.opportunities.create.cancel");
    const submit = buttonByText("crm.opportunities.create.submit");
    expect(cancel.parentElement).toBe(submit.parentElement);
    expect(cancel.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

function customerPicker() {
  return document.getElementById("opportunity-create-customer");
}
