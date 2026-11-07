import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  companies,
  createDb,
  crmActivities,
  customers,
  getEmbeddedPostgresTestSupport,
  opportunities,
  pipelines,
  pipelineTransitions,
  startEmbeddedPostgresTestDatabase,
} from "@paperclipai/db";
import { opportunityService } from "./opportunities.js";
import { crmActivityService } from "./activities.js";
import { commitmentService } from "./commitments.js";

const external = process.env.PAPERCLIP_TEST_DATABASE_URL;
const support = external ? { supported: true } : await getEmbeddedPostgresTestSupport();
const suite = support.supported ? describe : describe.skip;

suite("opportunities, activities and commitments (A2, real PostgreSQL)", () => {
  let db: ReturnType<typeof createDb>;
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;

  beforeAll(async () => {
    if (external) db = createDb(external);
    else {
      temporary = await startEmbeddedPostgresTestDatabase("paperclip-crm-a2-");
      db = createDb(temporary.connectionString);
    }
  }, 180_000);

  afterAll(async () => {
    await db?.$client.end();
    await temporary?.cleanup();
  });

  async function fixture() {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "A2 fixture", issuePrefix: `A${companyId.slice(0, 7)}` });
    const [customer] = await db
      .insert(customers)
      .values({ companyId, kind: "organization", name: "Acme" })
      .returning();
    return { companyId, customerId: customer!.id };
  }

  it("creates the sales pipeline once and reuses it", async () => {
    const { companyId } = await fixture();
    const svc = opportunityService(db);
    const first = await svc.ensureSalesPipeline(companyId);
    const second = await svc.ensureSalesPipeline(companyId);
    expect(second.id).toBe(first.id);
    expect(Object.keys(first.stageIds).sort()).toEqual(
      ["lost", "negotiation", "new", "proposal", "qualified", "won"],
    );
    const rows = await db.select().from(pipelines).where(eq(pipelines.companyId, companyId));
    expect(rows.filter((row) => row.key === "sales")).toHaveLength(1);
  });

  it("rejects a stale expectedVersion on update with 409 and leaves the row unchanged", async () => {
    const { companyId, customerId } = await fixture();
    const svc = opportunityService(db);
    const created = await svc.create(companyId, { customerId, title: "Pilot", stageKey: "new" } as never);
    expect(created.version).toBe(1);

    const updated = await svc.update(companyId, created.id, { title: "Pilot v2", expectedVersion: 1 } as never);
    expect(updated.version).toBe(2);

    await expect(
      svc.update(companyId, created.id, { title: "Stale", expectedVersion: 1 } as never),
    ).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, created.id));
    expect(row!.title).toBe("Pilot v2");
    expect(row!.version).toBe(2);
  });

  it("changes stage with a version bump and a stage_change activity; stale versions get 409", async () => {
    const { companyId, customerId } = await fixture();
    const svc = opportunityService(db);
    const created = await svc.create(companyId, { customerId, title: "Renewal", stageKey: "new" } as never);

    const moved = await svc.changeStage(companyId, created.id, { stageKey: "qualified", expectedVersion: 1 });
    expect(moved.stageKey).toBe("qualified");
    expect(moved.version).toBe(2);
    expect(moved.status).toBe("open");

    await expect(
      svc.changeStage(companyId, created.id, { stageKey: "proposal", expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });

    const activities = await db
      .select()
      .from(crmActivities)
      .where(and(eq(crmActivities.subjectId, created.id), eq(crmActivities.kind, "stage_change")));
    expect(activities).toHaveLength(1);
    expect(activities[0]!.payload).toMatchObject({ fromStageKey: "new", toStageKey: "qualified" });
  });

  it("enforces declared transitions when the pipeline enforces them", async () => {
    const { companyId, customerId } = await fixture();
    const svc = opportunityService(db);
    const sales = await svc.ensureSalesPipeline(companyId);
    await db.update(pipelines).set({ enforceTransitions: true }).where(eq(pipelines.id, sales.id));
    await db.insert(pipelineTransitions).values({
      pipelineId: sales.id,
      fromStageId: sales.stageIds.new,
      toStageId: sales.stageIds.qualified,
    });
    const created = await svc.create(companyId, { customerId, title: "Strict", stageKey: "new" } as never);

    await expect(
      svc.changeStage(companyId, created.id, { stageKey: "won", expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 422 });

    const ok = await svc.changeStage(companyId, created.id, { stageKey: "qualified", expectedVersion: 1 });
    expect(ok.stageKey).toBe("qualified");
  });

  it("closes as lost with the reason and closes as won through the same version check", async () => {
    const { companyId, customerId } = await fixture();
    const svc = opportunityService(db);
    const lost = await svc.create(companyId, { customerId, title: "Lost deal", stageKey: "new" } as never);
    const closedLost = await svc.close(companyId, lost.id, {
      outcome: "lost",
      expectedVersion: 1,
      reason: "Budget",
    });
    expect(closedLost.status).toBe("lost");
    expect(closedLost.lostReason).toBe("Budget");
    expect(closedLost.closedAt).not.toBeNull();

    const won = await svc.create(companyId, { customerId, title: "Won deal", stageKey: "new" } as never);
    const closedWon = await svc.close(companyId, won.id, { outcome: "won", expectedVersion: 1 });
    expect(closedWon.status).toBe("won");
  });

  it("is idempotent for creates with the same idempotencyKey", async () => {
    const { companyId, customerId } = await fixture();
    const svc = opportunityService(db);
    const input = { customerId, title: "Once", stageKey: "new", idempotencyKey: "req-1" } as never;
    const first = await svc.create(companyId, input);
    const second = await svc.create(companyId, input);
    expect(second.id).toBe(first.id);
    const rows = await db.select().from(opportunities).where(eq(opportunities.companyId, companyId));
    expect(rows).toHaveLength(1);
  });

  it("does not expose opportunities of another company", async () => {
    const a = await fixture();
    const b = await fixture();
    const svc = opportunityService(db);
    const created = await svc.create(a.companyId, { customerId: a.customerId, title: "Mine", stageKey: "new" } as never);
    expect(await svc.getById(b.companyId, created.id)).toBeNull();
    await expect(
      svc.changeStage(b.companyId, created.id, { stageKey: "qualified", expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps the activity timeline paginated and scoped to the subject", async () => {
    const { companyId } = await fixture();
    const activities = crmActivityService(db);
    const subjectId = randomUUID();
    for (let i = 0; i < 3; i++) {
      await activities.log(companyId, { subjectKind: "opportunity", subjectId, kind: "note", summary: `n${i}` });
    }
    const page1 = await activities.listBySubject(companyId, { subjectKind: "opportunity", subjectId, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await activities.listBySubject(companyId, {
      subjectKind: "opportunity",
      subjectId,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(1);
    const ids = [...page1.items, ...page2.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("resolves a commitment once; a second resolve is 409", async () => {
    const { companyId, customerId } = await fixture();
    const commitments = commitmentService(db);
    const created = await commitments.create(companyId, {
      who: "us",
      what: "Send the proposal",
      customerId,
    } as never);
    const kept = await commitments.resolve(companyId, created.id, { status: "kept" } as never);
    expect(kept.status).toBe("kept");
    await expect(
      commitments.resolve(companyId, created.id, { status: "missed" } as never),
    ).rejects.toMatchObject({ status: 409 });
  });
});
