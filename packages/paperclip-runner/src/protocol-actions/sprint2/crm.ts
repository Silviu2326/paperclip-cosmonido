import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 CRM agent tools (crm_*) from server/src/services/crm/crm-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2CrmToolDefinitions = [
  {
    "name": "crm_search",
    "description": "Search customers and opportunities by text.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "q": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50
        }
      },
      "required": [
        "q"
      ],
      "additionalProperties": false
    },
    "example": {
      "q": "Acme",
      "limit": 10
    }
  },
  {
    "name": "crm_get_customer",
    "description": "Get one customer with its open opportunities.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "customerId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        }
      },
      "required": [
        "customerId"
      ],
      "additionalProperties": false
    },
    "example": {
      "customerId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "crm_create_customer",
    "description": "Create a customer (person or organization).",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "kind": {
          "default": "organization",
          "type": "string",
          "enum": [
            "person",
            "organization"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "domain": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 253
            },
            {
              "type": "null"
            }
          ]
        },
        "tags": {
          "default": [],
          "maxItems": 50,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 60
          }
        },
        "ownerUserId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1
            },
            {
              "type": "null"
            }
          ]
        },
        "ownerAgentId": {
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
        "health": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "good",
                "watch",
                "risk"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "notes": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 20000
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
        "kind",
        "name",
        "tags"
      ],
      "additionalProperties": false
    },
    "example": {
      "kind": "organization",
      "name": "Acme S.L.",
      "tags": []
    }
  },
  {
    "name": "crm_create_contact",
    "description": "Create a contact and optionally link it to a customer.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "firstName": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 120
            },
            {
              "type": "null"
            }
          ]
        },
        "lastName": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 120
            },
            {
              "type": "null"
            }
          ]
        },
        "displayName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "primaryEmail": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 320,
              "format": "email",
              "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "primaryPhone": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 32
            },
            {
              "type": "null"
            }
          ]
        },
        "title": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 200
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
              "pattern": "^[a-z]{2}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "preferredChannel": {
          "anyOf": [
            {
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
            {
              "type": "null"
            }
          ]
        },
        "consents": {
          "default": {},
          "type": "object",
          "properties": {
            "email": {
              "type": "boolean"
            },
            "whatsapp": {
              "type": "boolean"
            },
            "sms": {
              "type": "boolean"
            },
            "updatedAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
            }
          },
          "additionalProperties": false
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
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 240
        }
      },
      "required": [
        "displayName",
        "consents"
      ],
      "additionalProperties": false
    },
    "example": {
      "displayName": "Ana Ruiz",
      "primaryEmail": "ana@example.com",
      "consents": {},
      "customerId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "crm_create_opportunity",
    "description": "Create an opportunity for a customer in the sales pipeline.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "customerId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "primaryContactId": {
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
        "title": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "stageKey": {
          "default": "new",
          "type": "string",
          "enum": [
            "new",
            "qualified",
            "proposal",
            "negotiation",
            "won",
            "lost"
          ]
        },
        "amountCents": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "currency": {
          "anyOf": [
            {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "probability": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 100
            },
            {
              "type": "null"
            }
          ]
        },
        "expectedCloseAt": {
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
        "nextAction": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 500
            },
            {
              "type": "null"
            }
          ]
        },
        "nextActionAt": {
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
        "ownerUserId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1
            },
            {
              "type": "null"
            }
          ]
        },
        "ownerAgentId": {
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
        "source": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 120
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
        "customerId",
        "title",
        "stageKey"
      ],
      "additionalProperties": false
    },
    "example": {
      "customerId": "00000000-0000-4000-8000-000000000001",
      "title": "Pilot project",
      "stageKey": "new"
    }
  },
  {
    "name": "crm_update_opportunity_stage",
    "description": "Move an opportunity to another sales stage. May need approval first; the result tells whether it was applied or is pending.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "opportunityId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "stageKey": {
          "type": "string",
          "enum": [
            "new",
            "qualified",
            "proposal",
            "negotiation",
            "won",
            "lost"
          ]
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        },
        "reason": {
          "type": "string",
          "maxLength": 500
        }
      },
      "required": [
        "opportunityId",
        "stageKey",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "example": {
      "opportunityId": "00000000-0000-4000-8000-000000000002",
      "stageKey": "qualified",
      "expectedVersion": 1,
      "reason": "Budget confirmed"
    }
  },
  {
    "name": "crm_set_next_action",
    "description": "Set the next action and its date on an opportunity.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "opportunityId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "nextAction": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "nextActionAt": {
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
        "expectedVersion": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "opportunityId",
        "nextAction"
      ],
      "additionalProperties": false
    },
    "example": {
      "opportunityId": "00000000-0000-4000-8000-000000000002",
      "nextAction": "Send proposal",
      "nextActionAt": "2026-10-28T09:00:00.000Z"
    }
  },
  {
    "name": "crm_log_activity",
    "description": "Record a note, call, email, message or meeting on a CRM record.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subjectKind": {
          "type": "string",
          "enum": [
            "customer",
            "contact",
            "lead",
            "opportunity",
            "conversation",
            "commitment"
          ]
        },
        "subjectId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
        },
        "kind": {
          "type": "string",
          "enum": [
            "note",
            "call",
            "email",
            "message",
            "meeting",
            "stage_change",
            "status_change",
            "task",
            "system"
          ]
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        },
        "payload": {
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
        "externalRef": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 500
            },
            {
              "type": "null"
            }
          ]
        },
        "occurredAt": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 240
        }
      },
      "required": [
        "subjectKind",
        "subjectId",
        "kind",
        "summary"
      ],
      "additionalProperties": false
    },
    "example": {
      "subjectKind": "customer",
      "subjectId": "00000000-0000-4000-8000-000000000001",
      "kind": "call",
      "summary": "Discussed scope by phone"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
