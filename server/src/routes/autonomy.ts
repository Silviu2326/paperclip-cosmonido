import { Router, type Request } from "express";
import { ZodError, z, type ZodSchema } from "zod";
import type { Db } from "@paperclipai/db";
import {
  autonomyActionTypeSchema,
  autonomyEffectiveQuerySchema,
  grantAutonomySchema,
  recordShadowOutcomeSchema,
  revokeAutonomySchema,
  runAutonomyBenchSchema,
  type AutonomyActionType,
} from "@paperclipai/shared";
import { autonomyService } from "../services/autonomy.js";
import { autonomyBench } from "../services/autonomy-bench.js";
import { autonomyBenchNativeJudgeDeps } from "../services/autonomy-bench-native.js";
import type { BudgetServiceHooks } from "../services/budgets.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { forbidden, unprocessable } from "../errors.js";

const benchListQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  actionType: autonomyActionTypeSchema.optional(),
  status: z.enum(["running", "done", "failed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Validates with Zod and maps failures to 422 with the issue list. */
function parseOr422<T>(schema: ZodSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw unprocessable("Validation error", error.issues);
    throw error;
  }
}

/** Agents may only read their own effective level or history; board actors read any agent in the company. */
function scopedAgentId(req: Request, requested: string | undefined): string | null {
  if (req.actor.type !== "agent") return requested ?? null;
  const own = req.actor.agentId ?? null;
  if (requested && requested !== own) throw forbidden("Agents can only read their own autonomy");
  return own;
}

export function autonomyRoutes(db: Db, options: { budgetHooks?: BudgetServiceHooks } = {}) {
  const router = Router();
  const svc = autonomyService(db);
  const bench = autonomyBench(db, autonomyBenchNativeJudgeDeps(db, options.budgetHooks));

  router.get("/companies/:companyId/autonomy", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.matrix(companyId));
  });

  router.get("/companies/:companyId/autonomy/effective", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = parseOr422(autonomyEffectiveQuerySchema, req.query);
    const agentId = scopedAgentId(req, query.agentId);
    res.json(await svc.effectiveLevel(companyId, agentId, query.actionType));
  });

  router.get("/companies/:companyId/autonomy/history", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = parseOr422(autonomyEffectiveQuerySchema, req.query);
    const agentId = scopedAgentId(req, query.agentId);
    res.json(await svc.history(companyId, agentId, query.actionType));
  });

  router.post("/companies/:companyId/autonomy/grant", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const input = parseOr422(grantAutonomySchema, req.body);
    const actor = getActorInfo(req);
    const policy = await svc.grant(companyId, input, { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "autonomy.granted",
      entityType: "autonomy_policy",
      entityId: policy.id,
      details: { agentId: policy.agentId, actionType: policy.actionType, level: policy.level, benchRunId: policy.benchRunId, reason: policy.reason },
    });
    res.status(201).json(policy);
  });

  router.post("/companies/:companyId/autonomy/revoke", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const input = parseOr422(revokeAutonomySchema, req.body);
    const actor = getActorInfo(req);
    const result = await svc.revoke(companyId, input, { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "autonomy.revoked",
      entityType: "autonomy_policy",
      entityId: result.policy.id,
      details: { agentId: input.agentId ?? null, actionType: input.actionType, reason: input.reason, triggersDisabled: result.triggersDisabled },
    });
    res.json(result);
  });

  router.post("/companies/:companyId/autonomy/shadow-outcomes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = parseOr422(recordShadowOutcomeSchema, req.body);
    if (req.actor.type === "agent" && input.agentId !== req.actor.agentId) {
      throw forbidden("Agents can only record shadow outcomes for themselves");
    }
    const row = await svc.recordShadowOutcome(companyId, input);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "autonomy.shadow_recorded",
      entityType: "agent",
      entityId: input.agentId,
      details: { actionType: input.actionType, outcome: input.outcome, periodStart: row.periodStart },
    });
    res.status(201).json(row);
  });

  router.post("/companies/:companyId/autonomy/bench", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const input = parseOr422(runAutonomyBenchSchema, req.body);
    const actor = getActorInfo(req);
    const who = { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId };
    const run = await bench.run(companyId, input.agentId, input.actionType as AutonomyActionType, { sampleSize: input.sampleSize, threshold: input.threshold }, who);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "autonomy.bench_started",
      entityType: "autonomy_bench_run",
      entityId: run.id,
      details: { agentId: run.agentId, actionType: run.actionType, sampleSize: run.sampleSize },
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "autonomy.bench_finished",
      entityType: "autonomy_bench_run",
      entityId: run.id,
      details: { status: run.status, score: run.score, threshold: run.threshold, casesEvaluated: run.casesEvaluated, costCents: run.costCents, error: run.error },
    });
    res.status(201).json(run);
  });

  router.get("/companies/:companyId/autonomy/bench", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = parseOr422(benchListQuerySchema, req.query);
    res.json(await bench.list(companyId, { ...query, agentId: scopedAgentId(req, query.agentId) ?? undefined }));
  });

  router.get("/autonomy-bench-runs/:id", async (req, res) => {
    const run = await getAccessibleResource(req, res, bench.getById(req.params.id as string), "Bench run not found");
    if (run) res.json(run);
  });

  return router;
}
