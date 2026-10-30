import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { ALL_AGENT_WORK_PERMISSIONS, agentWorkPermissionsSchema } from "@paperclipai/shared";
import { assertAgentWorkPermissions, assertAgentProfilePolicyUnchanged, workPermissionsForRequest, workPermissionsForTool } from "./agent-work-permissions.js";
import { agentWorkPermissionsMiddleware } from "../middleware/agent-work-permissions.js";

const metadata = (overrides: Record<string, boolean> = {}) => ({ profile: { workPermissions: { ...ALL_AGENT_WORK_PERMISSIONS, ...overrides } } });
describe("agent work permission enforcement", () => {
  it("keeps legacy agents unchanged and denies malformed explicit policies", () => {
    expect(() => assertAgentWorkPermissions({}, ["tasksCreate"])).not.toThrow();
    expect(() => assertAgentWorkPermissions({ profile: { workPermissions: {} } }, ["tasksRead"])).toThrow();
  });
  it("does not bypass a Codex read-only policy through Paperclip workspace writes or runtime commands", () => {
    expect(() => assertAgentWorkPermissions({ profile: { codeAdapterAccess: "read_only" } }, ["workspaceWrite"])).toThrow();
    expect(workPermissionsForRequest("POST", "/execution-workspaces/id/runtime/services/start", {})).toEqual(["workspaceRead", "workspaceWrite", "workspaceExecute"]);
  });
  it("requires the selected permission even when the resource would otherwise be accessible", () => {
    expect(() => assertAgentWorkPermissions(metadata({ tasksCreate: false }), ["tasksCreate"])).toThrow();
    expect(() => assertAgentWorkPermissions(metadata({ tasksCreate: false }), ["tasksRead"])).not.toThrow();
  });
  it("does not allow arbitrary commands to bypass disabled file access", () => {
    const required = workPermissionsForTool("workspace_run");
    expect(required).toEqual(["workspaceRead", "workspaceWrite", "workspaceExecute"]);
    expect(() => assertAgentWorkPermissions(metadata({ workspaceWrite: false, workspaceExecute: false }), required)).toThrow();
    expect(agentWorkPermissionsSchema.safeParse({ ...ALL_AGENT_WORK_PERMISSIONS, workspaceWrite: false }).success).toBe(false);
  });
  it.each([
    ["GET", "/companies/company/projects", "projectsRead"],
    ["POST", "/companies/company/issues", "tasksCreate"],
    ["PATCH", "/issues/task", "tasksUpdate"],
    ["GET", "/issues/task/documents/plan", "documentsRead"],
    ["PUT", "/issues/task/documents/plan", "documentsWrite"],
    ["POST", "/issues/task/workspace/repositories", "workspaceWrite"],
    ["DELETE", "/projects/project", "projectsManage"],
  ])("classifies %s %s", (method, path, expected) => {
    expect(workPermissionsForRequest(method, path, {})).toEqual([expected]);
  });
  it("checks assignee changes in both REST and MCP calls", () => {
    expect(workPermissionsForRequest("POST", "/companies/company/issues", { assigneeAgentId: "another-agent" })).toEqual(["tasksCreate", "tasksAssign"]);
    expect(workPermissionsForRequest("POST", "/mcp/project-tools", { method: "tools/call", params: { name: "create_task", arguments: { assigneeAgentId: "another-agent" } } })).toEqual(["tasksCreate", "tasksAssign"]);
  });
  it("allows creating own tasks but blocks semantic delegation without the assignment permission", () => {
    expect(workPermissionsForTool("create_task", { assigneeActorId: "another" }, "self")).toEqual(["tasksCreate", "tasksAssign"]);
    expect(workPermissionsForTool("create_task", { assigneeActorId: "self" }, "self")).toEqual(["tasksCreate"]);
    expect(workPermissionsForRequest("POST", "/companies/company/issues", { assigneeAgentId: "self" }, "self")).toEqual(["tasksCreate"]);
    expect(workPermissionsForRequest("PATCH", "/issues/task", { assigneeAgentId: "self" }, "self")).toEqual(["tasksUpdate", "tasksAssign"]);
  });
  it("protects policies against removal or modification through generic metadata updates", () => {
    expect(() => assertAgentProfilePolicyUnchanged(metadata(), {})).toThrow();
    expect(() => assertAgentProfilePolicyUnchanged(metadata(), metadata({ tasksCreate: false }))).toThrow();
    expect(() => assertAgentProfilePolicyUnchanged(metadata(), { ...metadata(), unrelated: true })).not.toThrow();
    const reordered = { profile: { workPermissions: Object.fromEntries(Object.entries(ALL_AGENT_WORK_PERMISSIONS).reverse()) } };
    expect(() => assertAgentProfilePolicyUnchanged(metadata(), reordered)).not.toThrow();
  });
  it("blocks agent requests before the resource handler and leaves board access unchanged", async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ metadata: metadata({ tasksCreate: false }) }] }) }) }) } as unknown as Db;
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.actor = (req.headers["x-board"] ? { type: "board" } : { type: "agent", agentId: "agent", companyId: "company" }) as typeof req.actor; next(); });
    app.use(agentWorkPermissionsMiddleware(db));
    app.post("/companies/company/issues", (_req, res) => res.status(201).json({ created: true }));
    app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
    expect((await request(app).post("/companies/company/issues").send({})).status).toBe(403);
    expect((await request(app).post("/companies/company/issues").set("x-board", "1").send({})).status).toBe(201);
  });
});
