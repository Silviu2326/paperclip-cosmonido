import type { Db } from "@paperclipai/db";

export function leadIntakeService(db: Db) {
  void db;
  return {
    // TODO pista B: normalizar entradas de cualquier canal (form, email, whatsapp, webchat, api...) a una fila de leads con identity.ts.
  };
}
