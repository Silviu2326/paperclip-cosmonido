import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, createDb, playbookRuns, routines } from "@paperclipai/db";
import type { PlaybookStep } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { playbookService } from "../services/playbooks.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

const steps: PlaybookStep[] = [
  { key: "respond", kind: "respond", autonomy: "send_direct", maxAttempts: 2, channel: "email", instructions: "Reply" },
  { key: "follow_up", kind: "follow_up", autonomy: "send_with_approval", maxAttempts: 2, channel: "email" },
  { key: "close", kind: "close", autonomy: "draft_only", maxAttempts: 1 },
];

describePg("playbook services", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  // Routine creation is faked but still inserts a real routines row, so run.lastRoutineId foreign keys hold.
  const routineCreate = vi.fn();
  const runRoutine = vi.fn(async () => ({}));
  const fakeRoutines = {
    create: routineCreate,
    runRoutine,
  } as never;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-playbooks-");
    db = createDb(tempDb.connectionString);
    routineCreate.mockImplementation(async (companyId: string, input: { title: string; assigneeAgentId?: string | null }) => {
      const [row] = await db.insert(routines).values({
        companyId,
        title: input.title,
        assigneeAgentId: input.assigneeAgentId ?? null,
        responsibleUserId: "board-user",
      }).returning();
      return row;
    });
  }, 90_000);

  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `PB${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }
  async function publishedPlaybook(companyId: string, key: string, playbookSteps: PlaybookStep[] = steps) {
    const svc = playbookService(db, { routines: fakeRoutines });
    const draft = await svc.create(companyId, { key, name: `Playbook ${key}`, scopeKind: "lead_type", steps: playbookSteps }, { userId: "board-user" });
    return svc.publishVersion(draft.id, { userId: "board-user" });
  }
  const board = { userId: "board-user" };

  it("keeps a running run on the version it started with after a newer version is published", async () => {
    const c = await company("Pinned");
    const a = await agent(c.id, "Seller");
    const v1 = await publishedPlaybook(c.id, `pinned-${randomUUID().slice(0, 6)}`);
    const svc = playbookService(db, { routines: fakeRoutines });
    const run = await svc.start(c.id, { playbookId: v1.id, subjectKind: "lead", subjectId: "lead-1", agentId: a.id, idempotencyKey: randomUUID() }, board);
    expect(run.status).toBe("running");

    const v2Draft = await svc.newDraftFrom(v1.id, board);
    expect(v2Draft.version).toBe(2);
    expect(v2Draft.key).toBe(v1.key);
    await svc.update(v2Draft.id, { steps: [{ key: "only", kind: "respond", autonomy: "draft_only" }] }, board);
    const v2 = await svc.publishVersion(v2Draft.id, board);
    expect(v2.status).toBe("active");
    const [archivedV1] = [await svc.getById(v1.id)];
    expect(archivedV1?.status).toBe("archived");

    const advanced = await svc.advance(run.id, { expectedStepIndex: 0, outcome: "done" }, board);
    expect(advanced.playbookId).toBe(v1.id);
    expect(advanced.playbookVersion).toBe(1);
    expect(advanced.currentStepIndex).toBe(1);
    const [stored] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, run.id));
    expect(stored.playbookId).toBe(v1.id);
    await expect(svc.update(v1.id, { name: "changed" }, board)).rejects.toMatchObject({ status: 409 });
  });

  it("advances only the current step; a stale expectedStepIndex is rejected and dispatches nothing", async () => {
    const c = await company("Idempotent");
    const a = await agent(c.id, "Seller");
    const playbook = await publishedPlaybook(c.id, `idem-${randomUUID().slice(0, 6)}`);
    const svc = playbookService(db, { routines: fakeRoutines });
    const run = await svc.start(c.id, { playbookId: playbook.id, subjectKind: "lead", subjectId: "lead-2", agentId: a.id, idempotencyKey: randomUUID() }, board);
    const callsBefore = routineCreate.mock.calls.length;

    await svc.advance(run.id, { expectedStepIndex: 0, outcome: "done" }, board);
    expect(routineCreate.mock.calls.length).toBe(callsBefore + 1);
    await expect(svc.advance(run.id, { expectedStepIndex: 0, outcome: "done" }, board)).rejects.toMatchObject({ status: 409 });
    expect(routineCreate.mock.calls.length).toBe(callsBefore + 1);
    const [stored] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, run.id));
    expect(stored.currentStepIndex).toBe(1);
  });

  it("starting with the same idempotency key returns the existing run without a second routine", async () => {
    const c = await company("StartIdem");
    const a = await agent(c.id, "Seller");
    const playbook = await publishedPlaybook(c.id, `start-${randomUUID().slice(0, 6)}`);
    const svc = playbookService(db, { routines: fakeRoutines });
    const key = randomUUID();
    const first = await svc.start(c.id, { playbookId: playbook.id, subjectKind: "lead", subjectId: "lead-3", agentId: a.id, idempotencyKey: key }, board);
    const callsBefore = routineCreate.mock.calls.length;
    const again = await svc.start(c.id, { playbookId: playbook.id, subjectKind: "lead", subjectId: "lead-3", agentId: a.id, idempotencyKey: key }, board);
    expect(again.id).toBe(first.id);
    expect(routineCreate.mock.calls.length).toBe(callsBefore);
  });

  it("uses the minimum of the playbook step autonomy and the agent grant", async () => {
    const c = await company("Autonomy");
    const a = await agent(c.id, "Seller");
    const playbook = await publishedPlaybook(c.id, `auton-${randomUUID().slice(0, 6)}`);
    const resolveAgentAutonomy = vi.fn(async () => "send_with_approval" as const);
    const svc = playbookService(db, { routines: fakeRoutines, resolveAgentAutonomy });
    routineCreate.mockClear();
    await svc.start(c.id, { playbookId: playbook.id, subjectKind: "lead", subjectId: "lead-4", agentId: a.id, idempotencyKey: randomUUID() }, board);
    const input = routineCreate.mock.calls[0]![1] as { description: string };
    // Step 0 is send_direct, so the agent grant (send_with_approval) is the ceiling.
    expect(input.description).toContain("Autonomía efectiva: send_with_approval");
    expect(resolveAgentAutonomy).toHaveBeenCalledWith(c.id, a.id, "message");
  });

  it("returns 404 when a playbook from another company is started", async () => {
    const own = await company("Own playbook");
    const other = await company("Other playbook");
    const a = await agent(own.id, "Seller");
    const foreign = await publishedPlaybook(other.id, `foreign-${randomUUID().slice(0, 6)}`);
    const svc = playbookService(db, { routines: fakeRoutines });
    await expect(svc.start(own.id, { playbookId: foreign.id, subjectKind: "lead", subjectId: "lead-5", agentId: a.id, idempotencyKey: randomUUID() }, board))
      .rejects.toMatchObject({ status: 404 });
  });

  it("dispatches a delayed step only when tickDue reaches nextActionAt", async () => {
    const c = await company("Delay");
    const a = await agent(c.id, "Seller");
    const playbook = await publishedPlaybook(c.id, `delay-${randomUUID().slice(0, 6)}`, [
      { key: "wait_first", kind: "follow_up", autonomy: "send_with_approval", delayHours: 2 },
    ]);
    const svc = playbookService(db, { routines: fakeRoutines });
    routineCreate.mockClear();
    const run = await svc.start(c.id, { playbookId: playbook.id, subjectKind: "lead", subjectId: "lead-6", agentId: a.id, idempotencyKey: randomUUID() }, board);
    expect(run.status).toBe("waiting");
    expect(routineCreate).not.toHaveBeenCalled();
    expect(await svc.tickDue(new Date(Date.now() + 60 * 60_000))).toBe(0);
    expect(await svc.tickDue(new Date(Date.now() + 3 * 60 * 60_000))).toBe(1);
    expect(routineCreate).toHaveBeenCalledTimes(1);
    const after = await svc.getRun(run.id);
    expect(after?.status).toBe("running");
  });
});
