import type { Db } from "@paperclipai/db";

// Meta (WhatsApp, Messenger, Instagram) transport (pistas D/E).
export function metaTransportService(db: Db) {
  void db;
  return {
    // TODO pista D: normalizar eventos firmados de Meta a conversation_messages.
  };
}
