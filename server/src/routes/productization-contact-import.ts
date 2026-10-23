import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { contactImportPreviewInputSchema, contactImportCommitInputSchema } from "@paperclipai/shared/productization/contact-import";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { productContactImportService } from "../services/productization/contact-import.js";

export function productizationContactImportRoutes(db: Db) {
  const router = Router(), service = productContactImportService(db);
  const authorize = (req: Request) => { assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); if (!req.actor.userId || req.actor.userId === "local-board") throw forbidden("Inicia sesión para importar contactos."); return { companyId, userId: req.actor.userId }; };
  router.post("/companies/:companyId/productization/imports/contacts/preview", validate(contactImportPreviewInputSchema), async (req, res) => { const { companyId } = authorize(req); res.setHeader("Cache-Control", "no-store"); res.json(await service.preview(companyId, req.body.csv, req.body.mapping)); });
  router.post("/companies/:companyId/productization/imports/contacts/commit", validate(contactImportCommitInputSchema), async (req, res) => { const { companyId, userId } = authorize(req); res.setHeader("Cache-Control", "no-store"); res.json(await service.commit(companyId, userId, req.body)); });
  return router;
}
