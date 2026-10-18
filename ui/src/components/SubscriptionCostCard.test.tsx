// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionCostReport } from "@paperclipai/shared";
import { SubscriptionCostCard } from "./SubscriptionCostCard";

const mocks = vi.hoisted(() => ({ update: vi.fn(), link: vi.fn() }));
vi.mock("../api/subscriptions", () => ({ subscriptionsApi: mocks }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const emptyUsage = () => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costCents: "0", eventCount: 0, estimatedEventCount: 0, unpricedEventCount: 0 });
function fixture(): SubscriptionCostReport {
  const price = { revision: 0, plan: "Claude Max 5x", amountCents: "10000", monthlyCents: "10000", currency: "USD", cadence: "month" as const, status: "active" as const, source: "catalog" as const, sourceUrl: "https://claude.com/pricing", effectiveAt: "2026-10-08T00:00:00Z" };
  return { canRefresh: true, asOf: "2026-10-08T00:00:00Z", activeCount: 1, unknownPriceCount: 0, unidentifiedAccountCount: 0,
    monthlyTotals: [{ currency: "USD", amountCents: "10000", estimatedCount: 1 }],
    api: emptyUsage(), subscription: { ...emptyUsage(), inputTokens: 100, cachedInputTokens: 50, outputTokens: 10 }, unknown: emptyUsage(), unattributedSubscription: emptyUsage(),
    accounts: [{ id: "account-1", provider: "anthropic", name: "Alice’s Claude", ownerUserId: "alice", ownerName: "Alice", shared: false, identityVerified: true,
      detectedPlan: "max_5x", observedAt: "2026-10-08T00:00:00Z", lastCheckedAt: "2026-10-08T00:00:00Z", refreshStatus: "ok", canEdit: true,
      price, usage: emptyUsage(), agents: [{ id: "leela", name: "Leela" }] }],
  };
}

describe("subscription costs", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let client: QueryClient;
  const changed = vi.fn();
  beforeEach(() => {
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mocks.update.mockResolvedValue({}); mocks.link.mockResolvedValue({}); changed.mockClear();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); client.clear(); vi.clearAllMocks(); });
  async function render(report?: SubscriptionCostReport, error?: unknown) {
    await act(async () => root.render(<QueryClientProvider client={client}><SubscriptionCostCard companyId="company" report={report} error={error} onChanged={changed} /></QueryClientProvider>));
  }
  async function click(label: string) {
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === label)!.click());
  }
  it("labels the monthly estimate and counts cached input exactly once", async () => {
    await render(fixture());
    expect(container.textContent).toContain("$100.00/mes");
    expect(container.textContent).toContain("Estimado");
    expect(container.textContent).toContain("150 in · 10 out");
    expect(container.textContent).toContain("50 input cached");
    await click("Ver detalles");
    expect(document.body.textContent).toContain("Usada por Leela");
    expect(document.body.textContent).toContain("antes de impuestos");
  });
  it("retains loaded totals during reload failure and never calls an unknown price zero", async () => {
    const report = fixture();
    report.monthlyTotals = []; report.unknownPriceCount = 1; report.accounts[0].price.amountCents = null; report.accounts[0].price.monthlyCents = null;
    await render(report, new Error("private raw error"));
    expect(container.textContent).toContain("1 precio desconocido");
    expect(container.textContent).not.toContain("$0.00");
    expect(container.textContent).not.toContain("private raw error");
    await render(fixture(), new Error("private raw error"));
    expect(container.textContent).toContain("$100.00/mes");
    expect(container.textContent).toContain("Mostrando los últimos datos de suscripción cargados");
  });
  it("does not describe legacy subscription usage with no identified account as free", async () => {
    const report = fixture(); report.accounts = []; report.activeCount = 0; report.monthlyTotals = [];
    report.unattributedSubscription = { ...report.subscription, eventCount: 1 };
    await render(report);
    expect(container.textContent).toContain("No hay suscripciones visibles");
    expect(container.textContent).not.toContain("$0.00");
    await click("Ver detalles");
    expect(document.body.textContent).toContain("Parte del uso de suscripción no tiene cuenta registrada");
  });
  it("keeps identity uncertainty visible even when a user has supplied the price", async () => {
    const report = fixture(); report.unidentifiedAccountCount = 1;
    report.accounts[0].identityVerified = false; report.accounts[0].price.source = "user";
    report.monthlyTotals[0].estimatedCount = 0;
    await render(report);
    expect(container.textContent).toContain("$100.00/mes");
    expect(container.textContent).toContain("1 identidad de cuenta sin confirmar");
  });
  it("saves an annual price with the expected revision and selected currency", async () => {
    await render(fixture()); await click("Ver detalles"); await click("Editar precio");
    await act(async () => {
      const amount = document.querySelector<HTMLInputElement>("#subscription-price")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(amount, "1200");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      const cadence = document.querySelector<HTMLSelectElement>("#subscription-cadence")!;
      cadence.value = "year"; cadence.dispatchEvent(new Event("change", { bubbles: true }));
      const currency = document.querySelector<HTMLSelectElement>("#subscription-currency")!;
      currency.value = "EUR"; currency.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith("company", "account-1", expect.objectContaining({ amountCents: "120000.0000000", currency: "EUR", cadence: "year", expectedRevision: 0 })));
    expect(changed).toHaveBeenCalled();
  });
  it("hides editing when the viewer does not own the account", async () => {
    const report = fixture(); report.accounts[0].canEdit = false;
    await render(report); await click("Ver detalles");
    expect([...document.querySelectorAll("button")].some(button => button.textContent === "Editar precio")).toBe(false);
  });
  it.each(["ended", "excluded"])("can change tracking to %s without rounding a saved fractional price", async (status) => {
    const report = fixture(); report.accounts[0].price.amountCents = "1575.5000000";
    await render(report); await click("Ver detalles"); await click("Editar precio");
    const amount = document.querySelector<HTMLInputElement>("#subscription-price")!;
    expect(amount.value).toBe("15.755");
    expect(amount.checkValidity()).toBe(true);
    await act(async () => {
      const tracking = document.querySelector<HTMLSelectElement>("#subscription-status")!;
      tracking.value = status; tracking.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Guardar precio");
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith("company", "account-1", expect.objectContaining({
      amountCents: "1575.5000000", status,
    })));
  });
  it("distinguishes personal seats with multiple owners from company-shared subscriptions", async () => {
    const report = fixture();
    report.accounts[0] = { ...report.accounts[0], ownerUserId: null, ownerName: null, shared: false, canEdit: false };
    await render(report); await click("Ver detalles");
    expect(document.body.textContent).toContain("Cuentas personales");
    expect(document.body.textContent).not.toContain("Compartida ·");
    report.accounts[0].shared = true;
    await render(report);
    expect(document.body.textContent).toContain("Compartida ·");
    expect(document.body.textContent).not.toContain("Cuentas personales");
  });
  it("links only an explicitly chosen duplicate and keeps the target price", async () => {
    const report = fixture();
    report.accounts.push({ ...report.accounts[0], id: "account-2", name: "Other connection", price: { ...report.accounts[0].price, revision: 3 } });
    await render(report); await click("Ver detalles"); await click("Editar precio");
    expect(document.body.textContent).toContain("se conserva el precio de la cuenta seleccionada");
    await act(async () => { const select = document.querySelector<HTMLSelectElement>("#subscription-link")!; select.value = "account-2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Vincular cuentas");
    await vi.waitFor(() => expect(mocks.link).toHaveBeenCalledWith("company", "account-1", "account-2", 0, 3));
  });
});
