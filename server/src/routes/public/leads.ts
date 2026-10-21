import type { Router } from "express";
import type { Db } from "@paperclipai/db";

// Public lead intake: POST /p/:companySlug/form/:formSlug (pista B).
export function registerPublicLeadRoutes(router: Router, db: Db): void {
  void router;
  void db;
  // TODO pista B: registrar POST /form/:formSlug usando services/leads/intake.ts.
}
