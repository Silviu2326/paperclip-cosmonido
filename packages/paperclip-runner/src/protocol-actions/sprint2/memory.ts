import type { Sprint3ToolDefinition } from "../sprint3/types.js";

/** Sprint 2 Customer memory agent tools from server/src/services/crm/memory-tools.ts. Keep names in the server dispatcher and PRODUCT_TOOL_NAMES in sync. */
export const sprint2MemoryToolDefinitions = [
  {
    "name": "customer_memory_get",
    "description": "Lista las notas vigentes de memoria del cliente vinculado a esta ejecución, ordenadas por clave y fecha.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "customerId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
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
    "name": "customer_memory_append",
    "description": "Añade una nota nueva a la memoria del cliente vinculado a esta ejecución. Nunca sobrescribe notas anteriores.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "customerId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "key": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "content": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4000
        },
        "validUntil": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 255
        }
      },
      "required": [
        "customerId",
        "key",
        "content",
        "idempotencyKey"
      ],
      "additionalProperties": false
    },
    "example": {
      "customerId": "00000000-0000-4000-8000-000000000001",
      "key": "preferences",
      "content": "Prefers morning calls.",
      "idempotencyKey": "memory-1"
    }
  }
] as const satisfies readonly Sprint3ToolDefinition[];
