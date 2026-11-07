import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { mediaOperationsSchema } from "@paperclipai/shared";
import { mediaPresetService } from "../services/productization/media-presets.js";
import { badRequest, forbidden } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const referenceSchema = z.object({
  logoAssetId: z.string().uuid().nullable().optional(),
  voiceAssetId: z.string().uuid().nullable().optional(),
  voiceProviderReference: z.string().trim().max(128).nullable().optional(),
  musicAssetId: z.string().uuid().nullable().optional(),
  musicLicenseReferenceUrl: z.string().url().max(1000).nullable().optional(),
}).strict();
const createPresetSchema = z.object({
  presetKey: z.string().trim().min(2).max(80),
  kind: z.enum(["clip", "demo", "testimonial", "tutorial", "advert"]),
  outputAspect: z.enum(["9:16", "16:9"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  inputCriteria: z.object({ acceptedContentTypes: z.array(z.string().min(1).max(100)).min(1).max(5), transcriptRequired: z.boolean(), notes: z.array(z.string().trim().min(1).max(300)).max(10) }).strict(),
  operations: mediaOperationsSchema.shape.operations,
  brandReferences: referenceSchema.optional(),
}).strict();

export function productizationMediaPresetRoutes(db: Db) {
  const router = Router();
  const service = mediaPresetService(db);
  router.get("/companies/:companyId/media-presets", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await service.list(companyId));
  });
  router.post("/companies/:companyId/media-presets", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Only board users can publish media presets");
    const parsed = createPresetSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid media preset", parsed.error.issues);
    res.status(201).json(await service.create(companyId, parsed.data, actor.actorId));
  });
  router.get("/companies/:companyId/media-presets/metrics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = z.enum(["7", "30", "90"]).default("30").safeParse(req.query.days);
    if (!parsed.success) throw badRequest("days must be 7, 30 or 90");
    res.json(await service.metrics(companyId, Number(parsed.data) as 7 | 30 | 90));
  });
  return router;
}
