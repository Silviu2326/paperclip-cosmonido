import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  createContactSchema,
  createCustomerSchema,
  crmListQuerySchema,
  updateContactSchema,
  updateCustomerSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { conflict, notFound } from "../errors.js";
import { assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { customerService } from "../services/crm/customers.js";
import { contactService } from "../services/crm/contacts.js";
import { CrmDuplicateError } from "../services/crm/common.js";
// A2 imports begin
import {
  changeOpportunityStageSchema,
  createCommitmentSchema,
  createCrmActivitySchema,
  createOpportunitySchema,
  CRM_SUBJECT_KINDS,
  resolveCommitmentSchema,
  updateOpportunitySchema,
  type ChangeOpportunityStage,
} from "@paperclipai/shared";
import { gateExternalAction } from "../services/external-action-gate.js";
import { logActivity } from "../services/activity-log.js";
import { opportunityService, closeOpportunitySchema, setNextActionSchema } from "../services/crm/opportunities.js";
import { opportunityForecastService } from "../services/crm/opportunity-forecast.js";
import { opportunityForecastQuerySchema } from "@paperclipai/shared/productization/opportunity-forecast";
import { crmActivityService } from "../services/crm/activities.js";
import { commitmentService } from "../services/crm/commitments.js";
// A2 imports end

// Sprint 2 pista A (CRM). Endpoints from the contract:
//   GET/POST  /companies/:companyId/customers
//   GET/PATCH /customers/:id
//   GET/POST  /companies/:companyId/contacts
//   GET/PATCH /contacts/:id
//   GET       /contacts/:id/customers
//   GET/POST  /companies/:companyId/opportunities
//   GET       /companies/:companyId/opportunities/forecast   (S3 WP11, estimate only)
//   GET/PATCH /opportunities/:id
//   POST      /opportunities/:id/stage
//   GET/POST  /companies/:companyId/crm/activities
//   GET/POST  /companies/:companyId/commitments
//   POST      /commitments/:id/resolve
//   GET       /companies/:companyId/crm/duplicates
//   GET/POST  /customers/:id/memory                (pista K)
//   GET/POST  /companies/:companyId/crm/sync       (pista L)

// Creates may carry `force: true` to proceed past duplicate candidates (409 otherwise).
const customerCreateBodySchema = createCustomerSchema.extend({
  force: z.boolean().optional().default(false),
});

const contactCreateBodySchema = createContactSchema.extend({
  force: z.boolean().optional().default(false),
});

const linkContactBodySchema = z.object({
  contactId: z.string().uuid(),
  role: z.string().trim().max(120).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

const duplicatesQuerySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("customer"),
    name: z.string().trim().min(1).max(200),
    domain: z.string().trim().max(253).optional(),
    contactEmail: z.string().trim().max(320).optional(),
  }),
  z.object({
    kind: z.literal("contact"),
    displayName: z.string().trim().max(200).optional(),
    email: z.string().trim().max(320).optional(),
    phone: z.string().trim().max(32).optional(),
  }),
]);

function duplicateConflict(err: unknown): never {
  if (err instanceof CrmDuplicateError) {
    throw conflict("Possible duplicates found", {
      code: "crm_duplicate_candidates",
      candidates: err.candidates,
    });
  }
  throw err;
}

export function crmRoutes(db: Db) {
  const router = Router();
  const customers = customerService(db);
  const contacts = contactService(db);

  // A1 begin
  router.get("/companies/:companyId/customers", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = crmListQuerySchema.parse(req.query);
    res.json(await customers.list(companyId, query));
  });

  router.post("/companies/:companyId/customers", validate(customerCreateBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { force, ...data } = req.body as z.infer<typeof customerCreateBodySchema>;
    try {
      const result = await customers.create(companyId, data, {
        actor: getActorInfo(req),
        force,
        contactEmail: data.contactEmail ?? null,
      });
      res.status(result.created ? 201 : 200).json(result.customer);
    } catch (err) {
      duplicateConflict(err);
    }
  });

  router.get("/customers/:id", async (req, res) => {
    const id = req.params.id as string;
    const customer = await getAccessibleResource(req, res, customers.getById(id), "Customer not found");
    if (!customer) return;
    res.json(customer);
  });

  router.patch("/customers/:id", validate(updateCustomerSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, customers.getById(id), "Customer not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const customer = await customers.update(existing.companyId, id, req.body, { actor: getActorInfo(req) });
    if (!customer) throw notFound("Customer not found");
    res.json(customer);
  });

  router.get("/customers/:id/contacts", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, customers.getById(id), "Customer not found");
    if (!existing) return;
    const linked = await contacts.listByCustomer(existing.companyId, id);
    if (!linked) throw notFound("Customer not found");
    res.json(linked);
  });

  router.post("/customers/:id/contacts", validate(linkContactBodySchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, customers.getById(id), "Customer not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const link = await contacts.link(
      existing.companyId,
      id,
      req.body.contactId,
      { role: req.body.role ?? null, isPrimary: req.body.isPrimary },
      { actor: getActorInfo(req) },
    );
    res.status(201).json(link);
  });

  router.delete("/customers/:id/contacts/:contactId", async (req, res) => {
    const id = req.params.id as string;
    const contactId = req.params.contactId as string;
    const existing = await getAccessibleResource(req, res, customers.getById(id), "Customer not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const removed = await contacts.unlink(existing.companyId, id, contactId, { actor: getActorInfo(req) });
    if (!removed) throw notFound("Contact is not linked to this customer");
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/contacts", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = crmListQuerySchema.parse(req.query);
    res.json(await contacts.list(companyId, query));
  });

  router.post("/companies/:companyId/contacts", validate(contactCreateBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { force, ...data } = req.body as z.infer<typeof contactCreateBodySchema>;
    try {
      const result = await contacts.create(companyId, data, { actor: getActorInfo(req), force });
      res.status(result.created ? 201 : 200).json(result.contact);
    } catch (err) {
      duplicateConflict(err);
    }
  });

  router.get("/contacts/:id", async (req, res) => {
    const id = req.params.id as string;
    const contact = await getAccessibleResource(req, res, contacts.getById(id), "Contact not found");
    if (!contact) return;
    res.json(contact);
  });

  router.get("/contacts/:id/customers", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, contacts.getById(id), "Contact not found");
    if (!existing) return;
    const linked = await contacts.listCustomers(existing.companyId, id);
    if (!linked) throw notFound("Contact not found");
    res.json(linked);
  });

  router.patch("/contacts/:id", validate(updateContactSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, contacts.getById(id), "Contact not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const contact = await contacts.update(existing.companyId, id, req.body, { actor: getActorInfo(req) });
    if (!contact) throw notFound("Contact not found");
    res.json(contact);
  });

  router.get("/companies/:companyId/crm/duplicates", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = duplicatesQuerySchema.parse(req.query);
    if (query.kind === "customer") {
      res.json(
        await customers.findDuplicates(companyId, {
          name: query.name,
          domain: query.domain ?? null,
          contactEmail: query.contactEmail ?? null,
        }),
      );
      return;
    }
    res.json(
      await contacts.findDuplicates(companyId, {
        displayName: query.displayName ?? null,
        email: query.email ?? null,
        phone: query.phone ?? null,
      }),
    );
  });
  // A1 end

  // A2 begin
  const opps = opportunityService(db);
  const oppForecast = opportunityForecastService(db);
  const acts = crmActivityService(db);
  const commits = commitmentService(db);

  const opportunityListQuerySchema = crmListQuerySchema.extend({
    stageKey: z.string().trim().min(1).max(40).optional(),
    ownerId: z.string().trim().min(1).max(200).optional(),
    customerId: z.string().guid().optional(),
    nextActionBefore: z.string().datetime({ offset: true }).optional(),
  });
  const activityListQuerySchema = z.object({
    subjectKind: z.enum(CRM_SUBJECT_KINDS),
    subjectId: z.string().guid(),
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  });
  const commitmentListQuerySchema = crmListQuerySchema.extend({
    customerId: z.string().guid().optional(),
    opportunityId: z.string().guid().optional(),
  });

  function actorContext(req: Request) {
    const actor = getActorInfo(req);
    return {
      actor,
      ctx: {
        userId: actor.actorType === "user" ? actor.actorId : null,
        agentId: actor.agentId ?? null,
      },
    };
  }

  /**
   * Stage changes (and closing as won/lost) pass the external action gate. Board users run
   * directly; agents follow their autonomy level and may get a pending action (202) instead.
   */
  async function changeStageThroughGate(
    req: Request,
    res: Response,
    row: { id: string; companyId: string },
    body: ChangeOpportunityStage,
  ) {
    const { actor, ctx } = actorContext(req);
    const failure: { error?: unknown } = {};
    const outcome = await gateExternalAction(db, {
      companyId: row.companyId,
      actionType: "stage_change",
      actor: ctx,
      subjectKind: "opportunity",
      subjectId: row.id,
      payload: { stageKey: body.stageKey, expectedVersion: body.expectedVersion, reason: body.reason ?? null },
      idempotencyKey: `stage_change:${row.id}:${body.expectedVersion}:${body.stageKey}`,
      execute: async () => {
        try {
          const opportunity = await opps.changeStage(row.companyId, row.id, body, ctx);
          return { opportunity };
        } catch (error) {
          failure.error = error;
          throw error;
        }
      },
    });
    if (outcome.action.status === "failed") {
      // Re-throw the original HTTP error (version conflict, transition not allowed, ...).
      if (failure.error) throw failure.error;
      const stored = (outcome.action.result ?? {}) as { error?: unknown };
      throw conflict(typeof stored.error === "string" ? stored.error : "Stage change failed", {
        code: "stage_change_failed",
      });
    }
    if (outcome.mode === "direct") {
      await logActivity(db, {
        companyId: row.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "opportunity.stage_changed",
        entityType: "opportunity",
        entityId: row.id,
        details: { toStageKey: body.stageKey, expectedVersion: body.expectedVersion },
      });
    }
    res.status(outcome.mode === "direct" ? 200 : 202).json({
      mode: outcome.mode,
      externalAction: outcome.action,
      opportunity: outcome.mode === "direct" ? ((outcome.result as { opportunity?: unknown } | undefined)?.opportunity ?? null) : null,
    });
  }

  router.get("/companies/:companyId/opportunities", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = opportunityListQuerySchema.parse(req.query);
    res.json(await opps.list(companyId, query));
  });

  // Registered before any `/:id` opportunity route so "forecast" is never read as an id.
  router.get("/companies/:companyId/opportunities/forecast", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = opportunityForecastQuerySchema.parse(req.query);
    res.json(await oppForecast.forecast(companyId, query));
  });

  router.post("/companies/:companyId/opportunities", validate(createOpportunitySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actor, ctx } = actorContext(req);
    const row = await opps.create(companyId, req.body, ctx);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "opportunity.created",
      entityType: "opportunity",
      entityId: row.id,
      details: { title: row.title, customerId: row.customerId },
    });
    res.status(201).json(row);
  });

  router.get("/opportunities/:id", async (req, res) => {
    const id = req.params.id as string;
    const row = await getAccessibleResource(req, res, opps.findById(id), "Opportunity not found");
    if (!row) return;
    res.json(row);
  });

  router.patch("/opportunities/:id", validate(updateOpportunitySchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, opps.findById(id), "Opportunity not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const { actor } = actorContext(req);
    const row = await opps.update(existing.companyId, id, req.body);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "opportunity.updated",
      entityType: "opportunity",
      entityId: id,
      details: { version: row.version },
    });
    res.json(row);
  });

  router.post("/opportunities/:id/stage", validate(changeOpportunityStageSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, opps.findById(id), "Opportunity not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    await changeStageThroughGate(req, res, existing, req.body);
  });

  router.post("/opportunities/:id/close", validate(closeOpportunitySchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, opps.findById(id), "Opportunity not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const body = req.body as z.infer<typeof closeOpportunitySchema>;
    await changeStageThroughGate(
      req,
      res,
      existing,
      { stageKey: body.outcome, expectedVersion: body.expectedVersion, reason: body.reason },
    );
  });

  router.post("/opportunities/:id/next-action", validate(setNextActionSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, opps.findById(id), "Opportunity not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const { actor, ctx } = actorContext(req);
    const row = await opps.setNextAction(existing.companyId, id, req.body, ctx);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "opportunity.next_action_set",
      entityType: "opportunity",
      entityId: id,
      details: { nextAction: row.nextAction },
    });
    res.json(row);
  });

  router.get("/companies/:companyId/crm/activities", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = activityListQuerySchema.parse(req.query);
    res.json(await acts.listBySubject(companyId, query));
  });

  router.post("/companies/:companyId/crm/activities", validate(createCrmActivitySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actor, ctx } = actorContext(req);
    await acts.assertSubject(companyId, req.body.subjectKind, req.body.subjectId);
    const row = await acts.log(companyId, req.body, ctx);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "crm.activity_logged",
      entityType: "crm_activity",
      entityId: row.id,
      details: { subjectKind: row.subjectKind, subjectId: row.subjectId, kind: row.kind },
    });
    res.status(201).json(row);
  });

  router.get("/companies/:companyId/commitments", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = commitmentListQuerySchema.parse(req.query);
    res.json(await commits.list(companyId, query));
  });

  router.post("/companies/:companyId/commitments", validate(createCommitmentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actor, ctx } = actorContext(req);
    const row = await commits.create(companyId, req.body, ctx);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "commitment.created",
      entityType: "commitment",
      entityId: row.id,
      details: { who: row.who, customerId: row.customerId },
    });
    res.status(201).json(row);
  });

  router.post("/commitments/:id/resolve", validate(resolveCommitmentSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, commits.findById(id), "Commitment not found");
    if (!existing) return;
    assertCompanyAccess(req, existing.companyId);
    const { actor, ctx } = actorContext(req);
    const row = await commits.resolve(existing.companyId, id, req.body, ctx);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "commitment.resolved",
      entityType: "commitment",
      entityId: id,
      details: { status: row.status },
    });
    res.json(row);
  });
  // A2 end

  return router;
}
