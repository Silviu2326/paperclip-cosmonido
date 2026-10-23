import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { productizationOnboarding } from "@paperclipai/db";
import { eq, sql } from "drizzle-orm";
import { customerPortfolioQuerySchema } from "@paperclipai/shared/productization/customer-portfolio";
import { customerPortfolioService } from "../services/productization/customer-portfolio.js";
import { outcomeMetricsQuerySchema } from "@paperclipai/shared/productization/outcome-metrics";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { outcomeMetricsService } from "../services/productization/outcome-metrics.js";
import { unprocessable } from "../errors.js";

export function productizationMetricsRoutes(db: Db) {
  const router = Router();
  const service = outcomeMetricsService(db);
  router.get("/companies/:companyId/productization/home", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req); assertCompanyAccess(req, companyId);
    const [stored] = await db.select({ path:sql<string>`${productizationOnboarding.journey}->>'path'` }).from(productizationOnboarding).where(eq(productizationOnboarding.companyId,companyId)).limit(1);
    res.setHeader("Cache-Control","no-store");
    res.json({ path: stored && ["entrepreneur","agency","commercial"].includes(stored.path) ? stored.path : null });
  });
  router.get("/companies/:companyId/productization/customer-portfolio", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const query = customerPortfolioQuerySchema.safeParse(req.query);
    if (!query.success) throw unprocessable("Invalid portfolio query", query.error.issues);
    res.setHeader("Cache-Control", "no-store");
    res.json(await customerPortfolioService(db).read(companyId, query.data.days, query.data.cursor));
  });
  router.get("/companies/:companyId/productization/metrics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const parsed = outcomeMetricsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw unprocessable("Invalid metrics period", parsed.error.issues);
    res.json(await service.read(companyId, parsed.data.days));
  });
  return router;
}
