import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { agents, autonomyBenchRuns, autonomyPolicies, companies, createDb, routineTriggers, routines } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { autonomyService } from "../services/autonomy.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

describePg("autonomy services", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { tempDb = await startEmbeddedPostgresTestDatabase("paperclip-autonomy-"); db = createDb(tempDb.connectionString); }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `AU${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }
  async function passingBench(companyId: string, agentId: string, actionType = "email", score = 0.92) {
    return (await db.insert(autonomyBenchRuns).values({
      companyId, agentId, actionType, sampleSize: 20, casesEvaluated: 20, status: "done", score, threshold: 0.85, finishedAt: new Date(),
    }).returning())[0]!;
  }
  const actor = { userId: "board-user", agentId: null };

  it("effective level is min(company, agent) and defaults to draft_only without grants", async () => {
    const c = await company("Effective"); const a = await agent(c.id, "Sales");
    const svc = autonomyService(db);

    expect((await svc.effectiveLevel(c.id, a.id, "email")).level).toBe("draft_only");

    await svc.grant(c.id, { agentId: null, actionType: "email", level: "send_direct", reason: null, benchRunId: null }, actor);
    const bench = await passingBench(c.id, a.id);
    await svc.grant(c.id, { agentId: a.id, actionType: "email", level: "send_direct", reason: null, benchRunId: bench.id }, actor);
    expect((await svc.effectiveLevel(c.id, a.id, "email")).level).toBe("send_direct");

    await svc.grant(c.id, { agentId: null, actionType: "email", level: "send_with_approval", reason: "cap", benchRunId: null }, actor);
    const capped = await svc.effectiveLevel(c.id, a.id, "email");
    expect(capped.level).toBe("send_with_approval");
    expect(capped.source).toBe("company");
  });

  it("company send_direct with agent send_with_approval resolves to send_with_approval from the agent row", async () => {
    const c = await company("Agent lower"); const a = await agent(c.id, "Support");
    const svc = autonomyService(db);
    await svc.grant(c.id, { agentId: null, actionType: "message", level: "send_direct", reason: null, benchRunId: null }, actor);
    const bench = await passingBench(c.id, a.id, "message");
    const granted = await svc.grant(c.id, { agentId: a.id, actionType: "message", level: "send_with_approval", reason: null, benchRunId: bench.id }, actor);
    const effective = await svc.effectiveLevel(c.id, a.id, "message");
    expect(effective.level).toBe("send_with_approval");
    expect(effective.source).toBe("agent");
    expect(effective.policyId).toBe(granted.id);
  });

  it("company send_with_approval caps an agent grant of send_direct", async () => {
    const c = await company("Company cap"); const a = await agent(c.id, "Cap");
    const svc = autonomyService(db);
    const bench = await passingBench(c.id, a.id, "proposal");
    await svc.grant(c.id, { agentId: a.id, actionType: "proposal", level: "send_direct", reason: null, benchRunId: bench.id }, actor);
    await svc.grant(c.id, { agentId: null, actionType: "proposal", level: "send_with_approval", reason: null, benchRunId: null }, actor);
    expect((await svc.effectiveLevel(c.id, a.id, "proposal")).level).toBe("send_with_approval");
  });

  it("raising an agent above draft_only without a passing bench is a 409 with an actionable message", async () => {
    const c = await company("Bench gate"); const a = await agent(c.id, "Gate");
    const svc = autonomyService(db);
    const error = await svc.grant(c.id, { agentId: a.id, actionType: "email", level: "send_with_approval", reason: null, benchRunId: null }, actor).catch((e) => e);
    expect(error).toMatchObject({ status: 409 });
    expect(String(error.message)).toContain("Run the autonomy bench first");

    const failing = (await db.insert(autonomyBenchRuns).values({ companyId: c.id, agentId: a.id, actionType: "email", sampleSize: 20, status: "done", score: 0.5, threshold: 0.85 }).returning())[0]!;
    await expect(svc.grant(c.id, { agentId: a.id, actionType: "email", level: "send_with_approval", reason: null, benchRunId: failing.id }, actor)).rejects.toMatchObject({ status: 409 });

    const bench = await passingBench(c.id, a.id);
    const ok = await svc.grant(c.id, { agentId: a.id, actionType: "email", level: "send_with_approval", reason: "bench passed", benchRunId: bench.id }, actor);
    expect(ok.level).toBe("send_with_approval");
    expect(ok.benchRunId).toBe(bench.id);
  });

  it("lowering an agent level never needs a bench and supersedes the previous row", async () => {
    const c = await company("Lower"); const a = await agent(c.id, "Lower");
    const svc = autonomyService(db);
    const bench = await passingBench(c.id, a.id, "call");
    const first = await svc.grant(c.id, { agentId: a.id, actionType: "call", level: "send_with_approval", reason: null, benchRunId: bench.id }, actor);
    const lowered = await svc.grant(c.id, { agentId: a.id, actionType: "call", level: "draft_only", reason: "back to drafts", benchRunId: null }, actor);
    expect(lowered.level).toBe("draft_only");
    const [previous] = await db.select().from(autonomyPolicies).where(eq(autonomyPolicies.id, first.id));
    expect(previous!.revokedReason).toBe("superseded");
    expect(previous!.revokedAt).not.toBeNull();
    const history = await svc.history(c.id, a.id, "call");
    expect(history.map((row) => row.id)).toEqual([lowered.id, first.id]);
  });

  it("revoke disables pending playbook triggers of the agent and calls onRevoke", async () => {
    const c = await company("Revoke"); const a = await agent(c.id, "Revoke agent"); const other = await agent(c.id, "Other agent");
    const bench = await passingBench(c.id, a.id, "email");
    const onRevoke = vi.fn(async () => {});
    const svc = autonomyService(db, { onRevoke });
    await svc.grant(c.id, { agentId: a.id, actionType: "email", level: "send_with_approval", reason: null, benchRunId: bench.id }, actor);

    const [playbookRoutine] = await db.insert(routines).values({ companyId: c.id, title: "Follow-up", assigneeAgentId: a.id, originKind: "playbook", originId: randomUUID() }).returning();
    const [otherRoutine] = await db.insert(routines).values({ companyId: c.id, title: "Other", assigneeAgentId: other.id, originKind: "playbook", originId: randomUUID() }).returning();
    const [trigger] = await db.insert(routineTriggers).values({ companyId: c.id, routineId: playbookRoutine!.id, kind: "schedule", enabled: true, cronExpression: "0 9 * * *", timezone: "UTC" }).returning();
    const [otherTrigger] = await db.insert(routineTriggers).values({ companyId: c.id, routineId: otherRoutine!.id, kind: "schedule", enabled: true, cronExpression: "0 9 * * *", timezone: "UTC" }).returning();

    const result = await svc.revoke(c.id, { agentId: a.id, actionType: "email", reason: "Quejas del cliente" }, actor);
    expect(result.triggersDisabled).toBe(1);
    expect(result.policy.revokedReason).toBe("Quejas del cliente");
    expect(result.policy.revokedAt).not.toBeNull();
    expect(onRevoke).toHaveBeenCalledWith({ companyId: c.id, agentId: a.id, actionType: "email" });

    const [disabled] = await db.select().from(routineTriggers).where(eq(routineTriggers.id, trigger!.id));
    const [untouched] = await db.select().from(routineTriggers).where(eq(routineTriggers.id, otherTrigger!.id));
    expect(disabled!.enabled).toBe(false);
    expect(untouched!.enabled).toBe(true);
    expect((await svc.effectiveLevel(c.id, a.id, "email")).level).toBe("draft_only");
  });

  it("revoke without an active grant is a 404", async () => {
    const c = await company("Revoke none"); const a = await agent(c.id, "None");
    await expect(autonomyService(db).revoke(c.id, { agentId: a.id, actionType: "email", reason: "x" }, actor)).rejects.toMatchObject({ status: 404 });
  });

  it("records shadow outcomes without losing counts under concurrency", async () => {
    const c = await company("Shadow"); const a = await agent(c.id, "Shadow agent");
    const svc = autonomyService(db);
    await Promise.all(Array.from({ length: 10 }, () => svc.recordShadowOutcome(c.id, { agentId: a.id, actionType: "email", outcome: "sent_unchanged" })));
    await svc.recordShadowOutcome(c.id, { agentId: a.id, actionType: "email", outcome: "edited" });
    await svc.recordShadowOutcome(c.id, { agentId: a.id, actionType: "email", outcome: "rejected" });
    const stats = await svc.stats(c.id, a.id, "email");
    expect(stats.drafts).toBe(12);
    expect(stats.sentUnchanged).toBe(10);
    expect(stats.edited).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.unchangedRatio).toBeCloseTo(10 / 12);
  });

  it("matrix lists every active agent for every action type with stats and bench", async () => {
    const c = await company("Matrix"); const a = await agent(c.id, "Matrix agent");
    await agent(c.id, "Terminated");
    await db.update(agents).set({ status: "terminated" }).where(and(eq(agents.companyId, c.id), eq(agents.name, "Terminated")));
    const svc = autonomyService(db);
    const bench = await passingBench(c.id, a.id, "email");
    await svc.grant(c.id, { agentId: a.id, actionType: "email", level: "send_with_approval", reason: null, benchRunId: bench.id }, actor);
    const cells = await svc.matrix(c.id);
    expect(cells).toHaveLength(7);
    const email = cells.find((cell) => cell.actionType === "email")!;
    expect(email.level).toBe("send_with_approval");
    expect(email.nextLevel).toBe("send_direct");
    expect(email.canRaise).toBe(true);
    expect(cells.find((cell) => cell.actionType === "message")!.level).toBe("draft_only");
  });

  it("proposeRaise proposes once when drafts pass the thresholds and skips running benches", async () => {
    const c = await company("Propose"); const a = await agent(c.id, "Proposer");
    const createRaiseDecision = vi.fn(async () => ({ decisionId: randomUUID() }));
    const svc = autonomyService(db, { createRaiseDecision });
    for (let i = 0; i < 20; i += 1) await svc.recordShadowOutcome(c.id, { agentId: a.id, actionType: "message", outcome: "sent_unchanged" });
    const proposals = await svc.proposeRaise(c.id);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ agentId: a.id, actionType: "message", fromLevel: "draft_only", toLevel: "send_with_approval" });

    await db.insert(autonomyBenchRuns).values({ companyId: c.id, agentId: a.id, actionType: "proposal", sampleSize: 20, status: "running" });
    for (let i = 0; i < 20; i += 1) await svc.recordShadowOutcome(c.id, { agentId: a.id, actionType: "proposal", outcome: "sent_unchanged" });
    const second = await svc.proposeRaise(c.id);
    expect(second.map((p) => p.actionType)).not.toContain("proposal");
  });
});
