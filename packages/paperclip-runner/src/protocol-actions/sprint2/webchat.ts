import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 Web chat agent tool from server/src/services/conversations/webchat-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2WebchatToolDefinitions = [
  {
    "name": "webchat_handoff",
    "description": "Hand a web chat session over to a human.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "conversationId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "conversationId"
      ],
      "additionalProperties": false
    },
    "example": {
      "conversationId": "00000000-0000-4000-8000-000000000001"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
