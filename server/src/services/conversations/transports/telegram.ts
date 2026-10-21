import type { Db } from "@paperclipai/db";

// Telegram transport (pistas D/E).
export function telegramTransportService(db: Db) {
  void db;
  return {
    // TODO pista E: normalizar updates de Telegram a conversation_messages.
  };
}
