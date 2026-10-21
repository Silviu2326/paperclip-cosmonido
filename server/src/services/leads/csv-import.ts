import type { Db } from "@paperclipai/db";

export function leadCsvImportService(db: Db) {
  void db;
  return {
    // TODO pista B: importación CSV de leads (POST /companies/:companyId/leads/import), idempotente por source_ref.
  };
}
