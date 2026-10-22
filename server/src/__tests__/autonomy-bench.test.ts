import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agents, autonomyBenchRuns, companies, costEvents, createDb } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { autonomyBench, loadFixtureCases, tokenOverlapScore } from "../services/autonomy-bench.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

describe("autonomy bench fixtures and heuristic judge", () => {
  it("ships at least six deterministic fixture cases across email, message and proposal", () => {
    const cases = ["email", "message", "proposal"].flatMap((type) => loadFixtureCases(type as "email", 20));
    expect(cases.length).toBeGreaterThanOrEqual(6);
    expect(new Set(cases.map((item) => item.actionType))).toEqual(new Set(["email", "message", "proposal"]));
    expect(loadFixtureCases("email", 20).map((item) => item.caseId)).toEqual(loadFixtureCases("email", 20).map((item) => item.caseId));
  });

  it("scores identical text as 1 and disjoint text as 0", () => {
    expect(tokenOverlapScore("Hola, gracias", "hola gracias")).toBe(1);
    expect(tokenOverlapScore("alfa beta", "gamma delta")).toBe(0);
  });
});

describePg("autonomy bench runs", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { tempDb = await startEmbeddedPostgresTestDatabase("paperclip-autonomy-bench-"); db = createDb(tempDb.connectionString); }, 240_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `AB${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }
  const actor = { userId: "board-user", agentId: null };

  it("runs fixtures deterministically, records a zero-cost autonomy_bench receipt and finishes done", async () => {
    const c = await company("Bench"); const a = await agent(c.id, "Bench agent");
    const bench = autonomyBench(db);
    const first = await bench.run(c.id, a.id, "email", { sampleSize: 20 }, actor);
    const second = await bench.run(c.id, a.id, "email", { sampleSize: 20 }, actor);

    expect(first.status).toBe("done");
    expect(first.casesEvaluated).toBe(3);
    expect(first.score).toBe(second.score);
    expect(first.threshold).toBe(0.85);
    expect(first.failures).toEqual([]);
    expect(first.judgeModel).toBe("heuristic-v1");

    const [receipt] = await db.select().from(costEvents).where(eq(costEvents.idempotencyKey, `autonomy-bench:${first.id}`));
    expect(receipt).toBeDefined();
    expect(receipt!.usageKind).toBe("autonomy_bench");
    expect(receipt!.agentId).toBe(a.id);
    expect(Number(receipt!.costCents)).toBe(0);
  });

  it("records failures for cases whose candidate scores below 0.6", async () => {
    const c = await company("Bench failures"); const a = await agent(c.id, "Failing agent");
    const bench = autonomyBench(db, { candidate: async () => "Texto completamente distinto sobre otra cosa" });
    const run = await bench.run(c.id, a.id, "message", { sampleSize: 20, threshold: 0.9 }, actor);
    expect(run.status).toBe("done");
    expect(run.threshold).toBe(0.9);
    expect(run.score).toBeLessThan(0.6);
    expect(run.failures.length).toBe(3);
    expect(run.failures[0]).toMatchObject({ dimension: expect.any(String), expected: expect.any(String), actual: expect.any(String) });
  });

  it("marks the run failed with an error when no cases are available", async () => {
    const c = await company("Bench empty"); const a = await agent(c.id, "Empty agent");
    const bench = autonomyBench(db, { loadCases: async () => [] });
    const run = await bench.run(c.id, a.id, "publish", { sampleSize: 5 }, actor);
    expect(run.status).toBe("failed");
    expect(run.error).toContain("publish");
    expect(run.score).toBeNull();
  });

  it("refuses a second run while one is still running for the same agent and action type", async () => {
    const c = await company("Bench running"); const a = await agent(c.id, "Busy agent");
    await db.insert(autonomyBenchRuns).values({ companyId: c.id, agentId: a.id, actionType: "email", sampleSize: 20, status: "running" });
    const bench = autonomyBench(db);
    await expect(bench.run(c.id, a.id, "email", { sampleSize: 20 }, actor)).rejects.toMatchObject({ status: 409 });
    // Another action type for the same agent is not blocked.
    const other = await bench.run(c.id, a.id, "proposal", { sampleSize: 20 }, actor);
    expect(other.status).toBe("done");
    const rows = await db.select().from(autonomyBenchRuns).where(and(eq(autonomyBenchRuns.companyId, c.id), eq(autonomyBenchRuns.agentId, a.id)));
    expect(rows).toHaveLength(2);
  });

  it("lists runs with filters and returns a run by id", async () => {
    const c = await company("Bench list"); const a = await agent(c.id, "List agent");
    const bench = autonomyBench(db);
    const run = await bench.run(c.id, a.id, "proposal", { sampleSize: 20 }, actor);
    expect((await bench.list(c.id, { agentId: a.id, actionType: "proposal" })).map((row) => row.id)).toEqual([run.id]);
    expect((await bench.list(c.id, { status: "failed" }))).toEqual([]);
    expect((await bench.getById(run.id))?.id).toBe(run.id);
    expect(await bench.getById(randomUUID())).toBeNull();
  });
});
