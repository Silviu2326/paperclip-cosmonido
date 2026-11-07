import { describe, expect, it, vi } from "vitest";
import { CRM_A2_TOOL_NAMES, callCrmTool, crmToolDefinitions } from "./crm-tools.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const otherCompanyId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";

function fakeFetch(responses: Array<{ status: number; body: unknown }> = []) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("authorization"),
    });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const base = { apiUrl: "http://localhost:3100", token: "agent-token", companyId };

describe("CRM agent tools (A2)", () => {
  it("exposes exactly the ten A2 tools with JSON Schemas", () => {
    const defs = crmToolDefinitions();
    expect(defs.map((d) => d.name)).toEqual([...CRM_A2_TOOL_NAMES]);
    expect(CRM_A2_TOOL_NAMES).toHaveLength(10);
    for (const def of defs) {
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("scopes every call to the run's company and ignores a companyId in the arguments", async () => {
    const { fetchImpl, calls } = fakeFetch();
    await callCrmTool({
      ...base,
      name: "crm_create_opportunity",
      arguments: {
        companyId: otherCompanyId,
        customerId: "44444444-4444-4444-8444-444444444444",
        title: "Pilot",
      },
      fetchImpl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`http://localhost:3100/api/companies/${companyId}/opportunities`);
    expect(calls[0]!.url).not.toContain(otherCompanyId);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).not.toHaveProperty("companyId");
    expect(calls[0]!.auth).toBe("Bearer agent-token");
  });

  it("routes stage changes to the gated stage endpoint and returns a pending answer unchanged", async () => {
    const pending = { mode: "draft", externalAction: { id: "a1", status: "pending" }, opportunity: null };
    const { fetchImpl, calls } = fakeFetch([{ status: 202, body: pending }]);
    const result = await callCrmTool({
      ...base,
      name: "crm_update_opportunity_stage",
      arguments: { opportunityId, stageKey: "qualified", expectedVersion: 2 },
      fetchImpl,
    });
    expect(calls[0]!.url).toBe(`http://localhost:3100/api/opportunities/${opportunityId}/stage`);
    expect(calls[0]!.body).toEqual({ stageKey: "qualified", expectedVersion: 2 });
    expect(result).toEqual(pending);
  });

  it("builds the commitment resolve path from the commitment id", async () => {
    const commitmentId = "55555555-5555-4555-8555-555555555555";
    const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { id: commitmentId, status: "kept" } }]);
    await callCrmTool({
      ...base,
      name: "commitment_resolve",
      arguments: { commitmentId, status: "kept" },
      fetchImpl,
    });
    expect(calls[0]!.url).toBe(`http://localhost:3100/api/commitments/${commitmentId}/resolve`);
    expect(calls[0]!.body).toEqual({ status: "kept" });
  });

  it("refuses tools outside the A2 list", async () => {
    const { fetchImpl, calls } = fakeFetch();
    await expect(callCrmTool({ ...base, name: "crm_delete_everything", arguments: {}, fetchImpl })).rejects.toThrow(
      /Unknown CRM tool/,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects invalid arguments before calling the API", async () => {
    const { fetchImpl, calls } = fakeFetch();
    await expect(
      callCrmTool({
        ...base,
        name: "crm_update_opportunity_stage",
        arguments: { opportunityId: "not-a-guid", stageKey: "qualified", expectedVersion: 1 },
        fetchImpl,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("surfaces API errors with the server message", async () => {
    const { fetchImpl } = fakeFetch([{ status: 409, body: { error: "Opportunity was changed by someone else" } }]);
    await expect(
      callCrmTool({
        ...base,
        name: "crm_update_opportunity_stage",
        arguments: { opportunityId, stageKey: "won", expectedVersion: 1 },
        fetchImpl,
      }),
    ).rejects.toThrow("Opportunity was changed by someone else");
  });
});
