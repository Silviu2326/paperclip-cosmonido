// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead, Opportunity, Proposal } from "@paperclipai/shared";
import { leadsApi } from "@/api/leads";
import { crmApi } from "@/api/crm";
import { proposalsApi } from "@/api/proposals";
import { LeadEditorDialog } from "./LeadEditorDialog";
import { LeadConvertDialog } from "./LeadConvertDialog";
import { OpportunityCreateDialog } from "./OpportunityCreateDialog";
import { ProposalEditorDialog } from "./ProposalEditorDialog";
import { SalesFollowUp } from "./SalesFollowUp";
import { LeadBulkActions } from "./LeadBulkActions";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/router", () => ({ useNavigate: () => navigate }));
vi.mock("@/api/leads", () => ({ leadsApi: { create: vi.fn(), update: vi.fn(), convert: vi.fn(), triage: vi.fn(), discard: vi.fn() } }));
vi.mock("@/api/crm", () => ({ crmApi: { customers: { list: vi.fn(), get: vi.fn() }, opportunities: { list: vi.fn(), create: vi.fn(), update: vi.fn() }, activities: { create: vi.fn() }, commitments: { create: vi.fn() } } }));
vi.mock("@/api/proposals", () => ({ proposalsApi: { create: vi.fn(), revise: vi.fn() } }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: async () => [{ id: "seller-agent", name: "Seller", status: "idle" }] } }));
vi.mock("@/api/access", () => ({ accessApi: { listUserDirectory: async () => ({ users: [{ principalId: "seller-user", user: { name: "Ana" } }] }) } }));

const lead = { id: "lead-1", companyId: "company-1", payload: { name: "Ana", email: "ana@example.com", customField: "keep me" }, priority: "normal", assignedUserId: "seller-user", assignedAgentId: null } as unknown as Lead;
const opportunity = { id: "opportunity-1", companyId: "company-1", customerId: "customer-1", title: "Pilot", amountCents: 25000, currency: "EUR", probability: 25, expectedCloseAt: null, nextAction: "Call", nextActionAt: null, ownerUserId: "seller-user", ownerAgentId: null, version: 7 } as Opportunity;
const proposal = { id: "proposal-1", companyId: "company-1", customerId: "customer-1", opportunityId: "opportunity-1", title: "Pilot proposal", scope: [{ title: "Service", description: "Keep this description", quantity: 3, unitPriceCents: 10000 }], priceCents: 30000, depositCents: null, currency: "EUR", terms: "Net 30", validUntil: null, status: "sent" } as Proposal;

describe("sales workspace forms", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onClose = vi.fn();
  const onSaved = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(crmApi.customers.list).mockResolvedValue({ items: [{ id: "customer-1", name: "Acme" }], nextCursor: null } as never);
    vi.mocked(crmApi.customers.get).mockResolvedValue({ id: "customer-1", name: "Acme" } as never);
    vi.mocked(crmApi.opportunities.list).mockResolvedValue({ items: [], nextCursor: null });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ""; });
  async function mount(node: ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>); await new Promise((resolve) => setTimeout(resolve, 20)); });
    return client;
  }
  function set(selector: string, value: string) {
    const element = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    expect(element, selector).toBeTruthy();
    act(() => {
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }
  async function submit(index = 0) {
    await act(async () => { document.querySelectorAll("form")[index].dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  it("creates manual leads and keeps the same retry key and filled fields after a failed save", async () => {
    vi.mocked(leadsApi.create).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(lead);
    await mount(<LeadEditorDialog companyId="company-1" onClose={onClose} onSaved={onSaved} />);
    set("#lead-name", "Ana"); set("#lead-email", "ana@example.com");
    await submit();
    expect(document.body.textContent).toContain("Offline");
    expect(onClose).not.toHaveBeenCalled();
    await submit();
    expect(leadsApi.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(leadsApi.create).mock.calls[0][1]).toEqual(vi.mocked(leadsApi.create).mock.calls[1][1]);
    expect(leadsApi.create).toHaveBeenLastCalledWith("company-1", expect.objectContaining({ source: "manual", payload: expect.objectContaining({ name: "Ana", email: "ana@example.com" }) }));
    expect(onSaved).toHaveBeenCalledWith(lead);
  });

  it("edits lead contact data without dropping source payload fields and switches the assignee exclusively", async () => {
    vi.mocked(leadsApi.update).mockResolvedValueOnce(lead);
    await mount(<LeadEditorDialog companyId="company-1" lead={lead} onClose={onClose} />);
    set("#lead-email", "new@example.com"); set("#lead-owner", "agent:seller-agent");
    await submit();
    expect(leadsApi.update).toHaveBeenCalledWith(lead.id, expect.objectContaining({ payload: expect.objectContaining({ email: "new@example.com", customField: "keep me" }), assignedUserId: null, assignedAgentId: "seller-agent" }));
  });

  it("converts with an opportunity and opens the resulting record, preserving the retry key", async () => {
    vi.mocked(leadsApi.convert).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ ...lead, opportunityId: opportunity.id });
    await mount(<LeadConvertDialog lead={lead} onClose={onClose} />);
    await submit(); await submit();
    expect(leadsApi.convert).toHaveBeenLastCalledWith(lead.id, expect.objectContaining({ createOpportunity: true, opportunityTitle: "Ana" }));
    expect(vi.mocked(leadsApi.convert).mock.calls[0][1].idempotencyKey).toBe(vi.mocked(leadsApi.convert).mock.calls[1][1].idempotencyKey);
    expect(navigate).toHaveBeenCalledWith("/sales/opportunities?opportunityId=opportunity-1");
  });

  it("saves forecast and dated follow-up fields using the loaded opportunity version", async () => {
    vi.mocked(crmApi.opportunities.update).mockResolvedValueOnce(opportunity);
    await mount(<OpportunityCreateDialog open companyId="company-1" customerId="customer-1" opportunity={opportunity} onOpenChange={onClose} />);
    set("#opportunity-probability", "60"); set("#opportunity-close", "2026-12-10"); set("#opportunity-next-at", "2026-11-01T10:30"); set("#opportunity-owner", "agent:seller-agent"); set("#opportunity-amount", "0");
    await submit();
    expect(crmApi.opportunities.update).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({ expectedVersion: 7, amountCents: 0, probability: 60, ownerUserId: null, ownerAgentId: "seller-agent", expectedCloseAt: new Date("2026-12-10").toISOString(), nextActionAt: new Date("2026-11-01T10:30").toISOString() }));
  });

  it("creates a proposal bound to its opportunity and customer with structured quantities and prices", async () => {
    vi.mocked(proposalsApi.create).mockResolvedValueOnce(proposal);
    await mount(<ProposalEditorDialog companyId="company-1" opportunity={opportunity} onClose={onClose} onSaved={onSaved} />);
    set('[id^="scope-qty-"]', "2"); set('[id^="scope-price-"]', "125");
    await submit();
    expect(proposalsApi.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ opportunityId: opportunity.id, customerId: opportunity.customerId, priceCents: 25000, scope: [{ title: "Pilot", quantity: 2, unitPriceCents: 12500 }] }));
    expect(onSaved).toHaveBeenCalledWith(proposal);
  });

  it("does not silently replace the edit version after a background refresh and preserves a conflicting draft", async () => {
    vi.mocked(crmApi.opportunities.update).mockRejectedValueOnce(new Error("Version conflict"));
    const client = await mount(<OpportunityCreateDialog open companyId="company-1" customerId="customer-1" opportunity={opportunity} onOpenChange={onClose} />);
    set("#opportunity-title", "My unsaved title");
    await act(async () => { root.render(<QueryClientProvider client={client}><OpportunityCreateDialog open companyId="company-1" customerId="customer-1" opportunity={{ ...opportunity, version: 8, title: "Someone else's edit" }} onOpenChange={onClose} /></QueryClientProvider>); });
    await submit();
    expect(crmApi.opportunities.update).toHaveBeenCalledWith(opportunity.id, expect.objectContaining({ title: "My unsaved title", expectedVersion: 7 }));
    expect(document.body.textContent).toContain("Version conflict");
    expect((document.getElementById("opportunity-title") as HTMLInputElement).value).toBe("My unsaved title");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("revises a sent proposal without losing descriptions or quantities", async () => {
    vi.mocked(proposalsApi.revise).mockResolvedValueOnce({ ...proposal, id: "revision-2" });
    await mount(<ProposalEditorDialog companyId="company-1" proposal={proposal} onClose={onClose} onSaved={onSaved} />);
    set("#proposal-title", "Revised proposal");
    await submit();
    expect(proposalsApi.revise).toHaveBeenCalledWith(proposal.id, expect.objectContaining({ title: "Revised proposal", scope: proposal.scope, priceCents: 30000, terms: "Net 30" }));
  });

  it("records activities and dated commitments against the selected opportunity", async () => {
    vi.mocked(crmApi.activities.create).mockResolvedValueOnce({} as never);
    vi.mocked(crmApi.commitments.create).mockResolvedValueOnce({} as never);
    await mount(<SalesFollowUp companyId="company-1" subjectKind="opportunity" subjectId={opportunity.id} customerId={opportunity.customerId} />);
    set("#activity-summary", "Called the buyer"); await submit();
    expect(crmApi.activities.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ subjectKind: "opportunity", subjectId: opportunity.id, kind: "note", summary: "Called the buyer" }));
    set("#commitment-what", "Send contract"); set("#commitment-due", "2026-11-02T12:00"); await submit(1);
    expect(crmApi.commitments.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ opportunityId: opportunity.id, customerId: opportunity.customerId, what: "Send contract", dueAt: new Date("2026-11-02T12:00").toISOString() }));
  });

  it("reports partial batch failures and keeps failed leads available for retry", async () => {
    vi.mocked(leadsApi.update).mockResolvedValueOnce(lead).mockRejectedValueOnce(new Error("Assignment denied"));
    await mount(<LeadBulkActions companyId="company-1" leads={[lead, { ...lead, id: "lead-2", payload: { name: "Luis" } }]} onComplete={onSaved} />);
    set('select[aria-label="salesWorkspace.owner"]', "agent:seller-agent");
    const assign = document.querySelector("button")!;
    await act(async () => { assign.click(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(leadsApi.update).toHaveBeenCalledWith("lead-2", { assignedUserId: null, assignedAgentId: null });
    expect(onSaved).toHaveBeenCalledWith({ succeeded: 1, failedIds: ["lead-2"], errors: ["Luis: Assignment denied"] });
  });
});
