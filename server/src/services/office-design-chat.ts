import { and, eq } from "drizzle-orm";
import { aiProviderDefaults, connectionGrants, toolConnections, type Db } from "@paperclipai/db";
import {
  aiConnectionMetadataSchema,
  applyOfficePatch,
  officeObjectId,
  officePatchOpSchema,
  type OfficeDesignChatInput,
  type OfficeDesignChatResponse,
  type OfficeLayout,
  type OfficePatch,
  type OfficePatchOp,
} from "@paperclipai/shared";
import { conflict, HttpError } from "../errors.js";
import { aiConnectionService } from "./ai-connections.js";
import { OFFICE_SERVER_CATALOG } from "./office-layouts.js";

export const OFFICE_DESIGN_TOOL = "apply_office_patch";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DESIGN_MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REPLY_CHARS = 1000;

const NO_AI_CONNECTION = "no_ai_connection";

function noAiConnection() {
  return conflict(NO_AI_CONNECTION, { code: NO_AI_CONNECTION });
}

/**
 * Resolves the caller's own Anthropic default connection (the account selected per provider in
 * ai_provider_defaults) and decrypts its API key through the AI connection service. The key stays
 * in this function's scope and in the outgoing request header; it is never logged or returned.
 */
async function resolveAnthropicApiKey(db: Db, companyId: string, userId: string): Promise<string> {
  const connections = aiConnectionService(db);
  const [defaultRow] = await db
    .select({ grantId: aiProviderDefaults.grantId })
    .from(aiProviderDefaults)
    .where(and(
      eq(aiProviderDefaults.companyId, companyId),
      eq(aiProviderDefaults.userId, userId),
      eq(aiProviderDefaults.provider, "anthropic"),
    ))
    .limit(1);
  if (!defaultRow?.grantId) throw noAiConnection();
  if (!(await connections.membership(companyId, userId))) throw noAiConnection();

  const [row] = await db
    .select({ connection: toolConnections, grant: connectionGrants })
    .from(toolConnections)
    .innerJoin(connectionGrants, and(
      eq(connectionGrants.connectionId, toolConnections.id),
      eq(connectionGrants.companyId, toolConnections.companyId),
    ))
    .where(and(
      eq(toolConnections.companyId, companyId),
      eq(toolConnections.connectionPurpose, "ai"),
      eq(connectionGrants.id, defaultRow.grantId),
    ))
    .limit(1);
  if (!row) throw noAiConnection();
  if (
    row.grant.status !== "active" ||
    !row.connection.enabled ||
    row.connection.status !== "active" ||
    row.connection.healthStatus !== "ok"
  ) throw noAiConnection();

  const metadata = aiConnectionMetadataSchema.safeParse(row.connection.config.ai);
  if (!metadata.success || metadata.data.method !== "api_key" || metadata.data.provider !== "anthropic") {
    throw noAiConnection();
  }
  try {
    return await connections.credential(row, 0, {
      responsibleUserId: userId,
      actorType: "user",
      actorId: userId,
    });
  } catch {
    // Failures here can carry provider or secret detail; expose only the stable code.
    throw noAiConnection();
  }
}

const kinds = Object.keys(OFFICE_SERVER_CATALOG.objects);
const floors = Object.keys(OFFICE_SERVER_CATALOG.floors);
const walls = Object.keys(OFFICE_SERVER_CATALOG.walls);
const uuidSchema = { type: "string", format: "uuid" };
const tileSchema = { type: "integer", minimum: 0 };
const idSchema = { type: "string", minLength: 1, maxLength: 40 };

/** JSON-schema equivalent of officePatchSchema, plus the reply text. */
export const OFFICE_DESIGN_TOOL_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", maxLength: MAX_REPLY_CHARS, description: "Short confirmation for the user, in the user's language." },
    patch: {
      type: "array",
      maxItems: 50,
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              op: { const: "add" }, kind: { type: "string", enum: kinds }, x: tileSchema, y: tileSchema,
              id: idSchema, agentId: uuidSchema, label: { type: "string", maxLength: 40 },
            },
            required: ["op", "kind", "x", "y"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { op: { const: "move" }, id: idSchema, x: tileSchema, y: tileSchema },
            required: ["op", "id", "x", "y"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { op: { const: "remove" }, id: idSchema },
            required: ["op", "id"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { op: { const: "assign" }, id: idSchema, agentId: { anyOf: [uuidSchema, { type: "null" }] } },
            required: ["op", "id", "agentId"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { op: { const: "theme" }, floor: { type: "string", enum: floors }, wall: { type: "string", enum: walls } },
            required: ["op"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { const: "resize" },
              cols: { type: "integer", minimum: 8, maximum: 40 },
              rows: { type: "integer", minimum: 6, maximum: 30 },
            },
            required: ["op", "cols", "rows"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["reply", "patch"],
  additionalProperties: false,
} as const;

function catalogDescription(): string {
  return Object.entries(OFFICE_SERVER_CATALOG.objects).map(([kind, object]) => {
    const seat = object.seat ? `, seat at (+${object.seat.dx},+${object.seat.dy}) facing ${object.seat.facing}` : "";
    return `- ${kind}: ${object.footprint.w}x${object.footprint.h} tiles${object.walkable ? ", walkable" : ""}${seat}`;
  }).join("\n");
}

export function officeDesignSystemPrompt(layout: OfficeLayout): string {
  return [
    "You arrange a small pixel-art office for a team of AI agents. The user asks for changes in chat.",
    "Answer only by calling the apply_office_patch tool exactly once, with a short reply and the patch.",
    "",
    "Object kinds available (use only these):",
    catalogDescription(),
    `Floors: ${floors.join(", ")}. Walls: ${walls.join(", ")}.`,
    "",
    "Rules:",
    `- The grid is ${layout.cols} columns (x from 0) by ${layout.rows} rows (y from 0). Row 0 is the wall; furniture starts at row 1.`,
    "- An object is anchored at its bottom-left tile (x, y) and extends to the right (x + w - 1) and upwards (y - h + 1 .. y).",
    "- Objects must stay inside the grid and must not overlap each other.",
    "- Move, remove and assign only the ids present in the current layout. New objects may omit id.",
    "- A seat can be given to an agent with assign; one seat per agent. Use agentId null to unassign.",
    "- Only use agent ids that appear in the current layout. Never invent agent ids.",
    "- Keep the patch minimal: only what the user asked for.",
    "",
    "Current layout (JSON):",
    JSON.stringify(layout),
  ].join("\n");
}

function toMessages(message: string, history: OfficeDesignChatInput["history"]) {
  const trimmed = history
    .map((entry) => ({ role: entry.role, content: entry.content.trim() }))
    .filter((entry) => entry.content.length > 0);
  // The Messages API expects the conversation to open with a user turn.
  while (trimmed.length > 0 && trimmed[0]!.role !== "user") trimmed.shift();
  return [...trimmed, { role: "user" as const, content: message }];
}

/** Keeps only the operations that the schema and the current layout accept, in order. */
export function acceptOfficeOps(layout: OfficeLayout, rawPatch: unknown): OfficePatch {
  if (!Array.isArray(rawPatch)) return [];
  let current = layout;
  const accepted: OfficePatchOp[] = [];
  for (const raw of rawPatch) {
    const parsed = officePatchOpSchema.safeParse(raw);
    if (!parsed.success) continue;
    // Assign new objects their id here so the returned patch replays identically on the client.
    const op: OfficePatchOp = parsed.data.op === "add" && !parsed.data.id
      ? { ...parsed.data, id: officeObjectId() }
      : parsed.data;
    const result = applyOfficePatch(current, [op], OFFICE_SERVER_CATALOG);
    if (result.rejected.length > 0) continue;
    current = result.layout;
    accepted.push(op);
  }
  return accepted;
}

type MessagesPayload = { content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }> } | null;
type ToolChoice = { type: "tool"; name: string } | { type: "auto" };

async function callMessages(apiKey: string, body: OfficeDesignChatInput, toolChoice: ToolChoice): Promise<Response> {
  try {
    // Global fetch is looked up per call so tests can replace it.
    return await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DESIGN_MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        system: officeDesignSystemPrompt(body.layout),
        messages: toMessages(body.message, body.history),
        tools: [{
          name: OFFICE_DESIGN_TOOL,
          description: "Apply a patch to the office layout and reply to the user. Always call this tool; use an empty patch when nothing should change.",
          input_schema: OFFICE_DESIGN_TOOL_SCHEMA,
        }],
        tool_choice: toolChoice,
      }),
    });
  } catch {
    throw new HttpError(502, "The AI provider could not be reached. Try again.", { code: "office_design_unavailable" });
  }
}

/**
 * Calls the Messages API with a resolved key and returns the accepted reply and patch.
 * Forced tool choice is preferred; models that reject it (HTTP 400) are retried with
 * automatic tool choice, where a text-only answer becomes a reply with no changes.
 */
export async function requestOfficeDesign(apiKey: string, body: OfficeDesignChatInput): Promise<OfficeDesignChatResponse> {
  let response = await callMessages(apiKey, body, { type: "tool", name: OFFICE_DESIGN_TOOL });
  let forced = true;
  if (response.status === 400) {
    await response.body?.cancel();
    response = await callMessages(apiKey, body, { type: "auto" });
    forced = false;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(502, "The AI provider could not design the office. Try again.", {
      code: "office_design_unavailable",
      providerStatus: response.status,
    });
  }

  const payload = (await response.json().catch(() => null)) as MessagesPayload;
  const toolUse = payload?.content?.find((block) => block.type === "tool_use" && block.name === OFFICE_DESIGN_TOOL);
  const toolInput = toolUse?.input && typeof toolUse.input === "object"
    ? toolUse.input as Record<string, unknown>
    : null;
  if (!toolInput) {
    const text = payload?.content?.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").trim();
    if (!forced && text) return { reply: text.slice(0, MAX_REPLY_CHARS), patch: [] };
    throw new HttpError(502, "The AI provider did not return an office patch.", { code: "office_design_no_patch" });
  }

  const reply = typeof toolInput.reply === "string" ? toolInput.reply.slice(0, MAX_REPLY_CHARS) : "";
  return { reply, patch: acceptOfficeOps(body.layout, toolInput.patch) };
}

export async function designOfficeChat(
  db: Db,
  input: { companyId: string; userId: string; body: OfficeDesignChatInput },
): Promise<OfficeDesignChatResponse> {
  const apiKey = await resolveAnthropicApiKey(db, input.companyId, input.userId);
  return requestOfficeDesign(apiKey, input.body);
}
