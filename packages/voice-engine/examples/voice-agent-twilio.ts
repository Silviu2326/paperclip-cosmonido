import { createVoiceAgent } from "../src/agent/pipeline.js";
import type { AgentTransport, AgentAudioFrame } from "../src/agent/types.js";
import { createVoiceEngine } from "../src/core/engine.js";
import { createSttEngine, allSttProviders } from "../src/stt/index.js";
import { createLlmEngine, allLlmProviders } from "../src/llm/index.js";

// Replace this placeholder with your authenticated WSS server socket adapter.
declare const twilioSocket: { onMessage(handler: (json: string) => void): void; send(json: string): void; close(): void };
const inbound: AsyncIterable<AgentAudioFrame> = { async *[Symbol.asyncIterator]() { for await (const json of messageQueue(twilioSocket)) { const message = JSON.parse(json); if (message.event === "media") yield { data: new Uint8Array(Buffer.from(message.media.payload, "base64")), encoding: "mulaw", sampleRate: 8000, channels: 1 }; } } };
const transport: AgentTransport = { inputFormat: { encoding: "mulaw", sampleRate: 8000 }, outputFormat: { encoding: "mulaw", sampleRate: 8000 }, inbound, sendAudio(frame) { twilioSocket.send(JSON.stringify({ event: "media", streamSid: process.env.STREAM_SID, media: { payload: Buffer.from(frame.data).toString("base64") } })); }, clearPlayback() { twilioSocket.send(JSON.stringify({ event: "clear", streamSid: process.env.STREAM_SID })); }, async close() { twilioSocket.close(); } };
const agent = createVoiceAgent({ stt: createSttEngine({ providers: allSttProviders }), llm: createLlmEngine({ providers: allLlmProviders }), tts: createVoiceEngine(), transport }, { stt: { provider: "deepgram" }, llm: { system: "Be concise." }, tts: { voice: "elevenlabs:VOICE_ID" }, turn: { silenceEndpointMs: 450, bargeIn: true, bargeInMinSpeechMs: 300, firstChunkFlushMs: 350, minClauseWords: 6 } });
await agent.run();
function messageQueue(socket: typeof twilioSocket): AsyncIterable<string> { return { async *[Symbol.asyncIterator]() { const queue: string[] = []; let wake: (() => void) | undefined; socket.onMessage(value => { queue.push(value); wake?.(); }); while (true) { if (queue.length) yield queue.shift()!; else await new Promise<void>(resolve => { wake = resolve; }); } } }; }
