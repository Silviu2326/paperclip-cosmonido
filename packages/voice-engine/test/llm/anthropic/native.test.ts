import { describe, expect, it } from "vitest";
import { createAnthropicLlmProvider } from "../../../src/llm/providers/anthropic/index.js";

describe("Anthropic native adapter", () => {
  it("maps system, tools, tool results, cache markers and defaults", async () => {
    let sent: any;
    const p = createAnthropicLlmProvider({ credentials: { apiKey: "k" }, fetch: (async (_u: any, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ id: "m1", model: sent.model, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } }), { status: 200 }); }) as typeof fetch });
    const r = await p.complete({ system: "rules", messages: [{ role: "user", content: "go", cache: true }, { role: "assistant", content: [{ type: "tool_call", id: "c1", name: "f", arguments: { x: 1 } }] }, { role: "tool", content: [{ type: "tool_result", toolCallId: "c1", content: "done" }] }], tools: [{ name: "f", description: "f", inputSchema: { type: "object" } }] });
    expect(sent.max_tokens).toBe(1024); expect(sent.system[0].text).toBe("rules"); expect(sent.tools[0].input_schema.type).toBe("object"); expect(sent.messages[2].content[0].type).toBe("tool_result"); expect(sent.messages[0].content[0].cache_control.type).toBe("ephemeral"); expect(r.usage.cachedInputTokens).toBe(2); expect(r.usage.cacheWriteTokens).toBe(3);
  });
  it("maps native API errors", async () => {
    const p = createAnthropicLlmProvider({ credentials: { apiKey: "k" }, fetch: (async () => new Response(JSON.stringify({ error: { type: "overloaded_error", message: "busy" } }), { status: 529 })) as typeof fetch });
    await expect(p.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
  });
});
