import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { SynthesisRequest, UsageRecord, WordTimestamp } from "../../core/types.js";
import { choice, flag, numeric, option, positional, UsageError, type ParsedArgs } from "../args.js";
import { output, write, type CliContext } from "../context.js";
import { readText, selectedVoice, voiceId, voiceQuery, voiceSettings } from "../inputs.js";
import { openOutput, outputPath, playAudio, reportUsage, saveAudio, writeChunk } from "../files.js";

export const help = `speak <text|-|@file.txt> --voice <provider:voiceId|auto>
  [--provider ID] [--model ID] [--language TAG] [--gender female] [--tag narration]
  [--format mp3|wav|pcm|opus] [--sample-rate HZ] [--speed 0.25..4]
  [--stability 0..1] [--similarity 0..1] [--style 0..1] [--pitch -12..12]
  [--volume -20..20] [--emotion NAME] [--seed N] [--timestamps]
  [--stream | --long] [--concurrency N] [--max-chunk-chars N] [--out FILE] [--play]
Timestamp sidecars are written to <audio-path>.json.`;

export interface SpeakSummary {
  path: string;
  bytes: number;
  chars: number;
  voice: SynthesisRequest["voice"];
  model?: string;
  provider?: string;
  usage?: UsageRecord;
  usageRecords?: UsageRecord[];
  estimatedCents: number | null;
  latencyMs: number;
  cached?: boolean;
  timestampsPath?: string;
}

/** Validate synthesis options before reading input or making a provider call. */
export function validateSpeak(args: ParsedArgs): void {
  positional(args, 1);
  const voice = option(args, "voice", true)!;
  if (voice !== "auto") voiceId(voice);
  voiceQuery(args);
  if (flag(args, "stream") && flag(args, "long")) throw new UsageError("Use either --stream or --long.");
  choice(args, "format", ["mp3", "wav", "pcm", "opus"]);
  numeric(args, "sample-rate", 1, 384000, true);
  numeric(args, "concurrency", 1, 32, true);
  numeric(args, "max-chunk-chars", 1, Infinity, true);
  if (!flag(args, "long") && (args.flags.concurrency || args.flags["max-chunk-chars"])) throw new UsageError("--concurrency and --max-chunk-chars require --long.");
  voiceSettings(args);
}

/** Render one speech request; reusable by batch without emitting a JSON document. */
export async function executeSpeak(ctx: CliContext, args: ParsedArgs): Promise<SpeakSummary> {
  validateSpeak(args);
  const request: SynthesisRequest = {
    text: await readText(args.positionals[0], ctx.io), voice: await selectedVoice(ctx, args),
    model: option(args, "model"), language: option(args, "language"),
    format: { container: choice(args, "format", ["mp3", "wav", "pcm", "opus"]) ?? "mp3", sampleRate: numeric(args, "sample-rate", 1, 384000, true) },
    settings: voiceSettings(args), timestamps: flag(args, "timestamps"),
  };
  const started = performance.now();
  let timestamps: WordTimestamp[] = [];
  let summary: SpeakSummary;
  if (flag(args, "stream")) {
    const path = outputPath(ctx, option(args, "out"), request.format!.container);
    const handle = await openOutput(path);
    const usageRecords: UsageRecord[] = [];
    // runCli owns one engine. Batch forbids concurrent streams because usage events
    // have no per-request correlation key in the public contract.
    const unsubscribe = ctx.engine.on(event => { if (event.type === "usage") usageRecords.push(event.usage); });
    let bytes = 0;
    try {
      for await (const chunk of ctx.engine.synthesizeStream(request)) {
        await writeChunk(handle, chunk.audio);
        bytes += chunk.audio.byteLength;
        if (chunk.timestamps) timestamps.push(...chunk.timestamps);
      }
    } catch (error) {
      write(ctx.io.stderr, `Streaming failed; partial audio is at ${path}.\n`);
      throw error;
    } finally {
      unsubscribe();
      await handle.close();
    }
    const latencyMs = performance.now() - started;
    if (!usageRecords.length) {
      try { usageRecords.push(await ctx.engine.estimateCost(request)); }
      catch { write(ctx.io.stderr, "Stream completed; provider did not report usage and estimation is unavailable.\n"); }
    }
    for (const usage of usageRecords) reportUsage(ctx, usage, latencyMs);
    if (!usageRecords.length) reportUsage(ctx, undefined, latencyMs);
    summary = { path, bytes, chars: request.text.length, voice: request.voice, model: request.model, usageRecords, estimatedCents: usageRecords.length && usageRecords.every(u => u.estimatedCents !== null) ? usageRecords.reduce((sum, u) => sum + u.estimatedCents!, 0) : null, latencyMs };
  } else {
    const result = flag(args, "long")
      ? await ctx.engine.synthesizeLong(request, { concurrency: numeric(args, "concurrency", 1, 32, true), maxChunkChars: numeric(args, "max-chunk-chars", 1, Infinity, true) })
      : await ctx.engine.synthesize(request);
    const path = await saveAudio(ctx, result.audio, option(args, "out"));
    timestamps = result.timestamps ?? [];
    reportUsage(ctx, result.usage, result.latencyMs);
    summary = { path, bytes: result.audio.data.byteLength, chars: request.text.length, voice: result.voice, model: result.model, provider: result.provider, usage: result.usage, estimatedCents: result.usage.estimatedCents, latencyMs: result.latencyMs, cached: result.cached };
  }
  if (request.timestamps) {
    summary.timestampsPath = `${summary.path}.json`;
    await writeFile(summary.timestampsPath, JSON.stringify({ timestamps }, null, 2) + "\n");
    if (!timestamps.length) write(ctx.io.stderr, "No timestamps returned; sidecar contains an empty list.\n");
  }
  if (flag(args, "play")) await playAudio(ctx, summary.path);
  return summary;
}

/** Synthesize text from a positional literal, file, or stdin. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  const summary = await executeSpeak(ctx, args);
  output(ctx, summary, `${summary.path}\n`);
}
