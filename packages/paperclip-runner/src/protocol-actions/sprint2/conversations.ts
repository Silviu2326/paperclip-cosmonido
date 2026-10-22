import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 Conversation and message agent tools from server/src/services/conversations/message-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2ConversationToolDefinitions = [
  {
    "name": "conversation_list",
    "description": "List conversations by status with pagination.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "open",
            "waiting_us",
            "waiting_them",
            "closed"
          ]
        },
        "channel": {
          "type": "string",
          "enum": [
            "email",
            "whatsapp",
            "messenger",
            "instagram",
            "telegram",
            "webchat",
            "voice",
            "sms"
          ]
        },
        "assigned": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "overdue": {
          "type": "boolean"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "cursor": {
          "type": "string",
          "pattern": "^\\d{1,9}$"
        }
      },
      "additionalProperties": false
    },
    "example": {
      "status": "open",
      "limit": 20
    }
  },
  {
    "name": "conversation_get",
    "description": "Get one conversation with its recent messages.",
    "effect": "read",
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
  },
  {
    "name": "message_draft",
    "description": "Draft an outbound message without sending it.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "conversationId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "body": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100000
        }
      },
      "required": [
        "conversationId",
        "body"
      ],
      "additionalProperties": false
    },
    "example": {
      "conversationId": "00000000-0000-4000-8000-000000000001",
      "body": "Hola, te envio la propuesta."
    }
  },
  {
    "name": "message_send",
    "description": "Send an outbound message (goes through the external action gate).",
    "effect": "write",
    "inputSchema": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "messageId": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            }
          },
          "required": [
            "messageId"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "conversationId": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "body": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100000
            }
          },
          "required": [
            "conversationId",
            "body"
          ],
          "additionalProperties": false
        }
      ]
    },
    "example": {
      "messageId": "00000000-0000-4000-8000-000000000002"
    }
  },
  {
    "name": "message_reply",
    "description": "Reply in an existing conversation (goes through the external action gate).",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "conversationId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "body": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100000
        }
      },
      "required": [
        "conversationId",
        "body"
      ],
      "additionalProperties": false
    },
    "example": {
      "conversationId": "00000000-0000-4000-8000-000000000001",
      "body": "Gracias, lo revisamos hoy."
    }
  },
  {
    "name": "conversation_set_state",
    "description": "Change the status or priority of a conversation.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "conversationId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "status": {
          "type": "string",
          "enum": [
            "open",
            "waiting_us",
            "waiting_them",
            "closed"
          ]
        },
        "priority": {
          "type": "string",
          "enum": [
            "low",
            "normal",
            "high",
            "urgent"
          ]
        }
      },
      "required": [
        "conversationId",
        "status"
      ],
      "additionalProperties": false
    },
    "example": {
      "conversationId": "00000000-0000-4000-8000-000000000001",
      "status": "waiting_them",
      "priority": "normal"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
