import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, playbookRuns, playbooks, routines } from "@paperclipai/db";
import {
  createPlaybookSchema,
  minAutonomyLevel,
  type AdvancePlaybookRunInput,
  type AutonomyLevel,
  type CreatePlaybookInput,
  type PlaybookStep,
  type PlaybookStepKind,
  type PlaybookUsageSummary,
  type StartPlaybookRunInput,
  type UpdatePlaybookInput,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { routineService } from "./routines.js";

type PlaybookRow = typeof playbooks.$inferSelect;
type PlaybookRunRow = typeof playbookRuns.$inferSelect;
type Actor = { userId?: string | null; agentId?: string | null };

export interface PlaybookServiceDeps {
  /** Autonomy granted to an agent for an action type. Defaults to "draft_only" until the agent grant model is wired. */
  resolveAgentAutonomy?: (companyId: string, agentId: string | null, actionType: string) => Promise<AutonomyLevel>;
  routines?: ReturnType<typeof routineService>;
}

const ACTION_TYPE_BY_STEP_KIND: Record<PlaybookStepKind, string | null> = {
  respond: "message",
  follow_up: "message",
  propose: "proposal",
  book: "booking",
  close: "stage_change",
  handoff: "stage_change",
  qualify: null,
  wait: null,
};

/** Maps a step kind to the action type checked against the agent grant. Null means the step has no autonomy gate. */
export function actionTypeForStepKind(kind: PlaybookStepKind): string | null {
  return ACTION_TYPE_BY_STEP_KIND[kind] ?? null;
}

const TEMPLATES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../built-ins/playbooks");

/** Example playbooks shipped with the server. Each file is a createPlaybookSchema input. */
export function listPlaybookTemplates(): CreatePlaybookInput[] {
  if (!existsSync(TEMPLATES_DIR)) return [];
  return readdirSync(TEMPLATES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => createPlaybookSchema.parse(JSON.parse(readFileSync(path.join(TEMPLATES_DIR, file), "utf8"))));
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function playbookService(db: Db, deps: PlaybookServiceDeps = {}) {
  const resolveAgentAutonomy = deps.resolveAgentAutonomy ?? (async () => "draft_only" as AutonomyLevel);
  let ownRoutines: ReturnType<typeof routineService> | null = null;
  const routineApi = () => {
    if (deps.routines) return deps.routines;
    if (!ownRoutines) ownRoutines = routineService(db);
    return ownRoutines;
  };

  async function lockKey(tx: Pick<Db, "execute">, name: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`);
  }

  async function getById(id: string): Promise<PlaybookRow | null> {
    const [row] = await db.select().from(playbooks).where(eq(playbooks.id, id));
    return row ?? null;
  }

  async function requirePlaybook(id: string): Promise<PlaybookRow> {
    const row = await getById(id);
    if (!row) throw notFound("Playbook not found");
    return row;
  }

  async function getRun(id: string): Promise<PlaybookRunRow | null> {
    const [row] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, id));
    return row ?? null;
  }

  async function requireRun(id: string): Promise<PlaybookRunRow> {
    const row = await getRun(id);
    if (!row) throw notFound("Playbook run not found");
    return row;
  }

  /** The run is pinned to one playbook row (one version); its steps never change after it starts. */
  async function pinnedPlaybook(run: PlaybookRunRow): Promise<PlaybookRow> {
    const [row] = await db.select().from(playbooks).where(eq(playbooks.id, run.playbookId));
    if (!row) throw notFound("Pinned playbook version not found");
    return row;
  }

  function list(companyId: string, query: { status?: string; key?: string } = {}) {
    const conditions = [eq(playbooks.companyId, companyId)];
    if (query.status) conditions.push(eq(playbooks.status, query.status));
    if (query.key) conditions.push(eq(playbooks.key, query.key));
    return db.select().from(playbooks).where(and(...conditions)).orderBy(playbooks.key, desc(playbooks.version));
  }

  async function create(companyId: string, input: CreatePlaybookInput, actor: Actor): Promise<PlaybookRow> {
    return db.transaction(async (tx) => {
      await lockKey(tx, `playbook:${companyId}:${input.key}`);
      const [existing] = await tx.select({ id: playbooks.id }).from(playbooks)
        .where(and(eq(playbooks.companyId, companyId), eq(playbooks.key, input.key), eq(playbooks.version, 1)));
      if (existing) throw conflict(`Playbook "${input.key}" version 1 already exists`);
      const [row] = await tx.insert(playbooks).values({
        companyId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        version: 1,
        status: "draft",
        scopeKind: input.scopeKind ?? "lead_type",
        scopeValue: input.scopeValue ?? null,
        steps: input.steps as PlaybookStep[],
        createdByAgentId: actor.agentId ?? null,
        createdByUserId: actor.userId ?? null,
      }).returning();
      return row!;
    });
  }

  async function createFromTemplate(companyId: string, templateKey: string, actor: Actor): Promise<PlaybookRow> {
    const template = listPlaybookTemplates().find((item) => item.key === templateKey);
    if (!template) throw notFound("Playbook template not found");
    return create(companyId, template, actor);
  }

  async function update(id: string, patch: UpdatePlaybookInput, _actor: Actor): Promise<PlaybookRow> {
    const current = await requirePlaybook(id);
    if (current.status !== "draft") throw conflict("Only draft playbook versions can be edited");
    const values: Partial<typeof playbooks.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description ?? null;
    if (patch.scopeKind !== undefined) values.scopeKind = patch.scopeKind;
    if (patch.scopeValue !== undefined) values.scopeValue = patch.scopeValue ?? null;
    if (patch.steps !== undefined) values.steps = patch.steps as PlaybookStep[];
    const [row] = await db.update(playbooks).set(values)
      .where(and(eq(playbooks.id, id), eq(playbooks.status, "draft")))
      .returning();
    if (!row) throw conflict("Only draft playbook versions can be edited");
    return row;
  }

  /** Copies any version into a new draft with the next version number for the same key. */
  async function newDraftFrom(id: string, actor: Actor): Promise<PlaybookRow> {
    const source = await requirePlaybook(id);
    return db.transaction(async (tx) => {
      await lockKey(tx, `playbook:${source.companyId}:${source.key}`);
      const [draft] = await tx.select({ id: playbooks.id }).from(playbooks)
        .where(and(eq(playbooks.companyId, source.companyId), eq(playbooks.key, source.key), eq(playbooks.status, "draft")));
      if (draft) throw conflict(`A draft of "${source.key}" already exists`);
      const [max] = await tx.select({ version: sql<number>`max(${playbooks.version})` }).from(playbooks)
        .where(and(eq(playbooks.companyId, source.companyId), eq(playbooks.key, source.key)));
      const [row] = await tx.insert(playbooks).values({
        companyId: source.companyId,
        key: source.key,
        name: source.name,
        description: source.description,
        version: Number(max?.version ?? 0) + 1,
        status: "draft",
        scopeKind: source.scopeKind,
        scopeValue: source.scopeValue,
        steps: source.steps,
        createdByAgentId: actor.agentId ?? null,
        createdByUserId: actor.userId ?? null,
      }).returning();
      return row!;
    });
  }

  /** Publishing makes the draft the active version. The previously active version of the key is archived. Runs keep their pinned version. */
  async function publishVersion(id: string, _actor: Actor): Promise<PlaybookRow> {
    const target = await requirePlaybook(id);
    return db.transaction(async (tx) => {
      await lockKey(tx, `playbook:${target.companyId}:${target.key}`);
      const [current] = await tx.select().from(playbooks).where(eq(playbooks.id, id));
      if (!current || current.status !== "draft") throw conflict("Only draft playbook versions can be published");
      const now = new Date();
      await tx.update(playbooks)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(and(eq(playbooks.companyId, current.companyId), eq(playbooks.key, current.key), eq(playbooks.status, "active")));
      const [row] = await tx.update(playbooks)
        .set({ status: "active", publishedAt: now, updatedAt: now })
        .where(eq(playbooks.id, id))
        .returning();
      return row!;
    });
  }

  async function archive(id: string, _actor: Actor): Promise<PlaybookRow> {
    const current = await requirePlaybook(id);
    if (current.status === "archived") return current;
    const now = new Date();
    const [row] = await db.update(playbooks)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(eq(playbooks.id, id))
      .returning();
    return row!;
  }

  async function usage(companyId: string): Promise<PlaybookUsageSummary[]> {
    const rows = await db.select({
      playbookId: playbookRuns.playbookId,
      status: playbookRuns.status,
      count: sql<number>`count(*)::int`,
    }).from(playbookRuns)
      .where(eq(playbookRuns.companyId, companyId))
      .groupBy(playbookRuns.playbookId, playbookRuns.status);
    const byPlaybook = new Map<string, PlaybookUsageSummary>();
    for (const row of rows) {
      const summary = byPlaybook.get(row.playbookId) ?? { playbookId: row.playbookId, runningRuns: 0, waitingRuns: 0, doneRuns: 0, failedRuns: 0 };
      const count = Number(row.count);
      if (row.status === "running") summary.runningRuns += count;
      else if (row.status === "waiting") summary.waitingRuns += count;
      else if (row.status === "done") summary.doneRuns += count;
      else if (row.status === "failed") summary.failedRuns += count;
      byPlaybook.set(row.playbookId, summary);
    }
    return [...byPlaybook.values()];
  }

  function listRuns(companyId: string, query: { status?: string; subjectKind?: string; subjectId?: string; playbookId?: string; limit?: number } = {}) {
    const conditions = [eq(playbookRuns.companyId, companyId)];
    if (query.status) conditions.push(eq(playbookRuns.status, query.status));
    if (query.subjectKind) conditions.push(eq(playbookRuns.subjectKind, query.subjectKind));
    if (query.subjectId) conditions.push(eq(playbookRuns.subjectId, query.subjectId));
    if (query.playbookId) conditions.push(eq(playbookRuns.playbookId, query.playbookId));
    return db.select().from(playbookRuns).where(and(...conditions)).orderBy(desc(playbookRuns.createdAt)).limit(query.limit ?? 50);
  }

  /** Starts a run on the active version of a playbook. Idempotent on (companyId, idempotencyKey). The first step is dispatched immediately. */
  async function start(companyId: string, input: StartPlaybookRunInput, actor: Actor): Promise<PlaybookRunRow> {
    const requested = await getById(input.playbookId);
    if (!requested || requested.companyId !== companyId) throw notFound("Playbook not found");
    let playbook = requested;
    if (playbook.status !== "active") {
      const [active] = await db.select().from(playbooks)
        .where(and(eq(playbooks.companyId, companyId), eq(playbooks.key, playbook.key), eq(playbooks.status, "active")));
      if (!active) throw conflict("Playbook is not active");
      playbook = active;
    }
    const agentId = input.agentId ?? actor.agentId ?? null;
    if (!agentId) throw unprocessable("A playbook run needs an agent");
    const [agent] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)));
    if (!agent) throw notFound("Agent not found in this company");

    const outcome = await db.transaction(async (tx) => {
      await lockKey(tx, `playbook-run:${companyId}:${input.idempotencyKey}`);
      const [found] = await tx.select().from(playbookRuns)
        .where(and(eq(playbookRuns.companyId, companyId), eq(playbookRuns.idempotencyKey, input.idempotencyKey)));
      if (found) {
        if (found.playbookId !== playbook.id || found.subjectKind !== input.subjectKind || found.subjectId !== input.subjectId) {
          throw conflict("Idempotency key belongs to another playbook run");
        }
        return { run: found, created: false };
      }
      const [row] = await tx.insert(playbookRuns).values({
        companyId,
        playbookId: playbook.id,
        playbookVersion: playbook.version,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        agentId,
        currentStepIndex: 0,
        status: "running",
        idempotencyKey: input.idempotencyKey,
        startedByAgentId: actor.agentId ?? null,
        startedByUserId: actor.userId ?? null,
      }).returning();
      return { run: row!, created: true };
    });
    if (!outcome.created) return outcome.run;
    await runStep(outcome.run, { afterDelay: false, actor });
    return requireRun(outcome.run.id);
  }

  /**
   * Reports the outcome of the CURRENT step and moves the run on. Only the step at currentStepIndex can be advanced.
   * A stale expectedStepIndex is rejected with 409, so a repeated call never dispatches a second routine.
   */
  async function advance(runId: string, input: AdvancePlaybookRunInput, actor: Actor): Promise<PlaybookRunRow> {
    const run = await requireRun(runId);
    if (run.status !== "running") throw conflict(`Playbook run is ${run.status}; only running runs can advance`);
    if (input.expectedStepIndex !== undefined && input.expectedStepIndex !== run.currentStepIndex) {
      throw conflict(`Expected step ${input.expectedStepIndex} but the current step is ${run.currentStepIndex}`);
    }
    const playbook = await pinnedPlaybook(run);
    const steps = playbook.steps;
    const index = run.currentStepIndex;
    const now = new Date();
    const stepStillCurrent = and(eq(playbookRuns.id, run.id), eq(playbookRuns.currentStepIndex, index), eq(playbookRuns.status, "running"));
    const outcome = input.outcome ?? "done";

    if (outcome === "failed") {
      const [row] = await db.update(playbookRuns).set({
        status: "failed",
        failureReason: input.note?.trim() || `Step "${steps[index]?.key ?? index}" failed`,
        finishedAt: now,
        nextActionAt: null,
        lastActionAt: now,
        updatedAt: now,
      }).where(stepStillCurrent).returning();
      if (!row) throw conflict("Playbook run changed while advancing; reload and retry");
      return row;
    }

    const next = index + 1;
    if (next >= steps.length) {
      const [row] = await db.update(playbookRuns).set({ status: "done", finishedAt: now, nextActionAt: null, lastActionAt: now, updatedAt: now })
        .where(stepStillCurrent).returning();
      if (!row) throw conflict("Playbook run changed while advancing; reload and retry");
      return row;
    }

    // Compare-and-set claims the transition before any side effect, so two concurrent advances cannot both dispatch.
    const [moved] = await db.update(playbookRuns).set({ currentStepIndex: next, lastActionAt: now, updatedAt: now })
      .where(stepStillCurrent).returning();
    if (!moved) throw conflict("Playbook run changed while advancing; reload and retry");
    return runStep(moved, { afterDelay: false, actor });
  }

  async function pause(runId: string, _actor: Actor): Promise<PlaybookRunRow> {
    const run = await requireRun(runId);
    if (run.status !== "running" && run.status !== "waiting") throw conflict(`Playbook run is ${run.status} and cannot be paused`);
    const [row] = await db.update(playbookRuns).set({ status: "paused", updatedAt: new Date() })
      .where(and(eq(playbookRuns.id, runId), inArray(playbookRuns.status, ["running", "waiting"])))
      .returning();
    if (!row) throw conflict("Playbook run changed while pausing; reload and retry");
    return row;
  }

  async function resume(runId: string, _actor: Actor): Promise<PlaybookRunRow> {
    const run = await requireRun(runId);
    if (run.status !== "paused") throw conflict(`Playbook run is ${run.status} and cannot be resumed`);
    // A pending delay is kept in nextActionAt, so the run goes back to waiting and tickDue picks it up.
    const status = run.nextActionAt ? "waiting" : "running";
    const [row] = await db.update(playbookRuns).set({ status, updatedAt: new Date() })
      .where(and(eq(playbookRuns.id, runId), eq(playbookRuns.status, "paused")))
      .returning();
    if (!row) throw conflict("Playbook run changed while resuming; reload and retry");
    return row;
  }

  async function cancel(runId: string, _actor: Actor): Promise<PlaybookRunRow> {
    const run = await requireRun(runId);
    if (["done", "failed", "cancelled"].includes(run.status)) throw conflict(`Playbook run is ${run.status} and cannot be cancelled`);
    const now = new Date();
    const [row] = await db.update(playbookRuns).set({ status: "cancelled", finishedAt: now, nextActionAt: null, updatedAt: now })
      .where(and(eq(playbookRuns.id, runId), inArray(playbookRuns.status, ["running", "waiting", "paused"])))
      .returning();
    if (!row) throw conflict("Playbook run changed while cancelling; reload and retry");
    return row;
  }

  /**
   * Scheduling approach: waiting runs store nextActionAt and are dispatched by tickDue(). The routine trigger
   * kinds (cron, webhook, api) have no one-shot form, so a cron trigger per delay was rejected.
   * Something must call tickDue periodically; nothing in this service does so by itself.
   */
  async function tickDue(now: Date = new Date()): Promise<number> {
    const due = await db.select().from(playbookRuns)
      .where(and(eq(playbookRuns.status, "waiting"), lte(playbookRuns.nextActionAt, now)))
      .limit(100);
    let processed = 0;
    for (const candidate of due) {
      // Claim the run by clearing nextActionAt; a concurrent tick then finds nothing to claim.
      const [claimed] = await db.update(playbookRuns).set({ nextActionAt: null, updatedAt: now })
        .where(and(eq(playbookRuns.id, candidate.id), eq(playbookRuns.status, "waiting"), lte(playbookRuns.nextActionAt, now)))
        .returning();
      if (!claimed) continue;
      await runStep(claimed, { afterDelay: true, actor: {} });
      processed += 1;
    }
    return processed;
  }

  /** Runs the current step; a failure marks the run failed instead of leaving it half-dispatched. */
  async function runStep(run: PlaybookRunRow, options: { afterDelay: boolean; actor: Actor }): Promise<PlaybookRunRow> {
    try {
      return await performStep(run, options);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await db.update(playbookRuns).set({
        status: "failed",
        failureReason: `Could not run step: ${reason}`,
        finishedAt: new Date(),
        nextActionAt: null,
        updatedAt: new Date(),
      }).where(eq(playbookRuns.id, run.id));
      throw error;
    }
  }

  /** Dispatches the run's current step: waits when delayed, skips pure waits, fails on max attempts, otherwise creates and runs a routine. */
  async function performStep(run: PlaybookRunRow, options: { afterDelay: boolean; actor: Actor }): Promise<PlaybookRunRow> {
    const playbook = await pinnedPlaybook(run);
    const steps = playbook.steps;
    let row = run;
    let skipDelay = options.afterDelay;
    for (;;) {
      const now = new Date();
      const step = steps[row.currentStepIndex];
      if (!step) {
        const [done] = await db.update(playbookRuns).set({ status: "done", finishedAt: now, nextActionAt: null, lastActionAt: now, updatedAt: now })
          .where(eq(playbookRuns.id, row.id)).returning();
        return done!;
      }
      const delayHours = step.delayHours ?? 0;
      if (!skipDelay && delayHours > 0) {
        const [waiting] = await db.update(playbookRuns).set({ status: "waiting", nextActionAt: new Date(now.getTime() + delayHours * 3_600_000), updatedAt: now })
          .where(eq(playbookRuns.id, row.id)).returning();
        return waiting!;
      }
      skipDelay = false;
      if (step.kind === "wait") {
        const [moved] = await db.update(playbookRuns).set({ currentStepIndex: row.currentStepIndex + 1, lastActionAt: now, updatedAt: now })
          .where(eq(playbookRuns.id, row.id)).returning();
        row = moved!;
        continue;
      }

      const attempts = { ...row.attempts };
      const count = (attempts[step.key] ?? 0) + 1;
      if (step.maxAttempts != null && count > step.maxAttempts) {
        const [failed] = await db.update(playbookRuns).set({
          status: "failed",
          failureReason: `Step "${step.key}" reached the max attempts (${step.maxAttempts})`,
          finishedAt: now,
          nextActionAt: null,
          updatedAt: now,
        }).where(eq(playbookRuns.id, row.id)).returning();
        return failed!;
      }
      attempts[step.key] = count;

      const routine = await createStepRoutine(playbook, row, step, count, options.actor);
      const [updated] = await db.update(playbookRuns).set({
        status: "running",
        nextActionAt: null,
        lastRoutineId: routine.id,
        lastActionAt: now,
        attempts,
        failureReason: null,
        updatedAt: now,
      }).where(eq(playbookRuns.id, row.id)).returning();
      return updated!;
    }
  }

  async function createStepRoutine(playbook: PlaybookRow, run: PlaybookRunRow, step: PlaybookStep, attemptNumber: number, actor: Actor) {
    const actionType = actionTypeForStepKind(step.kind);
    const granted = actionType ? await resolveAgentAutonomy(run.companyId, run.agentId, actionType) : null;
    const effective = minAutonomyLevel(step.autonomy, granted);
    const stepIndex = playbook.steps.findIndex((item) => item.key === step.key);
    const description = [
      `Playbook: ${playbook.name} (${playbook.key} v${playbook.version})`,
      `Paso ${stepIndex + 1}/${playbook.steps.length}: ${step.key} (${step.kind})`,
      `Sujeto: ${run.subjectKind} ${run.subjectId}`,
      step.channel ? `Canal: ${step.channel}` : null,
      step.templateKey ? `Plantilla: ${step.templateKey}` : null,
      step.condition ? `Condición: ${step.condition}` : null,
      step.instructions ? `Instrucciones:\n${step.instructions}` : null,
      `Autonomía efectiva: ${effective}`,
      `Solo puedes avanzar el paso actual. Cuando termines, registra el resultado con playbook_advance (expectedStepIndex=${run.currentStepIndex}).`,
    ].filter((line): line is string => Boolean(line)).join("\n");

    const routine = await routineApi().create(run.companyId, {
      title: truncate(`${playbook.name}: ${step.title?.trim() || step.key}`, 200),
      description,
      assigneeAgentId: run.agentId,
      priority: "medium",
      status: "active",
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
      variables: [],
    }, actor);
    await db.update(routines).set({ originKind: "playbook", originId: run.id }).where(eq(routines.id, routine.id));
    await routineApi().runRoutine(routine.id, {
      source: "api",
      idempotencyKey: `playbook:${run.id}:${step.key}:${attemptNumber}`,
    }, actor);
    return routine;
  }

  return {
    getById,
    getRun,
    list,
    create,
    createFromTemplate,
    update,
    newDraftFrom,
    publishVersion,
    archive,
    usage,
    listRuns,
    start,
    advance,
    pause,
    resume,
    cancel,
    tickDue,
  };
}

export type PlaybookService = ReturnType<typeof playbookService>;
