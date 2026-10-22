import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfficeLayout } from "@paperclipai/shared";
import { OFFICE_DESIGN_TOOL, requestOfficeDesign, acceptOfficeOps } from "../services/office-design-chat.js";

const AGENT = "11111111-1111-4111-8111-111111111111";
const layout: OfficeLayout = {
  version: 1,
  cols: 12,
  rows: 8,
  floor: "wood",
  wall: "plaster",
  objects: [{ id: "desk_a", kind: "desk", x: 2, y: 4, agentId: AGENT }],
};
const body = { message: "pon una planta junto a la mesa", layout, history: [{ role: "assistant" as const, content: "Hola" }] };
const KEY = "sk-ant-test-secret-key-value";

function anthropicResponse(content: unknown[], status = 200) {
  return new Response(JSON.stringify({ content }), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("office design chat (Anthropic tool use)", () => {
  it("sends a forced apply_office_patch tool call with the catalog, layout and schema", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse([{ type: "tool_use", id: "t1", name: OFFICE_DESIGN_TOOL, input: { reply: "ok", patch: [] } }]));
    vi.stubGlobal("fetch", fetchMock);

    await requestOfficeDesign(KEY, body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.redirect).toBe("error");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe("claude-haiku-5-5");
    expect(sent.max_tokens).toBe(1024);
    expect(sent.tool_choice).toEqual({ type: "tool", name: OFFICE_DESIGN_TOOL });
    expect(sent.tools[0].name).toBe(OFFICE_DESIGN_TOOL);
    expect(sent.tools[0].input_schema.required).toEqual(["reply", "patch"]);
    expect(sent.tools[0].input_schema.properties.patch.items.anyOf[0].properties.kind.enum).toContain("desk");
    expect(sent.system).toContain("apply_office_patch");
    expect(sent.system).toContain(JSON.stringify(layout));
    // A history that opens with an assistant turn is trimmed so the conversation starts with the user.
    expect(sent.messages).toEqual([{ role: "user", content: body.message }]);
  });

  it("returns the reply and only the operations the layout accepts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse([{
      type: "tool_use",
      id: "t1",
      name: OFFICE_DESIGN_TOOL,
      input: {
        reply: "He puesto una planta.",
        patch: [
          { op: "add", kind: "plant", x: 5, y: 2 },
          { op: "add", kind: "desk", x: 2, y: 4 },
          { op: "add", kind: "plant", x: 99, y: 1 },
          { op: "move", id: "desk_a", x: 3, y: 4 },
          { op: "teleport", id: "desk_a" },
          { op: "assign", id: "desk_a", agentId: null },
        ],
      },
    }])));

    const result = await requestOfficeDesign(KEY, body);

    expect(result.reply).toBe("He puesto una planta.");
    expect(result.patch.map(op => op.op)).toEqual(["add", "move", "assign"]);
    const add = result.patch[0];
    expect(add).toMatchObject({ op: "add", kind: "plant", x: 5, y: 2 });
    // New objects receive a server-side id so the client replays the same patch.
    expect(add && "id" in add && add.id).toMatch(/^o_[0-9a-f]{12}$/);
  });

  it("fails with a stable code when the model returns no tool call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse([{ type: "text", text: "Lo siento" }])));
    await expect(requestOfficeDesign(KEY, body)).rejects.toMatchObject({ status: 502, details: { code: "office_design_no_patch" } });
  });

  it("maps provider failures to 502 without echoing the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: 401 })));
    const error = await requestOfficeDesign(KEY, body).catch(caught => caught);
    expect(error).toMatchObject({ status: 502, details: { code: "office_design_unavailable", providerStatus: 401 } });
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect(String(error.message)).not.toContain(KEY);
  });

  it("maps network failures to 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(requestOfficeDesign(KEY, body)).rejects.toMatchObject({ status: 502, details: { code: "office_design_unavailable" } });
  });

  it("keeps accepted ops in order, assigning ids to new objects", () => {
    const accepted = acceptOfficeOps(layout, [
      { op: "add", kind: "coffee", x: 8, y: 6 },
      { op: "move", id: "desk_a", x: 2, y: 5 },
    ]);
    expect(accepted).toHaveLength(2);
    expect(accepted[0]).toMatchObject({ op: "add", kind: "coffee", x: 8, y: 6 });
    expect(accepted[1]).toEqual({ op: "move", id: "desk_a", x: 2, y: 5 });
  });
});
