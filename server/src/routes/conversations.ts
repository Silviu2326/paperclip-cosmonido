import { Router } from "express";
import type { Db } from "@paperclipai/db";

// Sprint 2 pista C (Bandeja). Endpoints from the contract:
//   GET       /companies/:companyId/conversations
//   GET       /conversations/:id
//   POST      /conversations/:id/messages
//   PATCH     /conversations/:id/state
//   POST      /conversations/:id/assign

export function conversationRoutes(db: Db) {
  const router = Router();
  // TODO pista C: implementar los endpoints anteriores con assertCompanyAccess, validate y logActivity.
  void db;
  return router;
}
