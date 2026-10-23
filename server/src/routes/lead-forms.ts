import { Router, type NextFunction, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  createLeadFormSchema,
  leadFormLifecycleSchema,
  leadFormListQuerySchema,
  updateLeadFormSchema,
  type CreateLeadForm,
  type LeadFormLifecycleAction,
  type UpdateLeadForm,
} from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { leadFormService, presentLeadForm, presentLeadFormDetail } from "../services/leads/lead-forms.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

// Sprint 2 pista B (formularios de captación). Board-only writes, company-scoped reads.
//   GET   /companies/:companyId/lead-forms        (status=active|archived|all, q, cursor, limit)
//   POST  /companies/:companyId/lead-forms
//   GET   /lead-forms/:id
//   PATCH /lead-forms/:id                         (expectedUpdatedAt required; slug is immutable)
//   POST  /lead-forms/:id/publish|unpublish|archive|restore   (expectedUpdatedAt required)
// Public submission lives in routes/public/leads.ts (POST /p/:companySlug/form/:formSlug).

const LIFECYCLE_ACTIVITY: Record<LeadFormLifecycleAction, string> = {
  publish: "lead_form.published",
  unpublish: "lead_form.unpublished",
  archive: "lead_form.archived",
  restore: "lead_form.restored",
};

export interface LeadFormRouteOptions {
  /**
   * Origin used for public URLs and embed snippets (for example the configured public base URL).
   * Without it the request's own origin is used.
   */
  publicBaseUrl?: string | null;
}

function originFor(req: Request, configured: string | null | undefined): string {
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

/** Board-only mutation gate. Runs before body validation so agents get 403, not 400. */
function requireBoard(req: Request, _res: Response, next: NextFunction) {
  assertBoard(req);
  next();
}

export function leadFormRoutes(db: Db, options: LeadFormRouteOptions = {}) {
  const router = Router();
  const svc = leadFormService(db);

  async function logFormActivity(req: Request, companyId: string, action: string, entityId: string, details: Record<string, unknown>) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action,
      entityType: "lead_form",
      entityId,
      details,
    });
  }

  router.get("/companies/:companyId/lead-forms", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = leadFormListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid query", parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })));
    }
    const origin = originFor(req, options.publicBaseUrl);
    const page = await svc.list(companyId, parsed.data);
    res.json({ items: page.items.map((row) => presentLeadForm(row, origin)), nextCursor: page.nextCursor });
  });

  router.post("/companies/:companyId/lead-forms", requireBoard, validate(createLeadFormSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const row = await svc.create(companyId, req.body as CreateLeadForm);
    await logFormActivity(req, companyId, "lead_form.created", row.id, { slug: row.slug, fields: row.fields });
    res.status(201).json(presentLeadFormDetail(row, originFor(req, options.publicBaseUrl)));
  });

  router.get("/lead-forms/:id", async (req, res) => {
    const id = req.params.id as string;
    const row = await getAccessibleResource(req, res, svc.getById(id), "Lead form not found");
    if (!row) return;
    res.json(presentLeadFormDetail(row, originFor(req, options.publicBaseUrl)));
  });

  router.patch("/lead-forms/:id", requireBoard, validate(updateLeadFormSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Lead form not found");
    if (!existing) return;
    const input = req.body as UpdateLeadForm;
    const row = await svc.update(existing, input);
    await logFormActivity(req, row.companyId, "lead_form.updated", row.id, {
      changed: Object.keys(input).filter((key) => key !== "expectedUpdatedAt"),
    });
    res.json(presentLeadFormDetail(row, originFor(req, options.publicBaseUrl)));
  });

  for (const action of ["publish", "unpublish", "archive", "restore"] as const) {
    router.post(`/lead-forms/:id/${action}`, requireBoard, validate(leadFormLifecycleSchema), async (req, res) => {
      const id = req.params.id as string;
      const existing = await getAccessibleResource(req, res, svc.getById(id), "Lead form not found");
      if (!existing) return;
      const row = await svc.setLifecycle(existing, action, req.body.expectedUpdatedAt as string);
      await logFormActivity(req, row.companyId, LIFECYCLE_ACTIVITY[action], row.id, {
        slug: row.slug,
        active: row.active,
        published: row.published,
      });
      res.json(presentLeadFormDetail(row, originFor(req, options.publicBaseUrl)));
    });
  }

  return router;
}
