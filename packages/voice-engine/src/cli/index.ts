import { resolve } from "node:path";
import type { VoiceEngineOptions } from "../core/types.js";
import { flag, option, parseArgs, repeated, UsageError, validateOptions, type ParsedArgs } from "./args.js";
import { output, write, type CliContext, type CliIO } from "./context.js";
import { queryFlags, settingsFlags } from "./inputs.js";
import { errorDetails, errorText } from "./errors.js";
import * as providers from "./commands/providers.js";
import * as models from "./commands/models.js";
import * as voices from "./commands/voices.js";
import * as voice from "./commands/voice.js";
import * as recommend from "./commands/recommend.js";
import * as speak from "./commands/speak.js";
import * as batch from "./commands/batch.js";
import * as clone from "./commands/clone.js";
import * as design from "./commands/design.js";
import * as sts from "./commands/sts.js";
import * as deleteVoice from "./commands/delete-voice.js";
import * as estimate from "./commands/estimate.js";
import * as doctor from "./commands/doctor.js";
import * as languages from "./commands/languages.js";
import * as stt from "./commands/stt.js";
import * as llm from "./commands/llm.js";
import { createSttRuntime, createLlmRuntime, allRealtimeProviders } from "./runtime.js";
import { createVoiceAgent } from "../agent/pipeline.js";
import { createMemoryTransport } from "../agent/transports/memory.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

export type { CliIO } from "./context.js";
interface Command { help: string; run(ctx: CliContext, args: ParsedArgs): Promise<void | number> }
const commands: Record<string, Command> = { providers, models, voices, voice, recommend, speak, batch, clone, design, sts, "delete-voice": deleteVoice, estimate, doctor, languages,
  "stt-providers": { help: stt.providersHelp, run: stt.listProviders }, "stt-models": { help: stt.modelsHelp, run: stt.listModels }, transcribe: { help: stt.transcribeHelp, run: stt.transcribe }, "stt-stream": { help: stt.streamHelp, run: stt.stream },
  "llm-providers": { help: llm.providersHelp, run: llm.listProviders }, "llm-models": { help: llm.modelsHelp, run: llm.listModels }, chat: { help: llm.chatHelp, run: llm.chat }, "llm-bench": { help: llm.benchHelp, run: llm.benchmark },
  "realtime-info": { help: "realtime-info\nList realtime providers and model ids.", run: async (ctx, args) => { if (args.positionals.length) throw new UsageError("Expected no positional arguments."); const result = allRealtimeProviders.map(x => ({ id: x.id, name: x.name, docsUrl: x.docsUrl, models: x.create({ credentials: {}, fetch: (async () => { throw new Error("static metadata only"); }) as typeof fetch }).models })); write(ctx.io.stdout, ctx.json ? JSON.stringify(result, null, 2) + "\n" : result.map(x => `${x.id}\t${x.name}\t${x.models.join(", ")}\n`).join("")); } },
  "agent-sim": { help: "agent-sim --in speech.wav [--stt provider] [--llm provider] [--model ID] [--voice provider:id] [--system TEXT] [--out reply.wav]", run: async (ctx, args) => { const input = option(args, "in", true)!; const voiceId = option(args, "voice", true)!; if (!/^([^:]+):(.+)$/.test(voiceId)) throw new UsageError("--voice must be provider:voiceId."); const bytes = new Uint8Array(await readFile(resolvePath(ctx.io.cwd, input))); const transport = createMemoryTransport({ inputFormat: { encoding: "pcm16", sampleRate: 16000 }, outputFormat: { encoding: "pcm16", sampleRate: 16000 } }); transport.pushFrame({ data: bytes.subarray(input.toLowerCase().endsWith(".wav") ? 44 : 0), encoding: "pcm16", sampleRate: 16000, channels: 1 }); transport.end(); const tts = ctx.engine; const sttEngine = ctx.sttEngine ?? await (ctx.io.sttEngineFactory ? ctx.io.sttEngineFactory({}) : createSttRuntime(ctx.io)); const llmEngine = ctx.llmEngine ?? await (ctx.io.llmEngineFactory ? ctx.io.llmEngineFactory({}) : createLlmRuntime(ctx.io)); const agent = createVoiceAgent({ stt: sttEngine, llm: llmEngine, tts, transport }, { stt: { provider: option(args, "stt") }, llm: { provider: option(args, "llm"), model: option(args, "model"), system: option(args, "system") ?? "You are a helpful voice assistant." }, tts: { voice: { provider: voiceId.split(":")[0], voiceId: voiceId.split(":").slice(1).join(":") }, format: { container: "wav", sampleRate: 16000, channels: 1, bitDepth: 16 } }, turn: { silenceEndpointMs: 500, bargeIn: false, bargeInMinSpeechMs: 300, firstChunkFlushMs: 400, minClauseWords: 6 } }); const metrics: unknown[] = []; const collect = (async () => { for await (const event of agent.events) if (event.type === "metrics") metrics.push(event.metrics); })(); await agent.run(); await collect; const audio = new Uint8Array(transport.sentFrames.reduce((n, frame) => n + frame.data.byteLength, 0)); let offset = 0; for (const frame of transport.sentFrames) { audio.set(frame.data, offset); offset += frame.data.byteLength; } const wav = pcmWave(audio, 16000); const out = option(args, "out"); if (out) await writeFile(resolvePath(ctx.outDir, out), wav); output(ctx, { metrics, outputBytes: wav.byteLength }, `turns ${metrics.length}; audio ${wav.byteLength} bytes\n`); } },
};
const options: Record<string, string[]> = {
  providers: [], models: ["language", "tier"], voices: queryFlags, voice: [], recommend: queryFlags,
  speak: [...queryFlags, ...settingsFlags, "voice", "model", "format", "sample-rate", "timestamps", "stream", "long", "out", "play", "concurrency", "max-chunk-chars"],
  batch: ["concurrency"], clone: ["name", "sample", "mode", "language", "description", "denoise", "consent"],
  design: ["prompt", "text", "language", "gender", "age", "accent", "candidates", "save", "pick"],
  sts: ["voice", "input", "out"], "delete-voice": ["yes"], estimate: ["voice", "model"], doctor: [], languages: [],
  "stt-providers": [], "stt-models": ["language", "tier"], transcribe: ["model", "language", "words", "diarize", "keyword", "translate-to", "out"], "stt-stream": ["encoding", "sample-rate", "realtime"],
  "llm-providers": [], "llm-models": ["tier"], chat: ["model", "system", "tier", "stream", "temperature", "max-tokens", "json-schema", "tools"], "llm-bench": ["model", "runs", "prompt"], "realtime-info": [], "agent-sim": ["in", "stt", "llm", "model", "voice", "system", "out"],
};
const help = `voice-engine <command> [options]\n\n${Object.entries(commands).map(([name, command]) => `  ${name.padEnd(14)} ${command.help.split("\n")[0]}`).join("\n")}\n\nGlobal options: --provider ID, --json, --company ID, --cache-dir DIR, --out-dir DIR\nUse <command> --help for details.\n`;

/** Execute one CLI invocation without exiting the host process. */
export async function runCli(argv: readonly string[], io: CliIO): Promise<number> {
  let json = argv.some(arg => arg === "--json" || arg === "--json=true");
  try {
    const args = parseArgs(argv);
    json = flag(args, "json");
    const name = args.positionals.shift();
    if (!name) {
      if (Object.keys(args.flags).length && !flag(args, "help")) throw new UsageError("Missing command. Use --help.");
      write(io.stdout, help); return 0;
    }
    if (name === "help") { write(io.stdout, help); return 0; }
    const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
    if (!command) throw new UsageError(`Unknown command ${name}. Use --help.`);
    validateOptions(args, options[name]);
    if (flag(args, "help")) { write(io.stdout, command.help + "\n\nGlobal options: --provider, --json, --company, --cache-dir, --out-dir\n"); return 0; }
    const outDir = resolve(io.cwd, option(args, "out-dir") ?? ".");
    const engineOptions: VoiceEngineOptions = {
      scope: { companyId: option(args, "company") },
      routing: { preferred: repeated(args, "provider") },
    };
    const engine = io.engineFactory
      ? await io.engineFactory(engineOptions)
      : (await import("./runtime.js")).createRuntime(io, engineOptions, option(args, "cache-dir"), outDir);
    const registered = new Set(engine.providers().map(provider => provider.id));
    const sttProviders = new Set((await import("../stt/index.js")).allSttProviders.map(provider => provider.id));
    const llmProviders = new Set((await import("../llm/index.js")).allLlmProviders.map(provider => provider.id));
    const sttCommand = ["stt-providers", "stt-models", "transcribe", "stt-stream"].includes(name);
    const llmCommand = ["llm-providers", "llm-models", "chat", "llm-bench"].includes(name);
    for (const value of repeated(args, "provider") ?? []) {
      const ids = value.split(",").map(id => id.trim()); const allowed = sttCommand ? sttProviders : llmCommand ? llmProviders : registered;
      for (const provider of ids) if (!allowed.has(provider)) throw new UsageError(`Unknown provider ${provider}. Use the corresponding *-providers command to list ids.`);
    }
    const ctx: CliContext = { engine, io, json, outDir };
    if (["stt-providers", "stt-models", "transcribe", "stt-stream", "agent-sim", "doctor"].includes(name)) ctx.sttEngine = io.sttEngineFactory ? await io.sttEngineFactory({}) : createSttRuntime(io);
    if (["llm-providers", "llm-models", "chat", "llm-bench", "agent-sim", "doctor"].includes(name)) ctx.llmEngine = io.llmEngineFactory ? await io.llmEngineFactory({}) : createLlmRuntime(io);
    return await command.run(ctx, args) ?? 0;
  } catch (error) {
    const usage = error instanceof UsageError;
    const details = errorDetails(error);
    write(io.stderr, json ? JSON.stringify({ error: details }) + "\n" : `${errorText(details)}\n`);
    return usage ? 2 : 1;
  }
}

function pcmWave(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const result = new Uint8Array(44 + pcm.byteLength); const view = new DataView(result.buffer); const encoder = new TextEncoder();
  result.set(encoder.encode("RIFF"), 0); view.setUint32(4, 36 + pcm.byteLength, true); result.set(encoder.encode("WAVEfmt "), 8); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); result.set(encoder.encode("data"), 36); view.setUint32(40, pcm.byteLength, true); result.set(pcm, 44); return result;
}
