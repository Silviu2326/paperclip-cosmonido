import { createVoiceAgent } from "../src/agent/pipeline.js";
import { createMemoryTransport } from "../src/agent/transports/memory.js";
import { createVoiceEngine } from "../src/core/engine.js";
import { createSttEngine, allSttProviders } from "../src/stt/index.js";
import { createLlmEngine, allLlmProviders } from "../src/llm/index.js";
import { readFile } from "node:fs/promises";

const audio = new Uint8Array(await readFile(process.argv[2] ?? "caller.wav"));
const transport = createMemoryTransport({ inputFormat: { encoding: "pcm16", sampleRate: 16000 }, outputFormat: { encoding: "pcm16", sampleRate: 16000 } });
transport.pushFrame({ data: audio.subarray(process.argv[2]?.toLowerCase().endsWith(".wav") ? 44 : 0), encoding: "pcm16", sampleRate: 16000, channels: 1 });
transport.end();
const agent = createVoiceAgent({ stt: createSttEngine({ providers: allSttProviders }), llm: createLlmEngine({ providers: allLlmProviders }), tts: createVoiceEngine(), transport }, {
  stt: {}, llm: { system: "Be a concise helpful assistant." }, tts: { voice: "openai:coral" },
  turn: { silenceEndpointMs: 500, bargeIn: true, bargeInMinSpeechMs: 300, firstChunkFlushMs: 400, minClauseWords: 6 },
});
const metrics = (async () => { for await (const event of agent.events) if (event.type === "metrics") console.log(event.metrics); })();
await agent.run(); await metrics;
