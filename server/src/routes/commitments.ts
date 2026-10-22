import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { commercialTriggerEventSchema, commitmentsExtractSchema } from "@paperclipai/shared";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { validateBody422 } from "./leads.js";
import { commitmentService, type CommitmentServiceDeps } from "../services/commitment-extractor.js";
import { commercialTriggers, type CommercialTriggerDeps } from "../services/commercial-triggers.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const uuid = z.string().uuid();
const extractBodySchema = commitmentsExtractSchema.omit({ conversationId: true });

export function commitmentRoutes(db: Db, deps: CommitmentServiceDeps = {}) {
  const router = Router();
  const service = commitmentService(db, deps);

  router.post(
    "/companies/:companyId/conversations/:conversationId/commitments/extract",
    validateBody422(extractBodySchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const conversationId = uuid.safeParse(req.params.conversationId);
      if (!conversationId.success) throw badRequest("Invalid conversation id");
      const actor = getActorInfo(req);
      const result = await service.extract(
        companyId,
        { ...req.body, conversationId: conversationId.data },
        { agentId: actor.agentId, runId: actor.runId, userId: actor.actorType === "user" ? actor.actorId : null },
      );
      res.json(result);
    },
  );

  return router;
}

/** Commercial triggers (WP6). The deps come from the playbook service (WP1) and are wired by the app. */
export function commercialTriggerRoutes(db: Db, deps: CommercialTriggerDeps) {
  const router = Router();
  const triggers = commercialTriggers(db, deps);

  router.post("/companies/:companyId/commercial-triggers", validateBody422(commercialTriggerEventSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as z.infer<typeof commercialTriggerEventSchema>;
    const result = await triggers.handle({
      kind: body.kind,
      companyId,
      subjectKind: body.subjectKind,
      subjectId: body.subjectId,
      occurredAt: (body.occurredAt ?? new Date()).toISOString(),
      ...(body.payload ? { payload: body.payload } : {}),
    });
    res.json(result);
  });

  return router;
}
