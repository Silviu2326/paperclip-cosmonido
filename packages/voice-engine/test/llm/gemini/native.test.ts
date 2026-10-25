import { describe, expect, it } from "vitest";
import { convertGeminiSchema, createGeminiLlmProvider } from "../../../src/llm/providers/gemini/index.js";

describe("Gemini native adapter", () => {
  it("converts schema and maps native tool request/results", async () => {
    let sent: any;
    const p = createGeminiLlmProvider({ credentials: { apiKey: "k" }, fetch: (async (_u: any, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, cachedContentTokenCount: 2, thoughtsTokenCount: 3 } }), { status: 200 }); }) as typeof fetch });
    expect(convertGeminiSchema({ type: "object", properties: { a: { type: "string", minLength: 2 } }, additionalProperties: false }).properties.a.minLength).toBeUndefined();
    const r = await p.complete({ messages: [{ role: "user", content: "do" }, { role: "tool", content: [{ type: "tool_result", toolCallId: "id", content: "done" }] }], tools: [{ name: "f", description: "f", inputSchema: { type: "object", properties: { a: { type: "string" } }, additionalProperties: false } }] });
    expect(sent.contents[1].parts[0].functionResponse.id).toBe("id"); expect(sent.tools[0].functionDeclarations[0].parameters.additionalProperties).toBeUndefined(); expect(r.usage.cachedInputTokens).toBe(2); expect(r.usage.reasoningTokens).toBe(3);
  });
  it("maps quota errors", async () => {
    const p = createGeminiLlmProvider({ credentials: { apiKey: "k" }, fetch: (async () => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }), { status: 429 })) as typeof fetch });
    await expect(p.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ code: "rate_limit" });
  });
});
