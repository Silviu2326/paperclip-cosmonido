import { z } from "zod";
import { badRequest } from "../errors.js";

/** Sprint 3 WP1 agent tools. Keep names in `PRODUCT_TOOL_NAMES` and the dispatcher in sync. */
export const PLAYBOOK_TOOL_NAMES: string[] = ["playbook_start", "playbook_get_run", "playbook_advance"];

const subjectKinds = ["lead", "opportunity", "conversation", "customer"] as const;
const outcomes = ["done", "skipped", "failed"] as const;

const startArgsSchema = z.object({
  playbookId: z.string().uuid(),
  subjectKind: z.enum(subjectKinds),
  subjectId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(255),
});
const getRunArgsSchema = z.object({ runId: z.string().uuid() });
const advanceArgsSchema = z.object({
  runId: z.string().uuid(),
  expectedStepIndex: z.number().int().min(0),
  outcome: z.enum(outcomes).default("done"),
  note: z.string().trim().max(5_000).optional(),
});

const definitions = [
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
] as const;

/** Tool definitions for the agent runtime. `workMode` is accepted for parity with the other tool wrappers; playbook tools are available in every mode. */
export function playbookToolDefinitions(_workMode: string) {
  return definitions.map((tool) => ({ ...tool, inputSchema: tool.inputSchema as Record<string, unknown> }));
}

/** Tool execution goes through the authenticated REST routes so company scope, permissions and activity logging apply. */
export async function callPlaybookTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  agentId: string;
}) {
  const apiBase = `${input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
  const parse = <T extends z.ZodTypeAny>(schema: T) => {
    const parsed = schema.safeParse(input.arguments);
    if (!parsed.success) throw badRequest("Invalid playbook tool arguments", parsed.error.issues);
    return parsed.data as z.infer<T>;
  };
  switch (input.name) {
    case "playbook_start": {
      const args = parse(startArgsSchema);
      return request(`${apiBase}/companies/${input.companyId}/playbook-runs`, input.token, "POST", { ...args, agentId: input.agentId });
    }
    case "playbook_get_run": {
      const args = parse(getRunArgsSchema);
      return request(`${apiBase}/playbook-runs/${args.runId}`, input.token);
    }
    case "playbook_advance": {
      const args = parse(advanceArgsSchema);
      return request(`${apiBase}/playbook-runs/${args.runId}/advance`, input.token, "POST", {
        expectedStepIndex: args.expectedStepIndex,
        outcome: args.outcome,
        ...(args.note ? { note: args.note } : {}),
      });
    }
    default:
      throw badRequest("Unknown playbook tool");
  }
}

async function request(url: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Playbook tool failed (${response.status})`);
  return result;
}
