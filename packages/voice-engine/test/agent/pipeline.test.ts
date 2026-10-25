import { describe, expect, it } from "vitest";
import { createVoiceAgent } from "../../src/agent/pipeline.js";
import { createMemoryTransport } from "../../src/agent/transports/memory.js";
import { eventStream, fakeLlm, fakeStt, fakeTts } from "./fakes.js";
import type { LlmResult } from "../../src/llm/types.js";
import type { AgentAudioFrame } from "../../src/agent/types.js";
const result: LlmResult = { message: { role: "assistant", content: "Hello there." }, text: "Hello there.", toolCalls: [], finishReason: "stop", usage: { provider: "openai", model: "fast", inputTokens: 1, outputTokens: 2, estimatedCents: null, pricingSource: "test" }, provider: "openai", model: "fast", latencyMs: 1 };
const config = { stt: {}, llm: { system: "system" }, tts: { voice: "x:y" }, turn: { silenceEndpointMs: 10, bargeIn: true, bargeInMinSpeechMs: 10, firstChunkFlushMs: 10, minClauseWords: 2 } } as const;
describe("voice agent pipeline", () => {
  it("runs injected turns, speaks chunks, and emits metrics", async () => { const transport = createMemoryTransport({ inputFormat: { encoding: "pcm16", sampleRate: 16000 }, outputFormat: { encoding: "pcm16", sampleRate: 24000 } }); const { engine: stt } = fakeStt([]); const llm = fakeLlm([{ type: "text_delta", text: "Hello there." }, { type: "done", result }]); const agent = createVoiceAgent({ stt, llm, tts: fakeTts(), transport }, config); await agent.injectUser("Hi"); expect(agent.history.map(x => x.role)).toEqual(["user", "assistant"]); expect(transport.sentFrames.length).toBeGreaterThan(0); expect(agent.state).toBe("listening"); });
  it("interrupts playback and truncates assistant history", async () => { const transport = createMemoryTransport({ inputFormat: { encoding: "pcm16", sampleRate: 16000 }, outputFormat: { encoding: "pcm16", sampleRate: 24000 } }); const { engine: stt } = fakeStt([]); const agent = createVoiceAgent({ stt, llm: fakeLlm([{ type: "text_delta", text: "Hello there." }, { type: "done", result }]), tts: fakeTts(), transport }, config); await agent.injectUser("Hi"); agent.interrupt(); expect(transport.cleared).toBe(1); expect(agent.history.at(-1)?.role).toBe("assistant"); });
});
