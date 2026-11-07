import { unprocessable } from "../../errors.js";
import type { ToolGatewayService } from "../tool-gateway.js";
import type { CrmConnectorCall, CrmConnectorInvoker } from "./types.js";

const NO_DISPATCH_CODES = new Set([
  "crm_sync_authority_stale", "crm_sync_connection_unavailable", "crm_sync_actor_membership_revoked",
  "crm_sync_tool_unavailable", "crm_sync_tool_risk_mismatch", "crm_sync_target_mismatch",
  "crm_sync_arguments_invalid", "crm_sync_tool_approval_required",
]);

/** Adapts CRM jobs to the governed tool gateway. It never creates a session or run itself. */
export function createCrmSyncInvoker(gateway: Pick<ToolGatewayService, "executeCrmSyncDelegatedTool">): CrmConnectorInvoker {
  return async (call: CrmConnectorCall) => {
    try {
      return await gateway.executeCrmSyncDelegatedTool(call);
    } catch (error) {
      const value = error && typeof error === "object" ? error as { message?: unknown; reasonCode?: unknown; status?: unknown } : {};
      const preDispatchStatus = value.status === 403 || value.status === 404 || value.status === 422 || value.status === 409 && value.reasonCode !== "crm_sync_outcome_unknown";
      if (preDispatchStatus || typeof value.reasonCode === "string" && NO_DISPATCH_CODES.has(value.reasonCode)) {
        throw unprocessable(typeof value.message === "string" ? value.message : "CRM provider request was rejected before dispatch", { reasonCode: value.reasonCode });
      }
      throw error;
    }
  };
}
