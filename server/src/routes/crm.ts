import { Router } from "express";
import type { Db } from "@paperclipai/db";

// Sprint 2 pista A (CRM). Endpoints from the contract:
//   GET/POST  /companies/:companyId/customers
//   GET/PATCH /customers/:id
//   GET/POST  /companies/:companyId/contacts
//   GET/PATCH /contacts/:id
//   GET/POST  /companies/:companyId/opportunities
//   GET/PATCH /opportunities/:id
//   POST      /opportunities/:id/stage
//   GET/POST  /companies/:companyId/crm/activities
//   GET/POST  /companies/:companyId/commitments
//   POST      /commitments/:id/resolve
//   GET       /companies/:companyId/crm/duplicates
//   GET/POST  /customers/:id/memory                (pista K)
//   GET/POST  /companies/:companyId/crm/sync       (pista L)

export function crmRoutes(db: Db) {
  const router = Router();
  // TODO pista A: implementar los endpoints anteriores con assertCompanyAccess, validate y logActivity.
  void db;
  return router;
}
