import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { accountDeletionCancelSchema, accountDeletionRequestSchema, companyRetentionPolicyInputSchema, retentionPreviewInputSchema } from "@paperclipai/shared/productization/security";
import { accessService } from "../services/access.js";
import { logActivity } from "../services/activity-log.js";
import { productizationSecurityService, type RetentionFileAdapter } from "../services/productization/security.js";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

export function productizationSecurityRoutes(db: Db, options: { fileAdapter?: RetentionFileAdapter } = {}) {
  const router = Router();
  const service = productizationSecurityService(db, options);
  const access = accessService(db);
  const authorize = async (req: Request, companyId: string, write: boolean) => {
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    if (!req.actor.userId) throw forbidden("Signed-in account user required");
    if (write && !(await access.canUser(companyId, req.actor.userId, "users:manage_permissions"))) {
      throw forbidden("Company permission management authority is required.");
    }
    return req.actor.userId;
  };

  router.get("/companies/:companyId/productization/security/retention", async (req, res) => {
    const companyId = req.params.companyId as string;
    await authorize(req, companyId, false);
    res.json(await service.getRetention(companyId));
  });

  router.post("/companies/:companyId/productization/security/retention/preview", validate(retentionPreviewInputSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = await authorize(req, companyId, true);
    res.json(await service.previewRetention(companyId, userId, req.body));
  });

  router.put("/companies/:companyId/productization/security/retention", validate(companyRetentionPolicyInputSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = await authorize(req, companyId, true);
    const policy = await service.setRetention(companyId, userId, req.body);
    await logActivity(db, {
      companyId, actorType: "user", actorId: userId, action: "productization.security.retention_policy_updated",
      entityType: "company_retention_policy", entityId: companyId,
      details: { revision: policy.revision, conversations: policy.conversations, files: policy.files, enforcement: policy.enforcement },
    });
    res.json(policy);
  });

  router.post("/accounts/deletion", validate(accountDeletionRequestSchema), async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw forbidden("Signed-in account user required");
    const deletion = await service.requestAccountDeletion(req.actor.userId, req.body.accountId, req.body.confirmation);
    res.status(202).json(deletion);
  });

  router.get("/accounts/:accountId/deletion", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw forbidden("Signed-in account user required");
    res.json(await service.accountDeletionStatus(req.actor.userId, req.params.accountId as string));
  });

  router.post("/accounts/deletion/cancel", validate(accountDeletionCancelSchema), async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw forbidden("Signed-in account user required");
    res.json(await service.cancelAccountDeletion(req.actor.userId, req.body.deletionId));
  });

  return router;
}
