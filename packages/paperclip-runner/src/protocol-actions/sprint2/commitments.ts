import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 Commitment agent tools from server/src/services/crm/crm-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2CommitmentToolDefinitions = [
  {
    "name": "commitment_create",
    "description": "Record a commitment made by us or by the customer.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "who": {
          "type": "string",
          "enum": [
            "us",
            "them"
          ]
        },
        "what": {
          "type": "string",
          "minLength": 1,
          "maxLength": 1000
        },
        "dueAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
            },
            {
              "type": "null"
            }
          ]
        },
        "customerId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
            },
            {
              "type": "null"
            }
          ]
        },
        "contactId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
            },
            {
              "type": "null"
            }
          ]
        },
        "opportunityId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
            },
            {
              "type": "null"
            }
          ]
        },
        "conversationId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
            },
            {
              "type": "null"
            }
          ]
        },
        "evidence": {
          "anyOf": [
            {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {}
            },
            {
              "type": "null"
            }
          ]
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 240
        }
      },
      "required": [
        "who",
        "what"
      ],
      "additionalProperties": false
    },
    "example": {
      "who": "us",
      "what": "Send the revised quote",
      "dueAt": "2026-10-30T12:00:00.000Z",
      "customerId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "commitment_resolve",
    "description": "Mark a commitment as kept, missed or cancelled.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "commitmentId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "status": {
          "type": "string",
          "enum": [
            "kept",
            "missed",
            "cancelled"
          ]
        },
        "note": {
          "type": "string",
          "maxLength": 2000
        }
      },
      "required": [
        "commitmentId",
        "status"
      ],
      "additionalProperties": false
    },
    "example": {
      "commitmentId": "00000000-0000-4000-8000-000000000002",
      "status": "kept",
      "note": "Quote sent"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
