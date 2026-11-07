import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { agencyBrandSchema, agencyClientAccessSchema, agencyClientProvisionSchema } from "@paperclipai/shared/productization/agency";
import { badRequest, forbidden, notFound, unprocessable } from "../errors.js";
import { accessService } from "../services/access.js";
import { productizationAgencyService } from "../services/productization/agency.js";
import { isCloudManagedInstance } from "../services/cloud-instance.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const uuid = z.string().uuid();
function parseUuid(value: unknown, label: string) { const parsed = uuid.safeParse(value); if (!parsed.success) throw badRequest(`Invalid ${label}`); return parsed.data; }
function authenticatedUser(req: Request) { assertBoard(req); if (!req.actor.userId) throw forbidden("Signed-in account user required."); return req.actor.userId; }

export function productizationAgencyRoutes(db: Db) {
  const router = Router(), service = productizationAgencyService(db), access = accessService(db);
  async function audit(req: Request, companyId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId, agentApiKeyId: actor.agentApiKeyId, action, entityType, entityId, details });
  }
  router.get("/productization/accounts/:accountId/agency/portfolio", async (req, res) => {
    const accountId = parseUuid(req.params.accountId, "accountId");
    res.json(await service.portfolio(accountId, authenticatedUser(req)));
  });
  router.get("/productization/accounts/:accountId/agency/operations", async (req, res) => {
    const accountId = parseUuid(req.params.accountId, "accountId");
    res.json(await service.operations(accountId, authenticatedUser(req)));
  });
  router.post("/productization/accounts/:accountId/agency/clients", async (req, res) => {
    const accountId = parseUuid(req.params.accountId, "accountId"), userId = authenticatedUser(req);
    if (isCloudManagedInstance()) throw forbidden("Client-company provisioning is managed by Paperclip Cloud on this instance.", { code: "cloud_managed" });
    const parsed = agencyClientProvisionSchema.safeParse(req.body);
    if (!parsed.success) throw unprocessable("Invalid agency client setup request.", { issues: parsed.error.issues });
    assertCompanyAccess(req, parsed.data.sourceCompanyId);
    const allowed = await access.canUser(parsed.data.sourceCompanyId, userId, "agents:create");
    if (!allowed) throw forbidden("Source package publication authority is required.");
    const result = await service.createClient(accountId, userId, parsed.data);
    await audit(req, result.companyId, "agency.client_provisioning_requested", "agency_client_setup", result.id, { status: result.status });
    res.status(result.status === "awaiting_capacity" ? 202 : 201).json(result);
  });
  router.post("/productization/accounts/:accountId/agency/clients/:operationId/resume", async (req, res) => {
    const accountId = parseUuid(req.params.accountId, "accountId"), operationId = parseUuid(req.params.operationId, "operationId");
    const result = await service.resume(accountId, operationId, authenticatedUser(req));
    await audit(req, result.companyId, "agency.client_provisioning_resumed", "agency_client_setup", result.id, { status: result.status });
    res.json(result);
  });
  router.post("/companies/:companyId/agency/client-users", async (req, res) => {
    const companyId = parseUuid(req.params.companyId, "companyId"), userId = authenticatedUser(req);
    assertCompanyAccess(req, companyId);
    if (!await access.canUser(companyId, userId, "users:manage_permissions")) throw forbidden("Company permission management is required; account roles do not grant company access.");
    const parsed = agencyClientAccessSchema.safeParse(req.body);
    if (!parsed.success) throw unprocessable("Invalid client user.", { issues: parsed.error.issues });
    const result = await service.addClientUser(companyId, userId, parsed.data.userId);
    await audit(req, companyId, "agency.client_viewer_added", "company_membership", parsed.data.userId, { role: "viewer" });
    res.status(201).json(result);
  });
  router.put("/companies/:companyId/agency/brand", async (req, res) => {
    const companyId = parseUuid(req.params.companyId, "companyId"), userId = authenticatedUser(req);
    assertCompanyAccess(req, companyId);
    if (!await access.canUser(companyId, userId, "users:manage_permissions")) throw forbidden("Company permission management is required.");
    const parsed = agencyBrandSchema.safeParse(req.body);
    if (!parsed.success) throw unprocessable("Invalid public brand settings.", { issues: parsed.error.issues });
    const result = await service.saveBrand(companyId, userId, parsed.data);
    await audit(req, companyId, "agency.public_brand_updated", "agency_brand", companyId, { publicEnabled: result.publicEnabled, domainStatus: result.domainStatus });
    res.json(result);
  });
  router.get("/companies/:companyId/agency/brand", async (req, res) => {
    const companyId = parseUuid(req.params.companyId, "companyId"), userId = authenticatedUser(req);
    assertCompanyAccess(req, companyId);
    if (!await access.canUser(companyId, userId, "users:manage_permissions")) throw forbidden("Company permission management is required.");
    res.json(await service.getBrandSettings(companyId));
  });
  return router;
}

/** Anonymous public projection and logo streaming. Mount before actor middleware. */
export function productizationAgencyPublicRoutes(db: Db, storage?: StorageService) {
  const router = Router(), service = productizationAgencyService(db);
  router.get("/public/productization/agency/brands/:companyId", async (req, res) => {
    const brand = await service.getBrand(parseUuid(req.params.companyId, "companyId"));
    if (!brand) throw notFound("Public brand not found.");
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(brand);
  });
  router.get("/public/productization/agency/brands/:companyId/logo", async (req, res, next) => {
    const companyId = parseUuid(req.params.companyId, "companyId"), logo = await service.getPublicLogo(companyId);
    if (!logo || !storage || logo.byteSize > 5 * 1024 * 1024) throw notFound("Public logo not found.");
    const object = await storage.getObject(companyId, logo.objectKey);
    res.setHeader("Content-Type", logo.contentType);
    res.setHeader("Content-Length", String(logo.byteSize));
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    object.stream.on("error", next);
    res.on("close", () => object.stream.destroy());
    object.stream.pipe(res);
  });
  return router;
}
