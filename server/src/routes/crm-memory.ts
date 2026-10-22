import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { customerMemoryService, linkedCustomerIdsForRun } from "../services/crm/memory.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { assertAuthenticated, assertCompanyAccess, getActorInfo } from "./authz.js";

export const appendCustomerMemorySchema = z.object({
  key: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  source: z.enum(["user", "detected"]).optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

/**
 * Board actors act on any customer of their companies. An agent may only touch
 * the customer linked to its authenticated run (see `linkedCustomerIdsForRun`);
 * agent keys without a task-bound run are rejected by `projectToolContext`.
 * Returns the run when the actor is an agent, otherwise null.
 */
async function authorizeCustomerMemory(
  db: Db,
  req: Request,
  input: { companyId: string; customerId: string },
) {
  assertAuthenticated(req);
  if (req.actor.type !== "agent") {
    assertCompanyAccess(req, input.companyId);
    return null;
  }
  const context = await projectToolContext(db, req.actor, false, "Customer memory");
  assertCompanyAccess(req, input.companyId);
  const linked = await linkedCustomerIdsForRun(db, {
    companyId: input.companyId,
    contextSnapshot: context.run.contextSnapshot as Record<string, unknown> | null,
  });
  if (!linked.includes(input.customerId)) {
    throw forbidden("Customer memory is limited to the customer linked to this run");
  }
  return context.run;
}

/** Sprint 2 pista K. Customer memory endpoints; mounted from app.ts (contract integration). */
export function crmMemoryRoutes(db: Db) {
  const router = Router();
  const svc = customerMemoryService(db);

  router.get("/customers/:id/memory", async (req, res) => {
    const customerId = req.params.id as string;
    const customer = await svc.findCustomer(customerId);
    if (!customer) throw notFound("Customer not found");
    await authorizeCustomerMemory(db, req, { companyId: customer.companyId, customerId });
    const notes = await svc.get(customer.companyId, customer.id);
    res.json(notes);
  });

  router.post("/customers/:id/memory", validate(appendCustomerMemorySchema), async (req, res) => {
    const customerId = req.params.id as string;
    const customer = await svc.findCustomer(customerId);
    if (!customer) throw notFound("Customer not found");
    const run = await authorizeCustomerMemory(db, req, { companyId: customer.companyId, customerId });
    const body = req.body as z.infer<typeof appendCustomerMemorySchema>;
    const actor = getActorInfo(req);
    // Agents always write as source "agent" and are attributed to their run; the body cannot override this.
    const note = await svc.append(customer.companyId, customer.id, {
      key: body.key,
      content: body.content,
      source: run ? "agent" : (body.source ?? "user"),
      agentId: run ? run.agentId : null,
      runId: run ? run.id : null,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      idempotencyKey: body.idempotencyKey ?? null,
    });
    await logActivity(db, {
      companyId: customer.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "customer.memory_appended",
      entityType: "customer",
      entityId: customer.id,
      details: { noteId: note.id, key: note.key, source: note.source },
    });
    res.status(201).json(note);
  });

  router.post("/customer-memory/:noteId/archive", async (req, res) => {
    assertAuthenticated(req);
    if (req.actor.type === "agent") throw forbidden("Agents cannot archive customer memory");
    const noteId = req.params.noteId as string;
    const existing = await svc.findNote(noteId);
    if (!existing) throw notFound("Customer memory note not found");
    assertCompanyAccess(req, existing.companyId);
    const note = await svc.archive(existing.companyId, existing.id);
    if (!note) throw notFound("Customer memory note not found or already archived");
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: note.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "customer.memory_archived",
      entityType: "customer",
      entityId: note.customerId,
      details: { noteId: note.id, key: note.key },
    });
    res.json(note);
  });

  return router;
}
