import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createCommercialDecisionSchema,
  createRemoteDecisionLinkSchema,
  resolveCommercialDecisionSchema,
  resolveRemoteDecisionSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, unprocessable } from "../errors.js";
import type { DecisionServiceOptions } from "../services/decisions.js";
import { decisionService } from "../services/decisions.js";
import {
  commercialDecisionService,
  type CommercialDecisionDeps,
} from "../services/commercial-decisions.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;

/** Authenticated routes. Pass `deps` to wire effect handlers and shadow recording; the decisions service comes from `options`. */
export function commercialDecisionRoutes(
  db: Db,
  options: DecisionServiceOptions,
  deps?: Omit<CommercialDecisionDeps, "decisions">,
) {
  const router = Router();
  const svc = commercialDecisionService(db, { ...deps, decisions: decisionService(db, options) });

  async function loadCommercial(id: string) {
    const decision = await svc.get(id);
    if (!decision?.commercial) throw notFound("Commercial decision not found");
    return decision;
  }

  router.post(
    "/companies/:companyId/commercial-decisions",
    validate(createCommercialDecisionSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      if (req.actor.type !== "agent") {
        throw forbidden("Commercial decisions originate from agent runs");
      }
      if (!req.actor.agentId || !req.actor.runId) {
        throw forbidden("Agent run context required");
      }
      const created = await svc.create(companyId, req.body, {
        actor: req.actor,
        agentId: req.actor.agentId,
        runId: req.actor.runId,
      });
      res.status(201).json(created);
    },
  );

  router.get("/companies/:companyId/commercial-decisions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.listOpen(companyId));
  });

  router.get("/commercial-decisions/:id", async (req, res) => {
    const decision = await loadCommercial(req.params.id as string);
    assertCompanyAccess(req, decision.companyId);
    res.json(decision);
  });

  router.post(
    "/commercial-decisions/:id/resolve",
    validate(resolveCommercialDecisionSchema),
    async (req, res) => {
      assertBoard(req);
      const decision = await loadCommercial(req.params.id as string);
      assertCompanyAccess(req, decision.companyId);
      const result = await svc.resolve(decision.id, req.body, {
        decidedByUserId: req.actor.userId ?? "local-implicit-board",
        userActor: req.actor,
        via: "board",
      });
      res.json(result);
    },
  );

  router.post(
    "/commercial-decisions/:id/remote-link",
    validate(createRemoteDecisionLinkSchema),
    async (req, res) => {
      assertBoard(req);
      const decision = await loadCommercial(req.params.id as string);
      assertCompanyAccess(req, decision.companyId);
      const link = await svc.createRemoteLink(decision.id, req.body, { userId: req.actor.userId ?? null });
      res.status(201).json(link);
    },
  );

  return router;
}

/**
 * Unauthenticated routes for remote resolution (email or chat links). Mount before actorMiddleware.
 * The first DB access is the token hash lookup; error bodies never include company ids.
 */
export function publicDecisionRoutes(
  db: Db,
  options: DecisionServiceOptions,
  deps?: Omit<CommercialDecisionDeps, "decisions">,
) {
  const router = Router();
  const svc = commercialDecisionService(db, { ...deps, decisions: decisionService(db, options) });

  function tokenParam(value: unknown) {
    if (typeof value !== "string" || !PUBLIC_TOKEN_PATTERN.test(value)) throw notFound("Decision link not found");
    return value;
  }

  router.get("/api/public/decisions/:token", async (req, res) => {
    const token = tokenParam(req.params.token);
    res.json(await svc.describeRemote(token));
  });

  router.post("/api/public/decisions/:token/resolve", async (req, res) => {
    const token = tokenParam(req.params.token);
    const parsed = resolveRemoteDecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw unprocessable("Invalid decision option");
    const result = await svc.resolveRemote(token, parsed.data.optionId, {
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    res.json({ applied: result.applied, status: result.decision.status, chosenOptionId: result.decision.chosenOptionId });
  });

  return router;
}
