import type { Router } from "express";
import type { Db } from "@paperclipai/db";

// Public review links (pista I): GET/POST /review/:token.
export function registerPublicReviewRoutes(router: Router, db: Db): void {
  void router;
  void db;
  // TODO pista I: registrar las rutas de revisión usando services/public-surface/review-links.ts.
}
