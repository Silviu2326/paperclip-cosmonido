import { playbooksToolDefinitions } from "./sprint3/playbooks.js";
import { leadsToolDefinitions } from "./sprint3/leads.js";
import { autonomyToolDefinitions } from "./sprint3/autonomy.js";
import { commercial_decisionsToolDefinitions } from "./sprint3/commercial-decisions.js";
import { commitmentsToolDefinitions } from "./sprint3/commitments.js";
import { proposalsToolDefinitions } from "./sprint3/proposals.js";
import { handoffToolDefinitions } from "./sprint3/handoff.js";
import { agreementsToolDefinitions } from "./sprint3/agreements.js";
import { explainToolDefinitions } from "./sprint3/explain.js";
import { media_v3ToolDefinitions } from "./sprint3/media-v3.js";
import { sprint2CrmToolDefinitions } from "./sprint2/crm.js";
import { sprint2CommitmentToolDefinitions } from "./sprint2/commitments.js";
import { sprint2LeadToolDefinitions } from "./sprint2/leads.js";
import { sprint2ConversationToolDefinitions } from "./sprint2/conversations.js";
import { sprint2CalendarToolDefinitions } from "./sprint2/calendar.js";
import { sprint2MemoryToolDefinitions } from "./sprint2/memory.js";
import { sprint2WebchatToolDefinitions } from "./sprint2/webchat.js";
import { sprint2ReviewPhoneSyncToolDefinitions } from "./sprint2/review-phone-sync.js";

/** Assignment, business-context and media operations use the authenticated server API. */
const baseDefinitions = [
  {
    "name": "get_assignment",
    "description": "Read the assignment acceptance criteria, expected deliverable, budget and context for the current task.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "goalId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "example": {}
  },
  {
    "name": "submit_deliverable_for_review",
    "description": "Submit one exact deliverable version for human review. For a work_product, targetVersion must equal its updatedAt ISO timestamp from GET work products. This cannot accept or resolve a review.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "targetKind": {
          "type": "string",
          "enum": [
            "work_product",
            "company_file_version",
            "document_revision"
          ]
        },
        "targetId": {
          "type": "string",
          "format": "uuid"
        },
        "targetVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 255
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 20000
        }
      },
      "required": [
        "targetKind",
        "targetId",
        "targetVersion",
        "summary"
      ],
      "additionalProperties": false
    },
    "example": {
      "targetKind": "work_product",
      "targetId": "00000000-0000-4000-8000-000000000001",
      "targetVersion": "2026-10-21T12:00:00.000Z",
      "summary": "Ready for review"
    }
  },
  {
    "name": "context_search",
    "description": "Search current business context available to this authenticated task and project.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "includeExpired": {
          "type": "boolean"
        },
        "query": {
          "type": "string",
          "maxLength": 200
        },
        "roles": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "offer",
              "brand",
              "procedure",
              "customer",
              "other"
            ]
          },
          "maxItems": 5
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "example": {}
  },
  {
    "name": "context_get",
    "description": "Read an available business context file and record its use by the current task.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "includeExpired": {
          "type": "boolean"
        },
        "fileId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "fileId"
      ],
      "additionalProperties": false
    },
    "example": {
      "fileId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "media_ingest",
    "description": "Create a media project from an existing same-company asset or company file.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "format": "uuid"
        },
        "companyFileId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [],
      "additionalProperties": false,
      "oneOf": [
        {
          "required": [
            "assetId"
          ]
        },
        {
          "required": [
            "companyFileId"
          ]
        }
      ]
    },
    "example": {
      "assetId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "media_transcribe",
    "description": "Queue a timestamped transcription using the company-configured speech provider. Poll media_get_job.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "required": [
        "projectId",
        "idempotencyKey"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001",
      "idempotencyKey": "transcribe-1"
    }
  },
  {
    "name": "media_detect_silences",
    "description": "Detect silence ranges in a media project using FFmpeg.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "thresholdDb": {
          "type": "number",
          "minimum": -90,
          "maximum": 0
        },
        "minDurationMs": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 60000
        }
      },
      "required": [
        "projectId"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "media_detect_fillers",
    "description": "Find filler words in the timestamped project transcript.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "words": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "minItems": 1,
          "maxItems": 100
        }
      },
      "required": [
        "projectId",
        "words"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001",
      "words": [
        "eh"
      ]
    }
  },
  {
    "name": "media_cut",
    "description": "Append ordered cut ranges to a media project. Ranges are data, never shell commands.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "ranges": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "start": {
                "type": "number",
                "minimum": 0
              },
              "end": {
                "type": "number",
                "exclusiveMinimum": 0
              }
            },
            "required": [
              "start",
              "end"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 200
        }
      },
      "required": [
        "projectId",
        "ranges"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001",
      "ranges": [
        {
          "start": 0,
          "end": 2
        }
      ]
    }
  },
  {
    "name": "media_subtitle",
    "description": "Append burned-in subtitles using the existing timestamped transcript.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "style": {
          "type": "object",
          "properties": {
            "font": {
              "type": "string",
              "maxLength": 100,
              "pattern": "^[A-Za-z0-9 _-]*$"
            },
            "size": {
              "type": "number",
              "exclusiveMinimum": 0,
              "maximum": 200
            },
            "color": {
              "type": "string",
              "pattern": "^#[0-9a-fA-F]{6}$"
            },
            "highlightColor": {
              "type": "string",
              "pattern": "^#[0-9a-fA-F]{6}$"
            },
            "position": {
              "type": "string",
              "enum": [
                "top",
                "center",
                "bottom"
              ]
            }
          },
          "required": [
            "size",
            "color",
            "position"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "projectId",
        "style"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001",
      "style": {
        "size": 32,
        "color": "#FFFFFF",
        "position": "bottom"
      }
    }
  },
  {
    "name": "media_export",
    "description": "Queue a media export in landscape or portrait aspect ratio. Retry with the same idempotency key.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "aspect": {
          "type": "string",
          "enum": [
            "9:16",
            "16:9"
          ]
        },
        "cropMode": {
          "type": "string",
          "enum": [
            "center"
          ]
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "primary": {
          "type": "boolean"
        }
      },
      "required": [
        "projectId",
        "aspect",
        "idempotencyKey"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001",
      "aspect": "9:16",
      "idempotencyKey": "render-1"
    }
  },
  {
    "name": "media_dub",
    "description": "Queue speech for supplied translated segments; the caller supplies the translation. Poll media_get_job.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "language": {
          "type": "string",
          "minLength": 2,
          "maxLength": 35
        },
        "voiceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9_-]+$"
        },
        "translatedSegments": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "start": {
                "type": "number",
                "minimum": 0
              },
              "end": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "text": {
                "type": "string",
                "minLength": 1,
                "maxLength": 5000
              }
            },
            "required": [
              "start",
              "end",
              "text"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 200
        }
      },
      "required": [
        "projectId",
        "idempotencyKey",
        "language",
        "voiceId",
        "translatedSegments"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001",
      "idempotencyKey": "dub-1",
      "language": "es",
      "voiceId": "voice",
      "translatedSegments": [
        {
          "start": 0,
          "end": 2,
          "text": "Hola"
        }
      ]
    }
  },
  {
    "name": "media_get_project",
    "description": "Read a media project, its transcript, operations and durable job states.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "projectId"
      ],
      "additionalProperties": false
    },
    "example": {
      "projectId": "00000000-0000-4000-8000-000000000001"
    }
  },
  {
    "name": "media_get_job",
    "description": "Read the observed status and result of a media job.",
    "effect": "read",
    "inputSchema": {
      "type": "object",
      "properties": {
        "jobId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "jobId"
      ],
      "additionalProperties": false
    },
    "example": {
      "jobId": "00000000-0000-4000-8000-000000000001"
    }
  }
] as const;

/** Sprint 3 tools are appended here so every catalog consumer sees them through the same path. */
const definitions = [
  ...baseDefinitions,
  ...playbooksToolDefinitions,
  ...leadsToolDefinitions,
  ...autonomyToolDefinitions,
  ...commercial_decisionsToolDefinitions,
  ...commitmentsToolDefinitions,
  ...proposalsToolDefinitions,
  ...handoffToolDefinitions,
  ...agreementsToolDefinitions,
  ...explainToolDefinitions,
  ...media_v3ToolDefinitions,
  // Sprint 2 CRM, conversation, calendar, memory and web chat tools (27).
  ...sprint2CrmToolDefinitions,
  ...sprint2CommitmentToolDefinitions,
  ...sprint2LeadToolDefinitions,
  ...sprint2ConversationToolDefinitions,
  ...sprint2CalendarToolDefinitions,
  ...sprint2MemoryToolDefinitions,
  ...sprint2WebchatToolDefinitions,
  ...sprint2ReviewPhoneSyncToolDefinitions,
] as const;

export type AssignmentContextMediaOperationId = typeof definitions[number]['name'];
export const assignmentContextMediaActions = definitions.map((tool, index) => {
  const modes = tool.effect === 'read' ? ['standard', 'ask', 'planning', 'skill_test'] as const : ['standard', 'skill_test'] as const;
  const title = tool.name.replaceAll('_', ' ');
  return {
    id: tool.name,
    canonical: { operationId: tool.name, surfaces: ['live'] as const, placement: 'optional_agent_tool' as const, optionalGroup: 'discovery' as const, requiredClaims: [] as const, taskModes: modes, sideEffectClass: tool.effect, idempotency: 'none' as const, disabledByDefault: false, realBindingStatus: 'live_codex' as const, realServiceBinding: 'PaperclipRunnerToolAuthority', prpEvidence: 'Authenticated company-scoped API and persisted assignment, context-read or media-job result.', prpBindingStatus: 'bound' as const, legacyAliases: [] as const },
    documentation: { title, description: tool.description, note: null },
    examples: { call: { operationId: tool.name, input: tool.example }, success: { ok: true, operationId: tool.name, result: {} } },
    live: { order: 200 + index, descriptor: { schema: 'paperclip.semantic-tool.v1' as const, operationId: tool.name, version: 1 as const, title, description: tool.description, effect: tool.effect, requiredClaims: [] as const, allowedModes: modes, inputSchema: tool.inputSchema, outputSchema: { type: 'object' as const, additionalProperties: true }, exposure: 'optional' as const } },
    scenario: null,
  };
});

const SPRINT3_NAMESPACES: Array<[prefix: string, namespace: string]> = [
  ["context_", "business_context"], ["media_", "media_studio"], ["playbook_", "playbooks"], ["lead_", "leads"],
  ["autonomy_", "autonomy"], ["decision_", "commercial_decisions"], ["commitments_", "commitments"], ["commercial_", "commercial_triggers"],
  ["proposal_", "proposals"], ["handoff_", "handoff"], ["agreement_", "agreements"], ["upsell_", "agreements"], ["explain_", "explain"],
  ["crm_", "crm"], ["commitment_", "commitments"], ["conversation_", "conversations"], ["message_", "conversations"],
  ["webchat_", "conversations"], ["calendar_", "calendar"], ["customer_memory_", "customer_memory"],
  ["review_", "external_reviews"], ["call_", "crm_phone"],
];
function sprint3Namespace(name: string): string {
  for (const [prefix, namespace] of SPRINT3_NAMESPACES) if (name.startsWith(prefix)) return namespace;
  return "assignments";
}
export const assignmentContextMediaNamespaces = Object.freeze(Object.fromEntries(definitions.map(tool => [tool.name, sprint3Namespace(tool.name)])) as Record<AssignmentContextMediaOperationId, string>);
