import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPABILITY_SEMANTIC_TOOL_CATALOG } from "../vendor/paperclip-runner/index.js";
import { PRODUCT_TOOL_NAMES } from "../services/native-runtime/assigned-mcp-tools.js";
import { projectToolDefinitions } from "../services/project-tools.js";
import { assignmentToolDefinitions } from "../services/assignment-tools.js";
import { mediaToolDefinitions } from "../services/media-tools.js";
import { sprint3ToolDefinitions } from "../services/sprint3-tools.js";
import { SPRINT2_TOOL_NAMES, callSprint2Tool } from "../services/sprint2-tools.js";

describe("product tool authorization catalog", () => {
  it("advertises each implemented product operation exactly once", () => {
    for (const name of PRODUCT_TOOL_NAMES) expect(CAPABILITY_SEMANTIC_TOOL_CATALOG.filter(tool => tool.operationId === name), name).toHaveLength(1);
    const standard = [...projectToolDefinitions("standard"), ...assignmentToolDefinitions("standard"), ...mediaToolDefinitions("standard"), ...sprint3ToolDefinitions("standard")].map(tool => tool.name);
    // Sprint 2 tools reach agents through the runner catalog (paperclip-runner-tool-authority); the MCP project-tools route does not list them yet.
    for (const name of PRODUCT_TOOL_NAMES.filter(name => !SPRINT2_TOOL_NAMES.includes(name))) expect(standard, name).toContain(name);
  });
  it.each(["ask", "planning"])("keeps mutation tools unavailable in %s", mode => {
    const available = [...projectToolDefinitions(mode), ...assignmentToolDefinitions(mode), ...mediaToolDefinitions(mode), ...sprint3ToolDefinitions(mode)].map(tool => tool.name);
    for (const name of ["get_assignment", "context_search", "context_get", "media_get_project", "media_get_job"]) expect(available).toContain(name);
    for (const name of ["submit_deliverable_for_review", "media_ingest", "media_transcribe", "media_cut", "media_subtitle", "media_export", "media_dub", "media_stop_motion", "playbook_start", "proposal_send", "handoff_to_delivery", "lead_enrich"]) expect(available).not.toContain(name);
  });
});

describe("Sprint 2 agent tool catalog", () => {
  const READ_TOOLS = ["crm_search", "crm_get_customer", "lead_get", "lead_list", "conversation_list", "conversation_get", "calendar_availability", "customer_memory_get", "review_status_get", "crm_sync_status", "call_summary_get"];

  it("advertises all 32 Sprint 2 tools exactly once", () => {
    expect(SPRINT2_TOOL_NAMES).toHaveLength(32);
    for (const name of SPRINT2_TOOL_NAMES) {
      expect(CAPABILITY_SEMANTIC_TOOL_CATALOG.filter(tool => tool.operationId === name), name).toHaveLength(1);
      expect(PRODUCT_TOOL_NAMES as readonly string[], name).toContain(name);
    }
  });

  it("keeps review creation governed and phone scheduling separate from dialing", () => {
    const review = CAPABILITY_SEMANTIC_TOOL_CATALOG.find(tool => tool.operationId === "review_link_create")!;
    expect(review.effect).toBe("write");
    expect(review.allowedModes).not.toContain("planning");
    expect(CAPABILITY_SEMANTIC_TOOL_CATALOG.map(tool => tool.operationId)).not.toContain("call_dial");
  });

  it("makes reads available in every work mode and mutations only in standard", () => {
    for (const name of SPRINT2_TOOL_NAMES) {
      const entry = CAPABILITY_SEMANTIC_TOOL_CATALOG.find(tool => tool.operationId === name)!;
      if (READ_TOOLS.includes(name)) {
        expect(entry.effect, name).toBe("read");
        expect(entry.allowedModes, name).toEqual(expect.arrayContaining(["standard", "ask", "planning"]));
      } else {
        expect(entry.effect, name).toBe("write");
        expect(entry.allowedModes, name).toEqual(["standard", "skill_test"]);
      }
    }
  });

  it("dispatches Sprint 2 names only", async () => {
    await expect(callSprint2Tool({ name: "unsupported_product_tool", arguments: {}, apiUrl: "http://x", token: "t", companyId: "c", issueId: "i", agentId: "a" })).rejects.toThrow(/Unknown/);
  });

  describe("authenticated API routing", () => {
    afterEach(() => vi.unstubAllGlobals());
    const base = { apiUrl: "http://127.0.0.1:3100", token: "tok", companyId: "00000000-0000-4000-8000-0000000000c1", issueId: "00000000-0000-4000-8000-0000000000i1", agentId: "00000000-0000-4000-8000-0000000000a1" };
    const leadId = "00000000-0000-4000-8000-000000000011";
    const eventId = "00000000-0000-4000-8000-000000000012";

    it.each([
      ["lead_get", { leadId }, "GET", `/api/leads/${leadId}`],
      ["lead_list", { limit: 5, status: "new" }, "GET", `/api/companies/${base.companyId}/leads?limit=5&status=new`],
      ["calendar_cancel", { eventId }, "POST", `/api/calendar/events/${eventId}/cancel`],
      ["calendar_book", { slug: "demo-call", startsAt: "2026-10-27T10:00:00.000Z", attendee: { name: "Ana", email: "ana@example.com" } }, "POST", `/api/companies/${base.companyId}/calendar/events`],
    ])("routes %s through the company API", async (name, args, method, path) => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(callSprint2Tool({ ...base, name, arguments: args })).resolves.toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const expected = new URL(`${base.apiUrl}${path}`);
      const actual = new URL(url);
      expect(actual.origin + actual.pathname).toBe(expected.origin + expected.pathname);
      expect(Object.fromEntries(actual.searchParams)).toEqual(Object.fromEntries(expected.searchParams));
      expect(init.method).toBe(method);
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    });
  });
});
