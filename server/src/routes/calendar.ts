import { Router } from "express";
import type { Db } from "@paperclipai/db";

// Sprint 2 pista H (Agenda). Endpoints from the contract:
//   GET  /companies/:companyId/calendar/availability
//   GET  /companies/:companyId/calendar/events
//   GET  /calendar/events/:id
// Public (in routes/public/booking.ts): GET/POST /p/:companySlug/book/:slug

export function calendarRoutes(db: Db) {
  const router = Router();
  // TODO pista H: implementar los endpoints anteriores con assertCompanyAccess y gateExternalAction para reservas.
  void db;
  return router;
}
