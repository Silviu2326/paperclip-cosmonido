import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, companies, createDb, heartbeatRuns, issues, projectAutopilots, projects, projectWorkspaces,
  getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "@paperclipai/db";
import { autopilotConfigSchema, autopilotReportSchema, type AutopilotPlan } from "@paperclipai/shared";
import { projectAutopilotService } from "../services/project-autopilot.js";
import express from "express";
import request from "supertest";
import { projectAutopilotRoutes } from "../routes/project-autopilot.js";
import { errorHandler } from "../middleware/index.js";

const externalUrl = process.env.PAPERCLIP_AUTOPILOT_TEST_DATABASE_URL;
const support = externalUrl ? { supported: true } : await getEmbeddedPostgresTestSupport();
const suite = support.supported ? describe : describe.skip;

suite("durable project autonomy", () => {
  let db: ReturnType<typeof createDb>;
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;
  beforeAll(async () => {
    if (!externalUrl) temporary = await startEmbeddedPostgresTestDatabase("paperclip-autopilot-");
    db = createDb(externalUrl ?? temporary!.connectionString);
  }, 120000);
  afterAll(async () => { await temporary?.cleanup(); });

  async function seed() {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Autopilot test", issuePrefix: `A${companyId.slice(0, 6).toUpperCase()}`, requireBoardApprovalForNewAgents: false });
    const roster = await db.insert(agents).values(["Builder", "Reviewer", "Fallback"].map(name => ({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }))).returning();
    const [project] = await db.insert(projects).values({ companyId, name: "Smart Dental", status: "in_progress" }).returning();
    const [workspace] = await db.insert(projectWorkspaces).values({ companyId, projectId: project!.id, name: "Frontend", sourceType: "git_repo", repoUrl: "https://github.com/example/frontend", isPrimary: true }).returning();
    const wakeup = vi.fn().mockResolvedValue(null);
    const service = projectAutopilotService(db, { heartbeat: { wakeup }, observeCapacity: async () => ({ available: true, known: false, retryAt: null }) });
    const config = autopilotConfigSchema.parse({ enabled: true, objective: "Improve the dental simulator", plannerAgentId: roster[0]!.id,
      builderAgentId: roster[0]!.id, reviewerAgentId: roster[1]!.id, selectionMode: "automatic" });
    await service.configure(project!.id, companyId, config, "local-board");
    return { companyId, project: project!, workspace: workspace!, roster, wakeup, service, config };
  }
  async function due(projectId: string) {
    await db.update(projectAutopilots).set({ nextTickAt: new Date(0) }).where(eq(projectAutopilots.projectId, projectId));
  }
  function plans(workspaceId: string): AutopilotPlan[] {
    return (["essential", "balanced", "ambitious"] as const).map(id => ({ id, title: `Comparison ${id}`, problem: "Patients cannot compare images", benefit: "Explain expected changes more clearly",
      evidence: ["Inspected simulator screen"], assumptions: ["Validate with clinic staff"], effort: "One bounded change", risk: "low", acceptanceCriteria: ["Before/after comparison works"], steps: ["Add comparison control"], workspaceIds: [workspaceId] }));
  }

  it("admits a single discovery task under concurrent scheduler ticks and preserves it after a service restart", async () => {
    const f = await seed();
    await Promise.all([f.service.tick(f.project.id), f.service.tick(f.project.id)]);
    const created = await db.select().from(issues).where(and(eq(issues.companyId, f.companyId), eq(issues.originKind, "autopilot")));
    expect(created).toHaveLength(1);
    expect(f.wakeup).toHaveBeenCalledTimes(1);
    const restarted = projectAutopilotService(db, { heartbeat: { wakeup: f.wakeup } });
    expect((await restarted.get(f.project.id))?.state.activeIssueId).toBe(created[0]!.id);
    expect(created[0]!.description).toContain("exactly three");
  });

  it("waits for both task completion and the provider run to stop before handing off a selected plan", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const issueId = (await f.service.get(f.project.id))!.state.activeIssueId!;
    await f.service.submitPlans(f.project.id, { issueId, summary: "Three opportunities", recommendedPlanId: "balanced", plans: plans(f.workspace.id) });
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, issueId));
    const [run] = await db.insert(heartbeatRuns).values({ companyId: f.companyId, agentId: f.roster[0]!.id, status: "running", contextSnapshot: { issueId } }).returning();
    await due(f.project.id); await f.service.tick(f.project.id);
    expect((await f.service.get(f.project.id))?.state.activeIssueId).toBe(issueId);
    await db.update(heartbeatRuns).set({ status: "succeeded", finishedAt: new Date() }).where(eq(heartbeatRuns.id, run!.id));
    await due(f.project.id); await f.service.tick(f.project.id);
    const state = (await f.service.get(f.project.id))!.state;
    expect(state.activeIssueId).toBeNull(); expect(state.selectedPlanId).toBe("balanced"); expect(state.phase).toBe("implementation");
    await due(f.project.id); await f.service.tick(f.project.id);
    expect((await f.service.get(f.project.id))?.state.status).toBe("implementing");
  });

  it("keeps high-risk recommendations waiting for a human selection", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const issueId = (await f.service.get(f.project.id))!.state.activeIssueId!;
    await f.service.submitPlans(f.project.id, { issueId, summary: "Risky recommendation", recommendedPlanId: "ambitious", plans: plans(f.workspace.id).map(plan => ({ ...plan, risk: "high" })) });
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, issueId));
    await due(f.project.id); await f.service.tick(f.project.id);
    expect((await f.service.get(f.project.id))?.state.status).toBe("awaiting_selection");
    await f.service.selectPlan(f.project.id, "essential");
    expect((await f.service.get(f.project.id))?.state.phase).toBe("implementation");
  });

  it("shows an admitted task's quota wait without replacing or replaying its session", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const issueId = (await f.service.get(f.project.id))!.state.activeIssueId!;
    await db.insert(heartbeatRuns).values({ companyId: f.companyId, agentId: f.roster[0]!.id, status: "scheduled_retry",
      scheduledRetryReason: "provider_quota", scheduledRetryAt: new Date(Date.now() + 3600000), contextSnapshot: { issueId } });
    await due(f.project.id); await f.service.tick(f.project.id);
    const state = (await f.service.get(f.project.id))!.state;
    expect(state.status).toBe("waiting_capacity"); expect(state.activeIssueId).toBe(issueId); expect(state.capacity?.retryAt).toBeTruthy();
    expect(f.wakeup).toHaveBeenCalledTimes(1);
  });

  it("waits without creating work when observed capacity is exhausted, then uses the configured fallback for a new task", async () => {
    const f = await seed();
    const retryAt = new Date(Date.now() + 3600000).toISOString();
    const exhausted = projectAutopilotService(db, { heartbeat: { wakeup: f.wakeup }, observeCapacity: async () => ({ available: false, known: true, retryAt }) });
    await exhausted.tick(f.project.id);
    const waiting = (await exhausted.get(f.project.id))!;
    expect(waiting.state.status).toBe("waiting_capacity"); expect(waiting.state.activeIssueId).toBeNull();
    expect(waiting.nextTickAt.toISOString()).toBe(retryAt); expect(f.wakeup).not.toHaveBeenCalled();
    await f.service.configure(f.project.id, f.companyId, { ...f.config, fallbackAgentId: f.roster[2]!.id }, "local-board", waiting.revision);
    const fallback = projectAutopilotService(db, { heartbeat: { wakeup: f.wakeup }, observeCapacity: async (_row, agent) => ({ available: agent.id === f.roster[2]!.id, known: true, retryAt }) });
    await fallback.tick(f.project.id);
    const active = (await fallback.get(f.project.id))!.state.activeIssueId!;
    expect((await db.select().from(issues).where(eq(issues.id, active)))[0]?.assigneeAgentId).toBe(f.roster[2]!.id);
  });

  it("rejects foreign repositories, stale callbacks, and a builder reviewing its own work", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const issueId = (await f.service.get(f.project.id))!.state.activeIssueId!;
    await expect(f.service.submitPlans(f.project.id, { issueId, summary: "Foreign", recommendedPlanId: "balanced", plans: plans(randomUUID()) })).rejects.toThrow("outside this project");
    await expect(f.service.submitPlans(f.project.id, { issueId: randomUUID(), summary: "Stale", recommendedPlanId: "balanced", plans: plans(f.workspace.id) })).rejects.toThrow("superseded");
    await expect(f.service.configure(f.project.id, f.companyId, { ...f.config, reviewerAgentId: f.config.builderAgentId }, "local-board")).rejects.toThrow("independent reviewer");
  });

  it("pauses admissions durably while preserving the current task and accepts its pending discovery result", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const before = (await f.service.get(f.project.id))!;
    await f.service.configure(f.project.id, f.companyId, { ...f.config, enabled: false }, "local-board", before.revision);
    await f.service.submitPlans(f.project.id, { issueId: before.state.activeIssueId!, summary: "Saved while paused", recommendedPlanId: "balanced", plans: plans(f.workspace.id) });
    await due(f.project.id); await f.service.tick(f.project.id);
    const after = (await f.service.get(f.project.id))!;
    expect(after.enabled).toBe(false); expect(after.state.activeIssueId).toBe(before.state.activeIssueId); expect(after.state.plans).toHaveLength(3);
  });

  it("rejects changed execution settings while a task owns the workspace", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const before = (await f.service.get(f.project.id))!;
    await expect(f.service.configure(f.project.id, f.companyId, { ...f.config, objective: "Completely different goal" }, "local-board", before.revision)).rejects.toThrow("current task");
    await expect(f.service.configure(f.project.id, f.companyId, f.config, "local-board", before.revision - 1)).rejects.toThrow("changed");
  });

  it("runs a complete two-repository cycle and rejects deployment evidence from a different commit", async () => {
    const f = await seed();
    const [backend] = await db.insert(projectWorkspaces).values({ companyId: f.companyId, projectId: f.project.id, name: "Backend", sourceType: "git_repo", repoUrl: "https://github.com/example/backend" }).returning();
    const before = (await f.service.get(f.project.id))!;
    await f.service.configure(f.project.id, f.companyId, { ...f.config, maxCyclesPerDay: 1, deploymentTargets: [
      { provider: "vercel", projectWorkspaceId: f.workspace.id, projectRef: "frontend", environment: "preview", serviceRef: "" },
      { provider: "railway", projectWorkspaceId: backend!.id, projectRef: "backend", environment: "staging", serviceRef: "api" },
    ] }, "local-board", before.revision);
    async function complete(issueId: string) { await db.update(issues).set({ status: "done" }).where(eq(issues.id, issueId)); await due(f.project.id); await f.service.tick(f.project.id); }
    async function dispatch() { await due(f.project.id); await f.service.tick(f.project.id); return (await f.service.get(f.project.id))!.state.activeIssueId!; }
    const discoveryId = await dispatch();
    await f.service.submitPlans(f.project.id, { issueId: discoveryId, summary: "Coordinate the simulator", recommendedPlanId: "balanced", plans: plans(f.workspace.id).map(plan => ({ ...plan, workspaceIds: [f.workspace.id, backend!.id] })) });
    await complete(discoveryId);
    const implementationId = await dispatch();
    const commits = [{ workspaceId: f.workspace.id, sha: "a".repeat(40), branch: "autopilot/test" }, { workspaceId: backend!.id, sha: "b".repeat(40), branch: "autopilot/test" }];
    await f.service.submitReport(f.project.id, autopilotReportSchema.parse({ issueId: implementationId, outcome: "passed", summary: "Both repositories built", evidence: [{ label: "Build", detail: "Frontend and backend passed" }], commits }), f.roster[0]!.id, randomUUID());
    await complete(implementationId);
    const reviewId = await dispatch();
    expect((await db.select().from(issues).where(eq(issues.id, reviewId)))[0]?.assigneeAgentId).toBe(f.roster[1]!.id);
    await expect(f.service.submitReport(f.project.id, autopilotReportSchema.parse({ issueId: reviewId, outcome: "passed", summary: "Self review", evidence: [{ label: "Review", detail: "Builder claims approval" }] }), f.roster[0]!.id, randomUUID())).rejects.toThrow("implementation agent");
    await f.service.submitReport(f.project.id, autopilotReportSchema.parse({ issueId: reviewId, outcome: "passed", summary: "Independent review passed", evidence: [{ label: "Review", detail: "Reproduced both builds and acceptance criteria" }] }), f.roster[1]!.id, randomUUID());
    await complete(reviewId);
    const verificationId = await dispatch();
    const report = autopilotReportSchema.parse({ issueId: verificationId, outcome: "passed", summary: "Both deployments verified", evidence: [{ label: "Browser", detail: "End-to-end simulator flow passed" }], deployments: [
      { provider: "vercel", workspaceId: f.workspace.id, projectRef: "frontend", environment: "preview", serviceRef: "", deploymentRef: "dpl_front", sourceSha: "a".repeat(40), status: "ready", health: "passed", url: "https://preview.example.com" },
      { provider: "railway", workspaceId: backend!.id, projectRef: "backend", environment: "staging", serviceRef: "api", deploymentRef: "dpl_back", sourceSha: "b".repeat(40), status: "ready", health: "passed", url: "https://api.example.com" },
    ] });
    await expect(f.service.submitReport(f.project.id, { ...report, deployments: report.deployments.map(item => ({ ...item, sourceSha: "c".repeat(40) })) }, f.roster[1]!.id, randomUUID())).rejects.toThrow("implementation commit");
    await f.service.submitReport(f.project.id, report, f.roster[1]!.id, randomUUID());
    await complete(verificationId);
    expect((await f.service.get(f.project.id))?.state.status).toBe("completed");
    await due(f.project.id); await f.service.tick(f.project.id);
    expect(f.wakeup).toHaveBeenCalledTimes(4);
    expect((await f.service.get(f.project.id))?.state.summary).toContain("Límite diario");
  });

  it("does not replace a completed task with an unsupported claim of success", async () => {
    const f = await seed(); await f.service.tick(f.project.id);
    const issueId = (await f.service.get(f.project.id))!.state.activeIssueId!;
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, issueId));
    await due(f.project.id); await f.service.tick(f.project.id);
    expect((await f.service.get(f.project.id))?.state.status).toBe("blocked");
    expect(f.wakeup).toHaveBeenCalledTimes(1);
  });

  async function http<T>(actor: Express.Request["actor"], service: ReturnType<typeof projectAutopilotService>, run: (client: ReturnType<typeof request>) => Promise<T>) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.actor = actor; next(); });
    app.use("/api", projectAutopilotRoutes(db, service)); app.use(errorHandler);
    const server = app.listen(Number(process.env.PAPERCLIP_AUTOPILOT_HTTP_TEST_PORT || 0), "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try { return await run(request(server)); }
    finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  }
  it("returns the same 404 for foreign and nonexistent project IDs", async () => {
    const f = await seed();
    await http({ type: "board", source: "session", userId: "outsider", companyIds: [randomUUID()] }, f.service, async client => {
      expect((await client.get(`/api/projects/${f.project.id}/autopilot`)).status).toBe(404);
      expect((await client.get(`/api/projects/${randomUUID()}/autopilot`)).status).toBe(404);
    });
  });
  it("denies agent configuration changes and result submissions without a task-bound run", async () => {
    const f = await seed();
    await http({ type: "agent", source: "agent_key", companyId: f.companyId, agentId: f.roster[0]!.id }, f.service, async client => {
      expect((await client.put(`/api/projects/${f.project.id}/autopilot`).send({ config: f.config })).status).toBe(403);
      const report = autopilotReportSchema.parse({ issueId: randomUUID(), outcome: "blocked", summary: "Blocked", evidence: [{ label: "Observation", detail: "No connection" }] });
      expect((await client.post(`/api/projects/${f.project.id}/autopilot/reports`).send(report)).status).toBe(403);
    });
  });
});
