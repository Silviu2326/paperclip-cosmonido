import type { Db } from "@paperclipai/db";

export function conversationMessageService(db: Db) {
  void db;
  return {
    // TODO pista C: draft/send/reply de mensajes; el envío externo pasa por gateExternalAction (idempotencyKey obligatoria).
  };
}
