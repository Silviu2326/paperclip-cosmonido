import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Agent media access is decided by the company grant `media:generate` (principal = the agent).
// The access service is mocked so the test controls exactly which grants exist.
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const ISSUE_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

const grants = vi.hoisted(() => ({ keys: new Set<string>() }));

vi.mock("../services/access.js", () => ({
  accessService: () => ({
    hasPermission: async (_companyId: string, principalType: string, principalId: string, permissionKey: string) =>
      principalType === "agent" && principalId === "22222222-2222-4222-8222-222222222222" && grants.keys.has(permissionKey),
  }),
}));

vi.mock("../services/project-tool-context.js", () => ({
  projectToolContext: async () => ({
    run: { companyId: "11111111-1111-4111-8111-111111111111", agentId: "22222222-2222-4222-8222-222222222222" },
    issue: { id: "33333333-3333-4333-8333-333333333333", workMode: "standard", conversationAgentId: null, projectId: null, goalId: null },
  }),
}));

const { projectToolRoutes } = await import("../routes/project-tools.js");
const { mediaStudioRoutes } = await import("../routes/media-studio.js");

function agentApp(mount: (app: express.Express, db: Db) => void) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = { type: "agent", agentId: AGENT_ID, companyId: COMPANY_ID, runId: "run-1" };
    next();
  });
  mount(app, {} as Db);
  return app;
}

async function rpc(app: express.Express, body: Record<string, unknown>) {
  const response = await request(app).post("/mcp/project-tools").set("authorization", "Bearer token").send({ jsonrpc: "2.0", id: 1, ...body });
  return response.body as { result?: { tools?: Array<{ name: string }>; isError?: boolean; content?: Array<{ text: string }> } };
}

describe("media tools need the agent's media:generate grant", () => {
  beforeEach(() => {
    grants.keys.clear();
  });
  afterEach(() => {
    grants.keys.clear();
  });

  describe("project-tools MCP route", () => {
    it("does not list media tools and rejects media calls without the grant", async () => {
      const app = agentApp((a, db) => a.use(projectToolRoutes(db)));

      const listed = await rpc(app, { method: "tools/list" });
      const names = (listed.result?.tools ?? []).map((tool) => tool.name);
      expect(names).not.toContain("media_cut");
      expect(names).not.toContain("media_export");

      const called = await rpc(app, { method: "tools/call", params: { name: "media_cut", arguments: {} } });
      expect(called.result?.isError).toBe(true);
      expect(called.result?.content?.[0]?.text).toBe(
        "This agent is not allowed to use media tools. Enable it in the agent's capabilities.",
      );
    });

    it("lists media tools for an agent holding media:generate", async () => {
      grants.keys.add("media:generate");
      const app = agentApp((a, db) => a.use(projectToolRoutes(db)));

      const listed = await rpc(app, { method: "tools/list" });
      const names = (listed.result?.tools ?? []).map((tool) => tool.name);
      expect(names).toContain("media_cut");
    });
  });

  describe("media studio routes", () => {
    it("rejects agent media requests without the grant", async () => {
      const app = agentApp((a, db) => a.use("/api", mediaStudioRoutes(db)));

      const response = await request(app).get(`/api/media-projects/${PROJECT_ID}`);
      expect(response.status).toBe(403);
    });

    it("does not block agent media requests that hold the grant", async () => {
      grants.keys.add("media:generate");
      const app = agentApp((a, db) => a.use("/api", mediaStudioRoutes(db)));

      // The fake database makes the handler fail after the capability check; the check itself must pass.
      const response = await request(app).get(`/api/media-projects/${PROJECT_ID}`);
      expect(response.status).not.toBe(403);
    });

    it("does not gate non-media paths on the same router", async () => {
      const app = agentApp((a, db) => a.use("/api", mediaStudioRoutes(db)));

      const response = await request(app).get("/api/issues/unrelated");
      expect(response.status).not.toBe(403);
    });
  });
});
