import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  onboardingActivationRequestSchema,
  onboardingEventRequestSchema,
  onboardingFirstJobRequestSchema,
  onboardingPutSchema,
  onboardingTeamSelectionRequestSchema,
} from "@paperclipai/shared/productization/onboarding-api";
import { validate } from "../middleware/validate.js";
import { productizationOnboardingService } from "../services/productization/onboarding.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function productizationOnboardingRoutes(db: Db) {
  const router = Router();
  const service = productizationOnboardingService(db);
  const authorizeBoardCompany = (req: import("express").Request, companyId: string) => {
    assertBoard(req);
    assertCompanyAccess(req, companyId);
  };

  router.get("/companies/:companyId/productization/onboarding", async (req, res) => {
    const companyId = req.params.companyId as string;
    authorizeBoardCompany(req, companyId);
    res.json(await service.get(companyId));
  });

  router.put("/companies/:companyId/productization/onboarding", validate(onboardingPutSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorizeBoardCompany(req, companyId);
    res.json(await service.put(companyId, req.body, getActorInfo(req)));
  });

  router.post("/companies/:companyId/productization/onboarding/events", validate(onboardingEventRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorizeBoardCompany(req, companyId);
    const { expectedRevision, event } = req.body as ReturnType<typeof onboardingEventRequestSchema.parse>;
    res.json(await service.recordUserEvent(companyId, expectedRevision, event, getActorInfo(req)));
  });

  router.post("/companies/:companyId/productization/onboarding/team", validate(onboardingTeamSelectionRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorizeBoardCompany(req, companyId);
    const { expectedRevision, agentIds } = req.body as ReturnType<typeof onboardingTeamSelectionRequestSchema.parse>;
    res.json(await service.selectTeam(companyId, expectedRevision, agentIds, getActorInfo(req)));
  });

  router.post("/companies/:companyId/productization/onboarding/activate", validate(onboardingActivationRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorizeBoardCompany(req, companyId);
    const { expectedRevision } = req.body as ReturnType<typeof onboardingActivationRequestSchema.parse>;
    res.json(await service.activateTeam(companyId, expectedRevision, getActorInfo(req)));
  });

  router.post("/companies/:companyId/productization/onboarding/first-job", validate(onboardingFirstJobRequestSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    authorizeBoardCompany(req, companyId);
    const { expectedRevision, goalId } = req.body as ReturnType<typeof onboardingFirstJobRequestSchema.parse>;
    res.json(await service.recordFirstJob(companyId, expectedRevision, goalId, getActorInfo(req)));
  });

  return router;
}
