import { describe, expect, it } from "vitest";
import { createOpenAiRealtimeProvider } from "../../src/realtime/providers/openai/index.js";
import { createGeminiLiveProvider } from "../../src/realtime/providers/gemini/index.js";
import { FakeWebSocket } from "./fake-websocket.js";

const config = { instructions: "Be concise", inputFormat: { encoding: "pcm16" as const, sampleRate: 24000 }, outputFormat: { encoding: "pcm16" as const, sampleRate: 24000 }, inputTranscription: true, tools: [{ name: "lookup", description: "Lookup", inputSchema: { type: "object" } }] };
describe("realtime websocket providers", () => {
  it("sends OpenAI session and maps audio/transcripts/tools; interrupt truncates", async () => {
    const ws = new FakeWebSocket(); const provider = createOpenAiRealtimeProvider({ credentials: { apiKey: "k" }, fetch, webSocket: () => ws });
    const pending = provider.connect(config); ws.open(); const session = await pending;
    const sessionUpdate = JSON.parse(ws.sent[0]); expect(sessionUpdate.type).toBe("session.update"); expect(sessionUpdate.session.instructions).toBe("Be concise");
    session.sendAudio(Uint8Array.of(1, 2)); expect(JSON.parse(ws.sent[1]).audio).toBe("AQI=");
    session.interrupt({ playedMs: 42 }); expect(ws.sent.map(JSON.parse).some((x: any) => x.type === "conversation.item.truncate" && x.audio_end_ms === 42)).toBe(true);
    ws.message({ type: "response.function_call_arguments.done", call_id: "c", name: "lookup", arguments: "{\"q\":1}" });
    ws.message({ type: "conversation.item.input_audio_transcription.completed", transcript: "hello" });
    const it = session.events[Symbol.asyncIterator](); await it.next(); const tool = await it.next(); expect(tool.value?.type).toBe("tool_call");
    const transcript = await it.next(); expect(transcript.value).toMatchObject({ type: "user_transcript", text: "hello" }); await session.close();
  });
  it("sends Gemini setup, audio and returns tool responses", async () => {
    const ws = new FakeWebSocket(); const provider = createGeminiLiveProvider({ credentials: { apiKey: "k" }, fetch, webSocket: () => ws });
    const pending = provider.connect({ ...config, inputFormat: { encoding: "pcm16", sampleRate: 16000 }, outputFormat: { encoding: "pcm16", sampleRate: 24000 } }); ws.open();
    const setup = JSON.parse(ws.sent[0]).setup; expect(setup.model).toContain("models/"); ws.message({ setupComplete: {} }); const session = await pending;
    session.sendAudio(Uint8Array.of(3)); expect(JSON.parse(ws.sent[1]).realtimeInput.audio).toMatchObject({ data: "Aw==", mimeType: "audio/pcm;rate=16000" });
    ws.message({ toolCall: { functionCalls: [{ id: "f", name: "lookup", args: { q: 2 } }] } }); const it = session.events[Symbol.asyncIterator](); await it.next(); const tool = await it.next(); expect(tool.value?.type).toBe("tool_call"); session.sendToolResult("f", "ok"); expect(JSON.parse(ws.sent[2]).toolResponse.functionResponses[0].id).toBe("f"); await session.close();
  });
  it("rejects unsupported native rates and maps handshake close", async () => {
    const ws = new FakeWebSocket(); const provider = createOpenAiRealtimeProvider({ credentials: { apiKey: "k" }, fetch, webSocket: () => ws });
    const pending = provider.connect(config); ws.close(1008, "unauthorized"); await expect(pending).rejects.toMatchObject({ code: "auth", status: 401 });
    const gemini = createGeminiLiveProvider({ credentials: { apiKey: "k" }, fetch, webSocket: () => new FakeWebSocket() });
    await expect(gemini.connect(config)).rejects.toMatchObject({ code: "unsupported" });
  });
});
