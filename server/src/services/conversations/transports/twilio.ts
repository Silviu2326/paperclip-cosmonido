import type { Db } from "@paperclipai/db";

// Twilio (SMS and WhatsApp) transport (pistas D/E).
export function twilioTransportService(db: Db) {
  void db;
  return {
    // TODO pista D: verificación de firma Twilio y normalización a conversation_messages.
  };
}
