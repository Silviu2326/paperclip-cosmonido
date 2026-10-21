import { Router } from "express";
import type { Db } from "@paperclipai/db";

// Sprint 2 pista B (Leads). Endpoints from the contract:
//   GET/POST  /companies/:companyId/leads
//   GET       /leads/:id
//   POST      /leads/:id/convert
//   POST      /leads/:id/discard
//   POST      /companies/:companyId/leads/import     (CSV)
// Public (in routes/public/leads.ts): POST /p/:companySlug/form/:formSlug

export function leadRoutes(db: Db) {
  const router = Router();
  // TODO pista B: implementar los endpoints anteriores con assertCompanyAccess, validate y logActivity.
  void db;
  return router;
}
