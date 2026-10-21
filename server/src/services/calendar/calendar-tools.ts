import type { Db } from "@paperclipai/db";

// Agent tool handlers for calendar_* names in CRM_TOOL_NAMES.
export function calendarAgentTools(db: Db) {
  void db;
  return {
    // TODO pista H: calendar_availability, calendar_book, calendar_reschedule, calendar_cancel.
  };
}
