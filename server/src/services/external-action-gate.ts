import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { externalActions } from "@paperclipai/db";
import {
  AUTONOMY_ACTION_TYPES,
  type AutonomyActionType,
  type AutonomyLevel,
  type ExternalActionType,
} from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { approvalService } from "./approvals.js";
import { autonomyService } from "./autonomy.js";

// Every outbound action (email, message, booking, publication, public link)
// goes through this gate. Board users execute directly; agents follow their
// autonomy level. See doc/plans/2026-10-21-sprint-2-contrato.md.

export type ExternalActionResult = Record<string, unknown>;

export type ExternalActionRow = typeof externalActions.$inferSelect;

export type ExternalActionMode = "draft" | "approval" | "direct";

export interface ExternalActionActor {
  userId?: string | null;
  agentId?: string | null;
}

export interface GateExternalActionInput {
  companyId: string;
  actionType: ExternalActionType;
  actor: ExternalActionActor;
  subjectKind?: string | null;
  subjectId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  execute: () => Promise<ExternalActionResult>;
}

export interface GateExternalActionOutput {
  action: ExternalActionRow;
  mode: ExternalActionMode;
  result?: ExternalActionResult;
}

export class ExternalActionUncertainError extends Error {
  readonly uncertain = true;
  constructor(message: string) {
    super(message);
    this.name = "ExternalActionUncertainError";
  }
}

const LEVEL_TO_MODE: Record<AutonomyLevel, ExternalActionMode> = {
  draft_only: "draft",
  send_with_approval: "approval",
  send_direct: "direct",
};

// Executors for actions waiting on approval. They live in process memory
// because the closure cannot be persisted; see approveExternalAction.
const pendingExecutors = new Map<string, () => Promise<ExternalActionResult>>();

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/**
 * Returns the effective autonomy level. The rule lives in the Sprint 3 autonomy
 * service (`autonomyService.effectiveLevel`): agent level = min(company grant,
 * agent grant), so an agent without its own grant stays at `draft_only`.
 * `review_link` is not an autonomy action type and cannot be granted, so it
 * always resolves to `draft_only`.
 */
export async function resolveAutonomyLevel(
  db: Db,
  input: { companyId: string; agentId?: string | null; actionType: ExternalActionType },
): Promise<AutonomyLevel> {
  if (!(AUTONOMY_ACTION_TYPES as readonly string[]).includes(input.actionType)) return "draft_only";
  const effective = await autonomyService(db).effectiveLevel(
    input.companyId,
    input.agentId ?? null,
    input.actionType as AutonomyActionType,
  );
  return effective.level;
}

async function findByIdempotencyKey(db: Db, companyId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(externalActions)
    .where(and(eq(externalActions.companyId, companyId), eq(externalActions.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

async function loadAction(db: Db, actionId: string): Promise<ExternalActionRow> {
  const [row] = await db.select().from(externalActions).where(eq(externalActions.id, actionId)).limit(1);
  if (!row) throw notFound("External action not found");
  return row;
}

async function updateAction(
  db: Db,
  actionId: string,
  patch: Partial<typeof externalActions.$inferInsert>,
): Promise<ExternalActionRow> {
  const [row] = await db
    .update(externalActions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(externalActions.id, actionId))
    .returning();
  if (!row) throw notFound("External action not found");
  return row;
}

function actorLog(actor: ExternalActionActor) {
  if (actor.agentId) return { actorType: "agent" as const, actorId: actor.agentId, agentId: actor.agentId };
  return { actorType: "user" as const, actorId: actor.userId ?? "board", agentId: null };
}

async function runExecutor(
  db: Db,
  action: ExternalActionRow,
  execute: () => Promise<ExternalActionResult>,
): Promise<{ action: ExternalActionRow; result?: ExternalActionResult }> {
  try {
    const result = await execute();
    const updated = await updateAction(db, action.id, {
      status: "executed",
      result,
      executedAt: new Date(),
    });
    await logActivity(db, {
      companyId: action.companyId,
      ...actorLog({ userId: action.actorUserId, agentId: action.actorAgentId }),
      action: "external_action.executed",
      entityType: "external_action",
      entityId: action.id,
      details: { actionType: action.actionType, mode: action.mode },
    });
    return { action: updated, result };
  } catch (error) {
    const uncertain = error instanceof ExternalActionUncertainError;
    const status = uncertain ? "uncertain" : "failed";
    const updated = await updateAction(db, action.id, {
      status,
      result: { error: errorMessage(error) },
    });
    await logActivity(db, {
      companyId: action.companyId,
      ...actorLog({ userId: action.actorUserId, agentId: action.actorAgentId }),
      action: uncertain ? "external_action.uncertain" : "external_action.failed",
      entityType: "external_action",
      entityId: action.id,
      details: { actionType: action.actionType, error: errorMessage(error) },
    });
    return { action: updated };
  }
}

/**
 * Routes an external action through the autonomy gate.
 *
 * - Non-agent actors (board users) execute directly.
 * - Agents: `draft_only` stores a pending action and does not execute;
 *   `send_with_approval` stores a pending action linked to an approval;
 *   `send_direct` executes immediately.
 * - A repeated `idempotencyKey` in the same company returns the existing row
 *   without executing again.
 */
export async function gateExternalAction(
  db: Db,
  input: GateExternalActionInput,
): Promise<GateExternalActionOutput> {
  const existing = await findByIdempotencyKey(db, input.companyId, input.idempotencyKey);
  if (existing) {
    return {
      action: existing,
      mode: existing.mode as ExternalActionMode,
      result: (existing.result ?? undefined) as ExternalActionResult | undefined,
    };
  }

  const agentId = input.actor.agentId ?? null;
  // Board users (no agent actor) bypass the autonomy gate.
  const levelApplied: AutonomyLevel = agentId
    ? await resolveAutonomyLevel(db, { companyId: input.companyId, agentId, actionType: input.actionType })
    : "send_direct";
  const mode: ExternalActionMode = agentId ? LEVEL_TO_MODE[levelApplied] : "direct";

  const payloadHash = hashPayload(input.payload);
  let action: ExternalActionRow;
  try {
    [action] = await db
      .insert(externalActions)
      .values({
        companyId: input.companyId,
        actionType: input.actionType,
        actorAgentId: agentId,
        actorUserId: agentId ? null : (input.actor.userId ?? null),
        subjectKind: input.subjectKind ?? null,
        subjectId: input.subjectId ?? null,
        levelApplied,
        mode,
        payloadHash,
        idempotencyKey: input.idempotencyKey,
        status: "pending",
      })
      .returning();
  } catch (error) {
    // Lost a race with a concurrent request using the same key.
    if (isUniqueViolation(error)) {
      const raced = await findByIdempotencyKey(db, input.companyId, input.idempotencyKey);
      if (raced) {
        return {
          action: raced,
          mode: raced.mode as ExternalActionMode,
          result: (raced.result ?? undefined) as ExternalActionResult | undefined,
        };
      }
    }
    throw error;
  }

  await logActivity(db, {
    companyId: input.companyId,
    ...actorLog(input.actor),
    action: "external_action.created",
    entityType: "external_action",
    entityId: action.id,
    details: { actionType: input.actionType, mode, levelApplied },
  });

  if (mode === "draft") {
    return { action, mode };
  }

  if (mode === "approval") {
    const approval = await approvalService(db).create(input.companyId, {
      type: "external_action",
      requestedByAgentId: agentId,
      requestedByUserId: null,
      status: "pending",
      payload: {
        externalActionId: action.id,
        actionType: input.actionType,
        subjectKind: input.subjectKind ?? null,
        subjectId: input.subjectId ?? null,
        payloadHash,
        payload: input.payload,
      },
    });
    pendingExecutors.set(action.id, input.execute);
    const linked = await updateAction(db, action.id, { approvalId: approval.id });
    await logActivity(db, {
      companyId: input.companyId,
      ...actorLog(input.actor),
      action: "external_action.approval_requested",
      entityType: "external_action",
      entityId: action.id,
      details: { actionType: input.actionType, approvalId: approval.id },
    });
    return { action: linked, mode };
  }

  const outcome = await runExecutor(db, action, input.execute);
  return { action: outcome.action, mode, result: outcome.result };
}

/** Result stored on an approved action whose executor lived in a process that restarted. */
export const EXECUTOR_UNAVAILABLE_REASON = "executor_unavailable";

/**
 * Approves a pending approval-mode action and executes it.
 *
 * The executor is the closure passed to gateExternalAction in this process, or
 * `input.execute` when the caller can rebuild it. If no executor exists (the
 * process restarted), the action is left `approved` with
 * `result.reason = 'executor_unavailable'`; `retryExternalAction` (see
 * external-action-retry.ts) can run it later from the stored subject.
 */
export async function approveExternalAction(
  db: Db,
  input: {
    actionId: string;
    approverUserId: string;
    execute?: () => Promise<ExternalActionResult>;
  },
): Promise<GateExternalActionOutput> {
  const action = await loadAction(db, input.actionId);
  if (action.mode !== "approval") {
    throw conflict("Only approval-mode external actions can be approved");
  }
  if (action.status === "executed") {
    return {
      action,
      mode: "approval",
      result: (action.result ?? undefined) as ExternalActionResult | undefined,
    };
  }
  if (action.status !== "pending") {
    throw conflict(`External action is ${action.status}`);
  }

  const executor = input.execute ?? pendingExecutors.get(action.id) ?? null;

  if (action.approvalId) {
    const approvals = approvalService(db);
    const approval = await approvals.getById(action.approvalId);
    if (approval && approval.status === "pending") {
      await approvals.approve(action.approvalId, input.approverUserId, null);
    }
  }

  const approved = await updateAction(db, action.id, {
    status: "approved",
    result: executor ? null : { reason: EXECUTOR_UNAVAILABLE_REASON },
  });
  await logActivity(db, {
    companyId: action.companyId,
    actorType: "user",
    actorId: input.approverUserId,
    action: "external_action.approved",
    entityType: "external_action",
    entityId: action.id,
    details: { actionType: action.actionType, executorAvailable: executor !== null },
  });

  if (!executor) {
    return { action: approved, mode: "approval", result: { reason: EXECUTOR_UNAVAILABLE_REASON } };
  }
  pendingExecutors.delete(action.id);
  const outcome = await runExecutor(db, approved, executor);
  return { action: outcome.action, mode: "approval", result: outcome.result };
}

/**
 * Runs an action that is already `approved` with a rebuilt executor. Only the
 * retry path calls this; it refuses anything that is not waiting on an executor.
 */
export async function runApprovedExternalAction(
  db: Db,
  actionId: string,
  execute: () => Promise<ExternalActionResult>,
): Promise<GateExternalActionOutput> {
  const action = await loadAction(db, actionId);
  if (action.status !== "approved" || (action.result as { reason?: string } | null)?.reason !== EXECUTOR_UNAVAILABLE_REASON) {
    throw conflict(`External action is ${action.status} and does not wait for an executor`);
  }
  await logActivity(db, {
    companyId: action.companyId,
    actorType: "user",
    actorId: "system",
    action: "external_action.retried",
    entityType: "external_action",
    entityId: action.id,
    details: { actionType: action.actionType },
  });
  pendingExecutors.delete(action.id);
  const outcome = await runExecutor(db, { ...action, result: null }, execute);
  return { action: outcome.action, mode: "approval", result: outcome.result };
}

/**
 * Called by the approval routes once an approval has been decided. External
 * action approvals carry `payload.externalActionId` (written by the gate); the
 * decision is forwarded to the action. A no-op for other approval types.
 * Errors are returned, not thrown, so the approval decision itself stands.
 */
export async function resolveExternalActionApproval(
  db: Db,
  input: { approval: { id: string; type: string; payload: unknown }; decision: "approved" | "rejected"; approverUserId: string; reason?: string | null },
): Promise<{ actionId: string; error?: string } | null> {
  if (input.approval.type !== "external_action") return null;
  const payload = (input.approval.payload ?? {}) as { externalActionId?: unknown };
  if (typeof payload.externalActionId !== "string") return null;
  const actionId = payload.externalActionId;
  try {
    if (input.decision === "approved") {
      await approveExternalAction(db, { actionId, approverUserId: input.approverUserId });
    } else {
      await rejectExternalAction(db, { actionId, approverUserId: input.approverUserId, reason: input.reason ?? null });
    }
    return { actionId };
  } catch (error) {
    return { actionId, error: errorMessage(error) };
  }
}

/** Rejects a pending approval-mode action. It never executes. */
export async function rejectExternalAction(
  db: Db,
  input: { actionId: string; approverUserId: string; reason?: string | null },
): Promise<ExternalActionRow> {
  const action = await loadAction(db, input.actionId);
  if (action.mode !== "approval") {
    throw conflict("Only approval-mode external actions can be rejected");
  }
  if (action.status !== "pending") {
    throw conflict(`External action is ${action.status}`);
  }

  if (action.approvalId) {
    const approvals = approvalService(db);
    const approval = await approvals.getById(action.approvalId);
    if (approval && approval.status === "pending") {
      await approvals.reject(action.approvalId, input.approverUserId, input.reason ?? null);
    }
  }

  pendingExecutors.delete(action.id);
  const rejected = await updateAction(db, action.id, {
    status: "rejected",
    result: input.reason ? { reason: input.reason } : null,
  });
  await logActivity(db, {
    companyId: action.companyId,
    actorType: "user",
    actorId: input.approverUserId,
    action: "external_action.rejected",
    entityType: "external_action",
    entityId: action.id,
    details: { actionType: action.actionType, reason: input.reason ?? null },
  });
  return rejected;
}
