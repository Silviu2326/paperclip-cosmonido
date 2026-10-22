import type { Sprint3ToolDefinition } from "./types.js";

const subjectKinds = ["lead", "opportunity", "conversation", "customer"] as const;
const outcomes = ["done", "skipped", "failed"] as const;

/** Sprint 3 WP1 agent tools. Keep names in the `PRODUCT_TOOL_NAMES` list and the server dispatcher in sync. */
export const playbooksToolDefinitions = [
  {
    name: "playbook_start",
    description: "Start a commercial playbook for one lead, opportunity, conversation or customer. The first step is dispatched immediately. Read the current step with playbook_get_run. Starting the same idempotencyKey twice returns the same run.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["playbookId", "subjectKind", "subjectId", "idempotencyKey"],
      properties: {
        playbookId: { type: "string", format: "uuid", description: "Playbook id. An active version is used; if an inactive id is given, the active version with the same key is used." },
        subjectKind: { type: "string", enum: [...subjectKinds] },
        subjectId: { type: "string", minLength: 1, maxLength: 200 },
        idempotencyKey: { type: "string", minLength: 1, maxLength: 255 },
      },
    },
    example: { playbookId: "00000000-0000-4000-8000-000000000001", subjectKind: "lead", subjectId: "lead-123", idempotencyKey: "inbound-lead-123" },
  },
  {
    name: "playbook_get_run",
    description: "Read a playbook run: its status, the pinned playbook version, the steps and the index of the current step. Only the step at currentStepIndex may be acted on.",
    effect: "read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["runId"],
      properties: { runId: { type: "string", format: "uuid" } },
    },
    example: { runId: "00000000-0000-4000-8000-000000000002" },
  },
  {
    name: "playbook_advance",
    description: "Report the outcome of the CURRENT step of a playbook run and move it to the next step. You may only advance the current step; you cannot skip or reorder steps. Send expectedStepIndex with the index you read from playbook_get_run. A stale index is rejected with 409, so retry after reading the run again.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["runId", "expectedStepIndex"],
      properties: {
        runId: { type: "string", format: "uuid" },
        expectedStepIndex: { type: "integer", minimum: 0 },
        outcome: { type: "string", enum: [...outcomes], default: "done", description: "done or skipped move on; failed ends the run." },
        note: { type: "string", maxLength: 5000 },
      },
    },
    example: { runId: "00000000-0000-4000-8000-000000000002", expectedStepIndex: 0, outcome: "done", note: "Sent the qualifying question." },
  },
] as const satisfies readonly Sprint3ToolDefinition[];
