import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 Lead agent tools from server/src/services/leads/lead-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2LeadToolDefinitions = [
  {
    "name": "lead_get",
    "description": "Read one lead of the company by id, with its payload, status and links.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "leadId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "leadId"
      ],
      "additionalProperties": false
    },
    "example": {
      "leadId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "lead_list",
    "description": "List leads of the company, filtered by status, source, priority or assignment.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "q": {
          "type": "string",
          "maxLength": 200
        },
        "status": {
          "type": "string",
          "enum": [
            "new",
            "triaged",
            "qualified",
            "converted",
            "discarded"
          ]
        },
        "cursor": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "limit": {
          "default": 25,
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "source": {
          "type": "string",
          "enum": [
            "form",
            "csv",
            "email",
            "whatsapp",
            "messenger",
            "instagram",
            "telegram",
            "webchat",
            "voice",
            "manual",
            "api"
          ]
        },
        "priority": {
          "type": "string",
          "enum": [
            "low",
            "normal",
            "high"
          ]
        },
        "assigned": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "required": [
        "limit"
      ],
      "additionalProperties": false
    },
    "example": {
      "status": "new",
      "limit": 20
    }
  },
  {
    "name": "lead_triage",
    "description": "Set priority, language or agent assignment on a lead. A new lead becomes triaged.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "leadId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "priority": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "low",
                "normal",
                "high"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "language": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 2,
              "maxLength": 10
            },
            {
              "type": "null"
            }
          ]
        },
        "assignedAgentId": {
          "anyOf": [
            {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "leadId"
      ],
      "additionalProperties": false
    },
    "example": {
      "leadId": "00000000-0000-4000-8000-000000000001",
      "priority": "high",
      "language": "es"
    }
  },
  {
    "name": "lead_convert",
    "description": "Convert a lead into customer, contact and optionally an opportunity. Requires idempotencyKey; repeating it is safe.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "leadId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "customerId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "contactId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "createOpportunity": {
          "default": false,
          "type": "boolean"
        },
        "opportunityTitle": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 240
        }
      },
      "required": [
        "leadId",
        "createOpportunity",
        "idempotencyKey"
      ],
      "additionalProperties": false
    },
    "example": {
      "leadId": "00000000-0000-4000-8000-000000000001",
      "createOpportunity": true,
      "opportunityTitle": "Pilot project",
      "idempotencyKey": "lead-convert-1"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
