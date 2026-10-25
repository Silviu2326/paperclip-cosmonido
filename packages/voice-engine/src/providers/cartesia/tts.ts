import type { ProviderContext, SynthesisRequest, SynthesisResult, SynthesisChunk, VoiceRef, WordTimestamp } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";
import { audioFormat, wav } from "./format.js";
import { concat, invalid, lines, object, parse, request, stream } from "./http.js";

type Input = SynthesisRequest & { voice: VoiceRef };

/** Map common settings to the model-specific Cartesia controls. */
export function synthesisBody(input: Input): Record<string, unknown> {
  if (input.text.length > 10000) invalid("Cartesia accepts at most 10000 characters per request");
  const model = input.model ?? "sonic-3";
  const settings = input.settings ?? {};
  const body: Record<string, unknown> = {
    model_id: model, transcript: input.text, voice: { mode: "id", id: input.voice.voiceId },
    output_format: audioFormat(input.format).output, language: input.language?.split("-")[0],
    add_timestamps: input.timestamps,
  };
  if (model.startsWith("sonic-3")) {
    body.generation_config = {
      speed: settings.speed === undefined ? undefined : Math.max(0.6, Math.min(1.5, settings.speed)),
      volume: settings.volume === undefined ? undefined : Math.max(0.5, Math.min(2, 10 ** (settings.volume / 20))),
      emotion: settings.emotion,
      ...object(input.providerOptions?.generation_config),
    };
  } else if (settings.speed !== undefined) {
    body.speed = Math.max(-1, Math.min(1, settings.speed - 1));
  }
  return { ...body, ...input.providerOptions, generation_config: body.generation_config };
}

function timestamps(value: unknown): WordTimestamp[] {
  const record = object(value);
  if (!Array.isArray(record.words) || !Array.isArray(record.start) || !Array.isArray(record.end)) return [];
  const starts = record.start, ends = record.end;
  return record.words.flatMap((word, i) => typeof word === "string" && typeof starts[i] === "number" && typeof ends[i] === "number"
    ? [{ text: word, startMs: starts[i] * 1000, endMs: ends[i] * 1000 }] : []);
}

/** Decode SSE records, including events split across arbitrary HTTP chunks. */
export async function* synthesizeStream(ctx: ProviderContext, input: Input): AsyncGenerator<SynthesisChunk> {
  const format = audioFormat(input.format ?? { container: "pcm" });
  if (format.output.container !== "raw") {
    if (input.timestamps) invalid("Cartesia SSE requires raw PCM, mulaw or alaw; use synthesize for WAV timestamps", "unsupported");
    for await (const audio of stream(ctx, "/tts/bytes", { method: "POST", signal: input.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(synthesisBody(input)) })) yield { audio };
    return;
  }
  const body = synthesisBody({ ...input, format: format.format });
  const records = lines(stream(ctx, "/tts/sse", { method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body) }));
  let event = "", data: string[] = [];
  function decode(): { done: boolean; chunk?: SynthesisChunk } {
    if (!data.length) return { done: false };
    const text = data.join("\n");
    if (text === "[DONE]") return { done: true };
    const record = parse(text);
    const type = String(record.type ?? event);
    if (type === "error" || record.error || Number(record.status_code) >= 400) {
      const status = Number(record.status_code) || 500;
      throw new VoiceEngineError(String(record.error ?? record.message ?? "Cartesia stream failed"), { provider: "cartesia", status, code: codeFromStatus(status), details: record });
    }
    const words = timestamps(record.word_timestamps);
    const audio = typeof record.data === "string" ? new Uint8Array(Buffer.from(record.data, "base64")) : new Uint8Array();
    return { done: type === "done" || record.done === true, chunk: audio.length || words.length
      ? { audio, timestamps: words.length ? words : undefined } : undefined };
  }
  for await (const line of records) {
    if (line === "") {
      const result = decode(); data = []; event = "";
      if (result.chunk) yield result.chunk;
      if (result.done) return;
    } else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  const result = decode();
  if (result.chunk) yield result.chunk;
}

/** Synthesize bytes, using SSE when word alignment was requested. */
export async function synthesize(ctx: ProviderContext, input: Input): Promise<SynthesisResult> {
  const start = Date.now();
  const format = audioFormat(input.format);
  const model = input.model ?? "sonic-3";
  let data: Uint8Array, requestId: string | undefined, words: WordTimestamp[] | undefined;
  if (input.timestamps) {
    if (format.format.container === "mp3") invalid("Cartesia timestamps require PCM/WAV or telephony audio", "unsupported");
    words = [];
    const chunks: Uint8Array[] = [];
    for await (const chunk of synthesizeStream(ctx, { ...input, format: { ...format.format, container: format.format.container === "wav" ? "pcm" : format.format.container } })) {
      chunks.push(chunk.audio); words.push(...chunk.timestamps ?? []);
    }
    data = concat(chunks);
    if (format.format.container === "wav") data = wav(data, format.format);
  } else {
    const response = await request(ctx, "/tts/bytes", { method: "POST", signal: input.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(synthesisBody(input)) },
    async res => ({ data: new Uint8Array(await res.arrayBuffer()), requestId: res.headers.get("x-request-id") ?? undefined }));
    data = response.data; requestId = response.requestId;
  }
  return { provider: "cartesia", model, voice: input.voice, language: input.language,
    audio: { data, format: format.format, mimeType: format.mimeType }, timestamps: words,
    cached: false, latencyMs: Date.now() - start, requestId,
    usage: { provider: "cartesia", model, operation: "synthesize", unit: "character", units: input.text.length,
      estimatedCents: input.text.length * 50 * 100 / 1_000_000, pricingSource: "https://cartesia.ai/pricing (2026-10-22 estimate)", requestId } };
}
