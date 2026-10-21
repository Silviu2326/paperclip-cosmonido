import type { Db } from "@paperclipai/db";
import { CRM_TOOL_NAMES } from "@paperclipai/shared";

// Agent tool handlers for the CRM names in CRM_TOOL_NAMES (crm_*, commitment_*, customer_memory_*).
export function crmAgentTools(db: Db) {
  void db;
  void CRM_TOOL_NAMES;
  return {
    // TODO pista A: un handler por herramienta CRM, siguiendo services/project-tools.ts.
  };
}
