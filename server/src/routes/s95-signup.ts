import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { productSignupPlanIntentSchema, productTrialStartSchema } from "@paperclipai/shared/productization/trial";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { productizationAccountsService } from "../services/productization/accounts.js";
import { assertBoard } from "./authz.js";

/** Signup continuation. It only creates the account trial after a fresh DB email-verification check. */
export function s95SignupRoutes(db: Db) {
  const router = Router();
  const accounts = productizationAccountsService(db);
  router.post("/productization/signup/plan", validate(productSignupPlanIntentSchema), async (req, res) => {
    assertBoard(req);
    if (req.actor.type !== "board" || !req.actor.userId) throw forbidden("Signed-in account user required");
    res.status(201).json(await accounts.prepareSignupPlan(req.actor.userId, req.body));
  });
  router.post("/productization/signup/trial", validate(productTrialStartSchema), async (req, res) => {
    assertBoard(req);
    if (req.actor.type !== "board" || !req.actor.userId) throw forbidden("Signed-in account user required");
    res.status(201).json(await accounts.startTrial(req.actor.userId, req.body));
  });
  return router;
}
