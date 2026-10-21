import type { Router } from "express";
import type { Db } from "@paperclipai/db";

// Public web chat (pista F): POST /chat, GET /chat/:sessionId/messages, GET /widget.js.
export function registerPublicChatRoutes(router: Router, db: Db): void {
  void router;
  void db;
  // TODO pista F: registrar las rutas de chat web usando services/conversations/transports/webchat.ts.
}
