import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 Calendar agent tools from server/src/services/calendar/calendar-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2CalendarToolDefinitions = [
  {
    "name": "calendar_availability",
    "description": "List free slots for a booking type between two ISO instants (max 31 days).",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string",
          "description": "Booking type slug"
        },
        "from": {
          "type": "string",
          "description": "ISO 8601 start"
        },
        "to": {
          "type": "string",
          "description": "ISO 8601 end"
        }
      },
      "required": [
        "slug",
        "from",
        "to"
      ],
      "additionalProperties": false
    },
    "example": {
      "slug": "demo-call",
      "from": "2026-10-27T09:00:00.000Z",
      "to": "2026-10-27T18:00:00.000Z"
    }
  },
  {
    "name": "calendar_book",
    "description": "Book a free slot for a booking type. Sent or left as a draft depending on the agent's booking autonomy.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string"
        },
        "startsAt": {
          "type": "string",
          "description": "ISO 8601 start of a slot returned by calendar_availability"
        },
        "attendee": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "email": {
              "type": "string"
            },
            "phone": {
              "type": "string"
            }
          },
          "required": [
            "name",
            "email"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "slug",
        "startsAt",
        "attendee"
      ],
      "additionalProperties": false
    },
    "example": {
      "slug": "demo-call",
      "startsAt": "2026-10-27T10:00:00.000Z",
      "attendee": {
        "name": "Ana Ruiz",
        "email": "ana@example.com"
      }
    }
  },
  {
    "name": "calendar_reschedule",
    "description": "Move a booking to a new free slot of the same booking type.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "eventId": {
          "type": "string"
        },
        "startsAt": {
          "type": "string"
        }
      },
      "required": [
        "eventId",
        "startsAt"
      ],
      "additionalProperties": false
    },
    "example": {
      "eventId": "00000000-0000-4000-8000-000000000002",
      "startsAt": "2026-10-28T10:00:00.000Z"
    }
  },
  {
    "name": "calendar_cancel",
    "description": "Cancel a booking. Marked cancelled only when the provider confirms it.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "eventId": {
          "type": "string"
        }
      },
      "required": [
        "eventId"
      ],
      "additionalProperties": false
    },
    "example": {
      "eventId": "00000000-0000-4000-8000-000000000002"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
