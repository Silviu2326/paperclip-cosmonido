import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  convertLeadSchema,
  createLeadSchema,
  updateLeadSchema,
  type ConvertLead,
  type CreateLead,
  type UpdateLead,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { leadService, leadListQuerySchema, discardLeadSchema, triageLeadSchema } from "../services/leads/leads.js";
import { leadIntakeService } from "../services/leads/intake.js";
import { csvImportBodySchema, csvImportService } from "../services/leads/csv-import.js";
import { assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

// Sprint 2 pista B (Leads).
//   GET       /companies/:companyId/leads            (filters: status, source, priority, assigned, q, cursor, limit)
//   POST      /companies/:companyId/leads
//   GET       /leads/:id
//   PATCH     /leads/:id
//   GET       /leads/:id/activity
//   POST      /leads/:id/triage
//   POST      /leads/:id/convert                     (idempotencyKey required)
//   POST      /leads/:id/discard
//   POST      /companies/:companyId/leads/import/preview
//   POST      /companies/:companyId/leads/import     (confirms the CSV import)
// Public intake (routes/public/leads.ts): POST /p/:companySlug/form/:formSlug

export function leadRoutes(db: Db) {
  const router = Router();
  const svc = leadService(db);
  const intake = leadIntakeService(db);
  const csv = csvImportService(db);

  router.get("/companies/:companyId/leads", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = leadListQuerySchema.parse(req.query);
    res.json(await svc.list(companyId, query));
  });

  router.post("/companies/:companyId/leads", validate(createLeadSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = req.body as CreateLead;
    const actor = getActorInfo(req);
    const payload = input.payload ?? {};
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    const result = await intake.ingest(companyId, {
      source: input.source,
      sourceRef: input.sourceRef ?? (input.idempotencyKey ? `idem:${input.idempotencyKey}` : null),
      payload,
      identity: { email: text(payload.email), phone: text(payload.phone) },
      language: input.language ?? null,
      priority: input.priority ?? null,
    });
    let lead = result.lead;
    if (result.created && (input.contactId || input.customerId)) {
      lead = await svc.update(lead.id, { contactId: input.contactId, customerId: input.customerId } as UpdateLead, actor);
    }
    if (result.created) {
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "lead.created",
        entityType: "lead",
        entityId: lead.id,
        details: { source: lead.source },
      });
    }
    res.status(result.created ? 201 : 200).json(lead);
  });

  router.post("/companies/:companyId/leads/import/preview", validate(csvImportBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await csv.preview(companyId, req.body));
  });

  router.post("/companies/:companyId/leads/import", validate(csvImportBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const result = await csv.commit(companyId, req.body);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "lead.imported",
      entityType: "lead",
      entityId: companyId,
      details: { imported: result.imported, skipped: result.skipped, total: result.total, errors: result.errors.length },
    });
    res.json(result);
  });

  router.get("/leads/:id", async (req, res) => {
    const id = req.params.id as string;
    const lead = await getAccessibleResource(req, res, svc.getById(id), "Lead not found");
    if (!lead) return;
    res.json(lead);
  });

  router.get("/leads/:id/activity", async (req, res) => {
    const id = req.params.id as string;
    const lead = await getAccessibleResource(req, res, svc.getById(id), "Lead not found");
    if (!lead) return;
    res.json(await svc.activity(id));
  });

  router.patch("/leads/:id", validate(updateLeadSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Lead not found");
    if (!existing) return;
    const actor = getActorInfo(req);
    const lead = await svc.update(id, req.body as UpdateLead, actor);
    await logActivity(db, {
      companyId: lead.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "lead.updated",
      entityType: "lead",
      entityId: lead.id,
      details: { fields: Object.keys(req.body as object) },
    });
    res.json(lead);
  });

  router.post("/leads/:id/triage", validate(triageLeadSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Lead not found");
    if (!existing) return;
    const actor = getActorInfo(req);
    const lead = await svc.triage(id, req.body, actor);
    await logActivity(db, {
      companyId: lead.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "lead.triaged",
      entityType: "lead",
      entityId: lead.id,
      details: { status: lead.status, priority: lead.priority },
    });
    res.json(lead);
  });

  router.post("/leads/:id/convert", validate(convertLeadSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Lead not found");
    if (!existing) return;
    const actor = getActorInfo(req);
    const { lead, replayed } = await svc.convert(id, req.body as ConvertLead, actor);
    if (!replayed) {
      await logActivity(db, {
        companyId: lead.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "lead.converted",
        entityType: "lead",
        entityId: lead.id,
        details: { customerId: lead.customerId, contactId: lead.contactId, opportunityId: lead.opportunityId },
      });
    }
    res.json(lead);
  });

  router.post("/leads/:id/discard", validate(discardLeadSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Lead not found");
    if (!existing) return;
    const actor = getActorInfo(req);
    const lead = await svc.discard(id, req.body, actor);
    if (existing.status !== "discarded") {
      await logActivity(db, {
        companyId: lead.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "lead.discarded",
        entityType: "lead",
        entityId: lead.id,
        details: { reason: lead.discardReason },
      });
    }
    res.json(lead);
  });

  return router;
}
