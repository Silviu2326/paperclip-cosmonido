import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { publicCatalogDecisionSchema, publicCatalogRatingSchema, publicCatalogRequestSchema } from "@paperclipai/shared/productization/public-catalog";
import { badRequest, forbidden, unprocessable } from "../errors.js";
import { accessService } from "../services/access.js";
import { logActivity } from "../services/activity-log.js";
import { productizationPublicCatalogService } from "../services/productization/public-catalog.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const idSchema = z.string().uuid();
function id(req: Request, key: string) { const parsed = idSchema.safeParse(req.params[key]); if (!parsed.success) throw badRequest(`Invalid ${key}`); return parsed.data; }
function userId(req: Request) { if (req.actor.type !== "board" || !req.actor.userId) throw forbidden("An authenticated board user is required."); return req.actor.userId; }

export function productizationPublicCatalogRoutes(db: Db) {
  const router = Router();
  const service = productizationPublicCatalogService(db);
  const access = accessService(db);
  async function audit(req: Request, companyId: string, action: string, entityType: string, entityId: string) {
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId, agentApiKeyId: actor.agentApiKeyId, action, entityType, entityId });
  }
  async function instanceAdmin(req: Request) {
    assertBoard(req);
    if (req.actor.source !== "local_implicit" && !(req.actor.userId && await access.isInstanceAdmin(req.actor.userId))) throw forbidden("Instance administrator access is required.");
    return req.actor.userId ?? "local-implicit-admin";
  }
  router.post("/companies/:companyId/productization/catalog/public-request", async (req, res) => {
    assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId);
    const actorId = userId(req); const body = publicCatalogRequestSchema.safeParse(req.body);
    if (!body.success) throw unprocessable("Invalid public catalog request", { issues: body.error.issues });
    const decision = await access.decide({ actor: req.actor, action: "agents:create", resource: { type: "company", companyId } });
    if (!decision.allowed) throw forbidden(decision.explanation);
    const result = await service.request(companyId, body.data.packageId, body.data.selection, actorId);
    await audit(req, companyId, "productization.public_catalog_review_requested", "public_catalog_listing", result.id);
    res.status(201).json(result);
  });
  router.post("/companies/:companyId/productization/catalog/public-import", async (req, res) => {
    assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId);
    const actorId = userId(req); const parsedListing = idSchema.safeParse(req.body?.listingId); if (!parsedListing.success) throw badRequest("Invalid listingId"); const listingId = parsedListing.data;
    const decision = await access.decide({ actor: req.actor, action: "agents:create", resource: { type: "company", companyId } });
    if (!decision.allowed) throw forbidden(decision.explanation);
    const result = await service.importDraft(companyId, listingId, actorId);
    await audit(req, companyId, "productization.public_catalog_imported_as_draft", "portable_package", result.package.id);
    res.status(201).json(result);
  });
  router.post("/companies/:companyId/productization/catalog/public-ratings", async (req, res) => {
    assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId);
    const actorId = userId(req); const body = publicCatalogRatingSchema.safeParse(req.body);
    if (!body.success) throw unprocessable("Invalid rating", { issues: body.error.issues });
    const result = await service.rate(companyId, body.data.listingId, body.data.installationId, actorId, body.data.rating, body.data.review);
    await audit(req, companyId, "productization.public_catalog_rating_submitted", "public_catalog_rating", result.id);
    res.status(201).json(result);
  });
  router.post("/companies/:companyId/productization/catalog/public-withdraw/:listingId", async (req, res) => {
    assertBoard(req); const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId); userId(req);
    const decision = await access.decide({ actor: req.actor, action: "agents:create", resource: { type: "company", companyId } });
    if (!decision.allowed) throw forbidden(decision.explanation);
    const result = await service.withdraw(companyId, id(req, "listingId"));
    await audit(req, companyId, "productization.public_catalog_withdrawn", "public_catalog_listing", result.id);
    res.json(result);
  });
  router.get("/productization/public-catalog/review-queue", async (req, res) => { await instanceAdmin(req); res.json(await service.reviewQueue()); });
  router.get("/productization/public-catalog/ratings", async (req, res) => { await instanceAdmin(req); res.json(await service.moderationQueue()); });
  router.post("/productization/public-catalog/:listingId/review", async (req, res) => {
    const adminId = await instanceAdmin(req); const body = publicCatalogDecisionSchema.safeParse(req.body);
    if (!body.success) throw unprocessable("Invalid review decision", { issues: body.error.issues });
    const result = await service.review(id(req, "listingId"), body.data.expectedContentHash, body.data.decision, body.data.note, adminId);
    await audit(req, result.companyId, `productization.public_catalog_${body.data.decision}d`, "public_catalog_listing", result.id);
    res.json(result);
  });
  router.post("/productization/public-catalog/ratings/:ratingId/moderate", async (req, res) => {
    const adminId = await instanceAdmin(req); const body = z.object({ visible: z.boolean() }).strict().safeParse(req.body);
    if (!body.success) throw unprocessable("Invalid moderation action", { issues: body.error.issues });
    const result = await service.moderateRating(id(req, "ratingId"), body.data.visible, adminId);
    await audit(req, result.companyId, `productization.public_catalog_rating_${body.data.visible ? "restored" : "hidden"}`, "public_catalog_rating", result.id!);
    res.json(result);
  });
  return router;
}

/** Mount before session/actor middleware; contains only anonymous bounded reads. */
export function productizationPublicCatalogReadRoutes(db: Db) {
  const router = Router();
  const service = productizationPublicCatalogService(db);
  router.get("/catalog/public", async (req, res) => {
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    if (cursor && !idSchema.safeParse(cursor).success) throw badRequest("Invalid cursor");
    res.json(await service.list(cursor));
  });
  router.get("/catalog/public/:listingId", async (req, res) => res.json(await service.get(id(req, "listingId"))));
  router.get("/catalog/public/:listingId/ratings", async (req, res) => res.json(await service.ratings(id(req, "listingId"))));
  return router;
}
