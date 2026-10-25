import type { ProviderContext, SynthesisChunk, SynthesisRequest, SynthesisResult, VoiceRef } from "../../core/types.js";
import { checkStatus, chunks, failure, json, jsonBody, record } from "./http.js";
import { decodeHex, fetchSubtitles, MIME, prepare, timestamps } from "./audio.js";
import { MINIMAX_MODELS, PRICING_SOURCE } from "./models.js";

type Request = SynthesisRequest & { voice: VoiceRef };

export async function synthesize(ctx: ProviderContext, request: Request): Promise<SynthesisResult> {
  const started = Date.now();
  const prepared = prepare(request, false);
  const result = await json(ctx, "/v1/t2a_v2", { ...jsonBody(prepared.body), signal: request.signal });
  const data = record(result.data);
  const extra = record(result.extra_info);
  const bytes = decodeHex(data.audio);
  if (!bytes.length) throw failure("MiniMax returned empty audio");
  const subtitleUrl = result.subtitle_file ?? data.subtitle_file;
  const words = request.timestamps ? typeof subtitleUrl === "string" ? await fetchSubtitles(ctx, subtitleUrl, request.signal) : timestamps(data.subtitle) : undefined;
  const format = { ...prepared.format };
  if (typeof extra.audio_sample_rate === "number") format.sampleRate = extra.audio_sample_rate;
  const units = typeof extra.usage_characters === "number" ? extra.usage_characters : request.text.length;
  const rate = MINIMAX_MODELS.find(model => model.id === prepared.model)?.usdPerMillionChars;
  const requestId = typeof result.trace_id === "string" ? result.trace_id : undefined;
  return { provider: "minimax", model: prepared.model, voice: request.voice, language: request.language, cached: false,
    audio: { data: bytes, mimeType: MIME[format.container], format,
      durationMs: typeof extra.audio_length === "number" ? extra.audio_length : undefined }, timestamps: words,
    latencyMs: Date.now() - started, requestId,
    usage: { provider: "minimax", model: prepared.model, operation: "synthesize", unit: "character", units,
      estimatedCents: rate === undefined ? null : units * rate / 10000, pricingSource: PRICING_SOURCE, requestId } };
}

function event(line: string, retryAfterMs?: number): Record<string, unknown> | "done" | undefined {
  if (!line.startsWith("data:")) return undefined;
  const payload = line.slice(5).trim();
  if (!payload) return undefined;
  if (payload === "[DONE]") return "done";
  let body: Record<string, unknown>;
  try { body = record(JSON.parse(payload)); }
  catch { throw failure("MiniMax returned malformed SSE JSON"); }
  checkStatus(body, 200, retryAfterMs);
  return body;
}

async function streamChunk(ctx: ProviderContext, body: Record<string, unknown>, request: Request): Promise<SynthesisChunk | undefined> {
  const data = record(body.data);
  const audio = data.audio === undefined || data.audio === "" ? new Uint8Array() : decodeHex(data.audio);
  const subtitleUrl = body.subtitle_file ?? data.subtitle_file;
  const words = request.timestamps ? typeof subtitleUrl === "string" ? await fetchSubtitles(ctx, subtitleUrl, request.signal) : timestamps(data.subtitle) : undefined;
  return audio.length || words?.length ? { audio, timestamps: words } : undefined;
}

export async function* synthesizeStream(ctx: ProviderContext, request: Request): AsyncGenerator<SynthesisChunk> {
  const prepared = prepare(request, true);
  const decoder = new TextDecoder();
  let buffer = "";
  let isJsonResponse = false;
  let sawEvent = false;
  let retryAfterMs: number | undefined;
  for await (const chunk of chunks(ctx, "/v1/t2a_v2", { ...jsonBody(prepared.body), signal: request.signal })) {
    retryAfterMs = chunk.retryAfterMs;
    buffer += decoder.decode(chunk.bytes, { stream: true });
    if (!sawEvent && buffer.trimStart().startsWith("{")) isJsonResponse = true;
    if (isJsonResponse) continue;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      const parsed = event(line, retryAfterMs);
      if (parsed === "done") return;
      if (parsed) { sawEvent = true; const output = await streamChunk(ctx, parsed, request); if (output) yield output; }
    }
  }
  buffer += decoder.decode();
  if (isJsonResponse) {
    let body: Record<string, unknown>;
    try { body = record(JSON.parse(buffer)); } catch { throw failure("MiniMax returned malformed JSON instead of SSE"); }
    checkStatus(body, 200, retryAfterMs);
    throw failure("MiniMax returned JSON instead of an audio stream");
  }
  if (buffer.trim()) {
    const parsed = event(buffer.trim(), retryAfterMs);
    if (parsed && parsed !== "done") { const output = await streamChunk(ctx, parsed, request); if (output) yield output; }
    else if (!buffer.trim().startsWith("data:")) {
      // Some API failures use JSON even when a stream was requested.
      let body: Record<string, unknown>;
      try { body = record(JSON.parse(buffer)); } catch { throw failure("MiniMax returned an invalid SSE response"); }
      checkStatus(body, 200, retryAfterMs);
      throw failure("MiniMax returned JSON instead of an audio stream");
    }
  }
  if (!sawEvent && !buffer.trim()) throw failure("MiniMax returned an empty audio stream");
}
