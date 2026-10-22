import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import type { Db } from "@paperclipai/db";
import { leadEnrichSchema, leadQualifySchema } from "@paperclipai/shared";
import { z } from "zod";
import { badRequest, unprocessable } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { enrichmentService, type EnrichmentDeps } from "../services/enrichment.js";
import { leadQualificationService, type LeadQualificationDeps } from "../services/lead-qualification.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

/** Invalid bodies answer 422 (not the generic Zod 400) for the Sprint 3 qualification and enrichment contracts. */
export function validateBody422(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(unprocessable("Validation error", parsed.error.issues));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

const leadIdParam = z.string().uuid();
const qualifyBodySchema = leadQualifySchema.omit({ leadId: true });

export interface LeadQualificationRouteOptions {
  qualification?: LeadQualificationDeps;
  enrichment?: EnrichmentDeps;
}

export function leadQualificationRoutes(db: Db, options: LeadQualificationRouteOptions = {}) {
  const router = Router();
  const qualification = leadQualificationService(db, options.qualification);
  const enrichment = enrichmentService(db, options.enrichment);

  function parseLeadId(raw: unknown): string {
    const parsed = leadIdParam.safeParse(raw);
    if (!parsed.success) throw badRequest("Invalid lead id");
    return parsed.data;
  }

  router.post("/companies/:companyId/leads/:leadId/qualify", validateBody422(qualifyBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const leadId = parseLeadId(req.params.leadId);
    const actor = getActorInfo(req);
    const result = await qualification.qualify(companyId, { ...req.body, leadId }, {
      agentId: actor.agentId,
      runId: actor.runId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "lead.qualified",
      entityType: "lead",
      entityId: leadId,
      details: { qualificationId: result.id, score: result.score, qualified: result.qualified, criteriaVersion: result.criteriaVersion },
    });
    res.status(201).json(result);
  });

  router.get("/companies/:companyId/leads/:leadId/qualifications", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const leadId = parseLeadId(req.params.leadId);
    res.json(await qualification.history(companyId, leadId));
  });

  router.post("/companies/:companyId/enrichment", validateBody422(leadEnrichSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const result = await enrichment.enrich(companyId, req.body, {
      agentId: actor.agentId,
      runId: actor.runId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "lead.enriched",
      entityType: req.body.leadId ? "lead" : "company",
      entityId: req.body.leadId ?? companyId,
      details: { domain: result.domain, costCents: result.costCents, sources: result.sources.length },
    });
    res.status(201).json(result);
  });

  return router;
}
