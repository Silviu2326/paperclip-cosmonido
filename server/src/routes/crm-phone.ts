import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { customerContacts, projects } from "@paperclipai/db";
import {
  CRM_PHONE_CALLBACK_STATUSES,
  crmPhoneCallScheduleInputSchema,
  crmPhoneCallSummaryGetInputSchema,
  crmPhoneLinkContactInputSchema,
  type CrmPhoneCallback,
} from "@paperclipai/shared";
import { z } from "zod";
import { badRequest, forbidden, notFound } from "../errors.js";
import { crmPhoneService, type CrmPhoneActor } from "../services/crm-phone.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { validateBody422 } from "./lead-qualification.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const uuid = z.string().uuid();

function id(value: unknown, label: string) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw badRequest(`Invalid ${label}`);
  return parsed.data;
}

function actorOf(req: Parameters<typeof getActorInfo>[0]): CrmPhoneActor {
  const actor = getActorInfo(req);
  return actor.actorType === "agent"
    ? { agentId: actor.agentId, runId: actor.runId }
    : { userId: actor.actorId };
}

function boardUserId(req: Parameters<typeof getActorInfo>[0]) {
  assertBoard(req);
  const actor = getActorInfo(req);
  if (actor.actorType !== "user") throw badRequest("This action requires a board user");
  return actor.actorId;
}

/** CRM phone bridge. Mounted under `/api`; every route is company-scoped. */
export function crmPhoneRoutes(db: Db) {
  const router = Router();
  const service = crmPhoneService(db);

  router.get("/companies/:companyId/crm-phone/status", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    assertCompanyAccess(req, companyId);
    res.json(await service.connectorStatus(companyId));
  });

  router.get("/companies/:companyId/crm-phone/calls", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const contactId = req.query.contactId ? id(req.query.contactId, "contact id") : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await service.listCalls(companyId, { contactId, limit: Number.isFinite(limit) ? limit : undefined }));
  });

  router.post("/companies/:companyId/crm-phone/calls/sync", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    res.json(await service.sync(companyId));
  });

  router.post(
    "/companies/:companyId/crm-phone/calls/:callId/link-contact",
    validateBody422(crmPhoneLinkContactInputSchema),
    async (req, res) => {
      const companyId = id(req.params.companyId, "company id");
      const userId = boardUserId(req);
      assertCompanyAccess(req, companyId);
      res.json(await service.linkContact(companyId, id(req.params.callId, "call id"), req.body.contactId, userId));
    },
  );

  router.get("/companies/:companyId/crm-phone/callbacks", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !(CRM_PHONE_CALLBACK_STATUSES as readonly string[]).includes(status)) throw badRequest("Invalid status");
    res.json(await service.listCallbacks(companyId, { status: status as CrmPhoneCallback["status"] | undefined }));
  });

  router.post("/companies/:companyId/crm-phone/callbacks/:callbackId/approve", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    const userId = boardUserId(req);
    assertCompanyAccess(req, companyId);
    res.json(await service.approve(companyId, id(req.params.callbackId, "callback id"), userId));
  });

  router.post("/companies/:companyId/crm-phone/callbacks/:callbackId/cancel", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    const userId = boardUserId(req);
    assertCompanyAccess(req, companyId);
    res.json(await service.cancel(companyId, id(req.params.callbackId, "callback id"), userId));
  });

  router.get("/companies/:companyId/crm-phone/callbacks/:callbackId/dial-authorization", async (req, res) => {
    const companyId = id(req.params.companyId, "company id");
    assertCompanyAccess(req, companyId);
    res.json(await service.authorizeDial(companyId, id(req.params.callbackId, "callback id"), actorOf(req)));
  });

  // Agent tools. The root dispatcher exposes these two definitions from CRM_PHONE_TOOL_DEFINITIONS.
  router.post(
    "/companies/:companyId/crm-phone/tools/call_summary_get",
    validateBody422(crmPhoneCallSummaryGetInputSchema),
    async (req, res) => {
      const companyId = id(req.params.companyId, "company id");
      assertCompanyAccess(req, companyId);
      if (req.actor.type === "agent") {
        const context = await projectToolContext(db, req.actor, false, "CRM phone");
        if (context.run.companyId !== companyId) throw forbidden("Run belongs to another company");
        const scope = context.issue.projectId
          ? { projectId: context.issue.projectId }
          : { issueId: context.issue.id };
        const requestedScope = req.body.scope as { projectId?: string; issueId?: string; contactId?: string };
        if (requestedScope.contactId || requestedScope.projectId !== scope.projectId || requestedScope.issueId !== scope.issueId) {
          throw forbidden("CRM phone summary scope must match the authenticated task context");
        }
        res.json(await service.getSummary(companyId, { ...req.body, scope }));
        return;
      }
      res.json(await service.getSummary(companyId, req.body));
    },
  );

  router.post(
    "/companies/:companyId/crm-phone/tools/call_schedule",
    validateBody422(crmPhoneCallScheduleInputSchema),
    async (req, res) => {
      const companyId = id(req.params.companyId, "company id");
      assertCompanyAccess(req, companyId);
      let input = req.body;
      let actor = actorOf(req);
      if (req.actor.type === "agent") {
        const context = await projectToolContext(db, req.actor, true, "CRM phone");
        if (context.run.companyId !== companyId) throw forbidden("Run belongs to another company");
        if (input.projectId && input.projectId !== context.issue.projectId) {
          throw forbidden("Callback project must match the authenticated task context");
        }
        if (input.issueId && input.issueId !== context.issue.id) {
          throw forbidden("Callback issue must match the authenticated task context");
        }
        const projectId = context.issue.projectId ?? undefined;
        if (projectId) {
          const [project] = await db.select({ customerId: projects.customerId }).from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
          if (!project) throw notFound("Task project not found");
          if (project.customerId) {
            const [membership] = await db.select({ contactId: customerContacts.contactId }).from(customerContacts)
              .where(and(
                eq(customerContacts.companyId, companyId),
                eq(customerContacts.customerId, project.customerId),
                eq(customerContacts.contactId, input.contactId),
              )).limit(1);
            if (!membership) throw forbidden("Callback contact is outside the task project's customer context");
          }
        }
        input = {
          ...input,
          ...(projectId ? { projectId } : {}),
          issueId: context.issue.id,
        };
        actor = { agentId: context.run.agentId, runId: context.run.id };
      }
      const result = await service.schedule(companyId, input, actor);
      res.status(result.created ? 201 : 200).json(result);
    },
  );

  return router;
}
