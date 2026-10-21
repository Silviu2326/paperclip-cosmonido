import type { Db } from "@paperclipai/db";

// Agent tool handlers for conversation_* and message_* names in CRM_TOOL_NAMES.
export function messageAgentTools(db: Db) {
  void db;
  return {
    // TODO pista C: conversation_list, conversation_get, message_draft, message_send, message_reply, conversation_set_state.
  };
}
