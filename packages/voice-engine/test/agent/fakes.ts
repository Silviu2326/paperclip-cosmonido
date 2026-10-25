import type { AgentAudioFrame, AgentTransport } from "../../src/agent/types.js";
import type { LlmEngine, LlmStreamEvent } from "../../src/llm/types.js";
import type { SttEngine, SttStream, SttStreamEvent } from "../../src/stt/types.js";
import type { VoiceEngine } from "../../src/core/types.js";

/** Hand-written event stream used by agent tests. */
export function eventStream<T>(items: T[]): AsyncIterable<T> { return { async *[Symbol.asyncIterator]() { yield* items; } }; }
/** Make a fake STT stream with captured audio sends. */
export function fakeStt(events: SttStreamEvent[]): { engine: SttEngine; sent: Uint8Array[] } {
  const sent: Uint8Array[] = []; const stream: SttStream = { send: b => sent.push(b), finalize() {}, async close() {}, events: eventStream(events) };
  const engine = { openStream: async () => stream } as unknown as SttEngine; return { engine, sent };
}
/** Make an LLM fake that yields a chosen sequence of stream events. */
export function fakeLlm(events: LlmStreamEvent[]): LlmEngine { return { stream: () => eventStream(events) } as unknown as LlmEngine; }
/** Make a TTS fake returning recognizable PCM frames. */
export function fakeTts(): VoiceEngine { return { synthesize: async () => ({ audio: { data: new Uint8Array([0, 0, 0, 0]), mimeType: "audio/pcm", format: { container: "pcm", sampleRate: 24000, bitDepth: 16 }, durationMs: 1 } }), synthesizeStream: async function* () {} } as unknown as VoiceEngine; }
/** Type helper for creating fake inbound frames. */
export function pcmFrame(data = new Uint8Array(320)): AgentAudioFrame { return { data, encoding: "pcm16", sampleRate: 16000, channels: 1 }; }
/** Narrow transport helper for an already-created memory transport. */
export type TestTransport = AgentTransport & { pushFrame(f: AgentAudioFrame): void; end(): void };
