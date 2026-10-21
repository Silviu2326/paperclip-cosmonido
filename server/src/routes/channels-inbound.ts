import { Router } from "express";
import type { Db } from "@paperclipai/db";

// Sprint 2 pistas D/E (canales entrantes). Signed webhooks, no company session:
//   POST /webhooks/meta/:companyId
//   POST /webhooks/twilio/:companyId
// Each handler must verify the provider signature before touching the payload.

export function channelInboundRoutes(db: Db) {
  const router = Router();
  // TODO pista D/E: verificación de firma por proveedor y despacho a transports/meta.ts y transports/twilio.ts.
  void db;
  return router;
}
