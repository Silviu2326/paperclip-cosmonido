import type { Db } from "@paperclipai/db";

// Agent tool handlers for lead_* names in CRM_TOOL_NAMES.
export function leadAgentTools(db: Db) {
  void db;
  return {
    // TODO pista B: lead_convert, lead_get, lead_list, lead_triage.
  };
}
