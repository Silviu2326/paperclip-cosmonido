import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { allSttProviders } from "../../stt/index.js";
import type { SttProviderDefinition, SttProvider, SttStreamEvent } from "../../stt/types.js";
import { choice, flag, option, positional, repeated, numeric, type ParsedArgs } from "../args.js";
import { output, table, write, type CliContext } from "../context.js";
import { formatSubtitles } from "../subtitles.js";

export const providersHelp = "stt-providers [--provider ID]\nList STT providers and credential requirements without making network calls.";
export const modelsHelp = "stt-models [--provider ID] [--language TAG] [--tier flagship|balanced|fast|legacy]";
export const transcribeHelp = "transcribe <file|-> [--provider ID] [--model ID] [--language auto|TAG] [--words] [--diarize] [--keyword TERM] [--translate-to TAG] [--out FILE.json|.txt|.srt|.vtt]";
export const streamHelp = "stt-stream <file.wav|raw> [--provider ID] [--encoding pcm16|mulaw] [--sample-rate HZ] [--realtime]";
function staticStt(def: SttProviderDefinition): SttProvider { return def.create({ credentials: Object.fromEntries(Object.keys(def.credentialEnv).map((field) => [field, field === "baseUrl" ? "http://localhost" : "static-metadata-placeholder"])), fetch: (async () => { throw new Error("static provider metadata cannot make network calls"); }) as typeof fetch }); }
function engine(ctx: CliContext) { if (!ctx.sttEngine) throw new Error("STT engine is unavailable in this CLI context."); return ctx.sttEngine; }

export async function listProviders(ctx: CliContext, args: ParsedArgs) { positional(args, 0); const id = option(args, "provider"); const rows = allSttProviders.filter(x => !id || x.id === id).map(x => ({ id: x.id, name: x.name, docsUrl: x.docsUrl, credentialEnv: x.credentialEnv, requiredCredentials: x.requiredCredentials, capabilities: staticStt(x).capabilities })); output(ctx, rows, table(["ID", "NAME", "CREDENTIALS", "STREAM"], rows.map(x => [x.id, x.name, Object.values(x.credentialEnv).flat().join(", ") || "none", x.capabilities.streaming]))); }
export async function listModels(ctx: CliContext, args: ParsedArgs) { positional(args, 0); const provider = option(args, "provider"); const language = option(args, "language")?.toLowerCase().split("-")[0]; const tier = choice(args, "tier", ["flagship", "balanced", "fast", "legacy"]); const models = (await Promise.all(allSttProviders.filter(x => !provider || x.id === provider).map(x => staticStt(x).listModels()))).flat().filter(x => (!tier || x.tier === tier) && (!language || !x.languages.length || x.languages.some(tag => tag.toLowerCase().split("-")[0] === language))); output(ctx, models, table(["PROVIDER", "MODEL", "TIER", "STREAM", "LANGUAGES"], models.map(x => [x.provider, x.id, x.tier, x.supportsStreaming, x.languages.join(", ") || "many/unknown"]))); }

/** Transcribe a file or stdin and optionally write JSON, text, or subtitles. */
export async function transcribe(ctx: CliContext, args: ParsedArgs) {
  const [source] = positional(args, 1); const bytes = source === "-" ? await stdinBytes(ctx) : new Uint8Array(await readFile(resolve(ctx.io.cwd, source)));
  const out = option(args, "out"); const ext = out?.split(".").pop()?.toLowerCase(); if (ext && !["json", "txt", "srt", "vtt"].includes(ext)) throw new Error("--out must end in .json, .txt, .srt, or .vtt");
  const result = await engine(ctx).transcribe({ provider: option(args, "provider"), model: option(args, "model"), audio: { data: bytes, mimeType: source.toLowerCase().endsWith(".wav") ? "audio/wav" : "application/octet-stream", fileName: source === "-" ? undefined : source }, language: option(args, "language") ?? "auto", wordTimestamps: flag(args, "words"), diarization: flag(args, "diarize") ? { enabled: true } : undefined, keywords: repeated(args, "keyword"), translateTo: option(args, "translate-to") });
  const payload = ext === "txt" ? result.text : ext === "srt" || ext === "vtt" ? formatSubtitles(result.segments?.length ? result.segments : result.words ?? [], ext) : ext === "json" ? JSON.stringify(result, null, 2) + "\n" : undefined;
  if (out && payload !== undefined) { const path = resolve(ctx.outDir, out); await mkdir(dirname(path), { recursive: true }); await writeFile(path, payload); output(ctx, { ...result, outputPath: path }); }
  else if (payload !== undefined) write(ctx.io.stdout, payload);
  else output(ctx, result, `${result.text}\n`);
  return result.usage.estimatedCents === null ? 0 : 0;
}

/** Feed a WAV or raw file through a streaming STT session in paced frames. */
export async function stream(ctx: CliContext, args: ParsedArgs) {
  const [source] = positional(args, 1); const encoding = choice(args, "encoding", ["pcm16", "mulaw"]) ?? "pcm16"; const sampleRate = numeric(args, "sample-rate", 1, 192000, true) ?? 16000; const data = new Uint8Array(await readFile(resolve(ctx.io.cwd, source))); const stream = await engine(ctx).openStream({ provider: option(args, "provider"), encoding, sampleRate, interimResults: true }); const events: SttStreamEvent[] = []; let done = false; const consume = (async () => { for await (const event of stream.events) { events.push(event); if (ctx.json) continue; write(ctx.io.stdout, JSON.stringify(event) + "\n"); } done = true; })(); const chunkSize = Math.max(1, Math.floor(sampleRate * (encoding === "pcm16" ? 2 : 1) * 0.05)); const delay = () => new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  try { for (let i = source.toLowerCase().endsWith(".wav") ? 44 : 0; i < data.length; i += chunkSize) { stream.send(data.subarray(i, Math.min(data.length, i + chunkSize))); if (flag(args, "realtime")) await delay(); } stream.finalize(); } finally { await stream.close(); await consume; }
  if (ctx.json) output(ctx, events); return done ? 0 : 1;
}

async function stdinBytes(ctx: CliContext): Promise<Uint8Array> { if (typeof ctx.io.stdin === "string") return new TextEncoder().encode(ctx.io.stdin); if (!ctx.io.stdin) return new Uint8Array(); const chunks: Uint8Array[] = []; for await (const item of ctx.io.stdin) chunks.push(typeof item === "string" ? new TextEncoder().encode(item) : item); const result = new Uint8Array(chunks.reduce((n, x) => n + x.length, 0)); let at = 0; for (const part of chunks) { result.set(part, at); at += part.length; } return result; }
