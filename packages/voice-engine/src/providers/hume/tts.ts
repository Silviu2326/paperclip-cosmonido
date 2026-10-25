import type { AudioFormat, AudioOutput, ProviderContext, SynthesisChunk, SynthesisRequest, SynthesisResult, VoiceRef, WordTimestamp } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";
import { invalid, json, lines, object, parse, stream } from "./http.js";

type Input = SynthesisRequest & { voice: VoiceRef };

/** Hume output has a provider-selected sample rate; no resampling is implied. */
export function audioFormat(input: AudioFormat = { container: "mp3" }) {
  if (!["mp3", "wav", "pcm"].includes(input.container)) invalid("Hume supports MP3, WAV and PCM", "unsupported");
  if (input.sampleRate !== undefined && input.sampleRate !== 48000 || input.bitrate !== undefined || input.channels === 2 || input.bitDepth !== undefined && input.bitDepth !== 16) invalid("Hume does not expose the requested audio encoding controls", "unsupported");
  return { format: { ...input, sampleRate: 48000 }, output: { type: input.container },
    mimeType: input.container === "mp3" ? "audio/mpeg" : input.container === "wav" ? "audio/wav" : "audio/pcm" };
}

/** Map native millisecond timestamps and compatibility second-based word arrays. */
export function wordTimestamps(value: unknown): WordTimestamp[] {
  const values = Array.isArray(value) ? value.flat(Infinity) : Array.isArray(object(value).words) ? object(value).words as unknown[] : [value];
  return values.flatMap(value => {
    const item = object(value), time = object(item.time);
    if (item.type && item.type !== "word") return [];
    const text = item.text ?? item.word;
    if (typeof text !== "string") return [];
    if (typeof time.begin === "number" && typeof time.end === "number") return [{ text, startMs: time.begin, endMs: time.end }];
    if (typeof item.start === "number" && typeof item.end === "number") return [{ text, startMs: item.start * 1000, endMs: item.end * 1000 }];
    return [];
  });
}

/** Build utterances, acting directions and Octave version selection. */
export function synthesisBody(input: Input): Record<string, unknown> {
  if (input.text.length > 5000) invalid("Hume utterances accept at most 5000 characters");
  if (input.model === "octave" && input.timestamps) invalid("Word timestamps require Octave 2", "unsupported");
  const { voiceProvider, voiceName, description, trailing_silence, ...options } = input.providerOptions ?? {};
  const settings = input.settings ?? {};
  const directions = [description, settings.emotion, settings.style === undefined ? undefined : `Expressiveness: ${Math.round(settings.style * 100)}%.`].filter(value => value !== undefined && value !== "").join(" ");
  const voice = voiceName ? { name: voiceName, provider: voiceProvider ?? "HUME_AI" } : { id: input.voice.voiceId, provider: voiceProvider ?? "HUME_AI" };
  return { utterances: [{ text: input.text, voice, description: directions || undefined,
    speed: settings.speed === undefined ? undefined : Math.max(0.25, Math.min(3, settings.speed)), trailing_silence }],
    context: input.context?.previousText ? { utterances: [{ text: input.context.previousText }] } : undefined,
    format: audioFormat(input.format).output, version: input.model === "octave" ? "1" : "2",
    include_timestamp_types: input.timestamps ? ["word"] : undefined, num_generations: 1, ...options };
}

/** Decode one JSON generation into an audio output. */
export function generationAudio(value: unknown, requested?: AudioFormat): AudioOutput {
  const generation = object(value), format = audioFormat(requested), encoding = object(generation.encoding);
  if (typeof generation.audio !== "string" || !generation.audio) throw new VoiceEngineError("Hume returned no generation audio", { provider: "hume", code: "provider_unavailable" });
  return { data: new Uint8Array(Buffer.from(generation.audio, "base64")), mimeType: format.mimeType,
    format: { ...format.format, sampleRate: typeof encoding.sample_rate === "number" ? encoding.sample_rate : format.format.sampleRate },
    durationMs: typeof generation.duration === "number" ? generation.duration * 1000 : undefined };
}

/** Synthesize a buffered generation with aligned word timestamps. */
export async function synthesize(ctx: ProviderContext, input: Input): Promise<SynthesisResult> {
  const start = Date.now(), body = synthesisBody(input), response = object(await json(ctx, "/tts", body, input.signal));
  const generation = object(Array.isArray(response.generations) ? response.generations[0] : undefined);
  const snippets = Array.isArray(generation.snippets) ? generation.snippets.flat(Infinity) : [];
  const timestamps = snippets.flatMap(snippet => wordTimestamps(object(snippet).timestamps));
  const model = input.model ?? "octave-2", requestId = typeof response.request_id === "string" ? response.request_id : undefined;
  return { provider: "hume", model, voice: input.voice, language: input.language,
    audio: generationAudio(generation, input.format), timestamps: input.timestamps || timestamps.length ? timestamps : undefined,
    cached: false, latencyMs: Date.now() - start, requestId,
    usage: { provider: "hume", model, operation: "synthesize", unit: "character", units: input.text.length, estimatedCents: null,
      pricingSource: "https://www.hume.ai/pricing (plan dependent; 2026-10-22)", requestId } };
}

/** Parse NDJSON audio and standalone timestamp records from Hume. */
export async function* synthesizeStream(ctx: ProviderContext, input: Input): AsyncGenerator<SynthesisChunk> {
  const body = { strip_headers: true, ...synthesisBody(input) };
  for await (const line of lines(stream(ctx, "/tts/stream/json", { method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(body) }))) {
    if (!line.trim()) continue;
    const record = parse(line);
    if (record.type === "error" || record.error) {
      const status = typeof record.status === "number" ? record.status : 500;
      throw new VoiceEngineError(String(record.message ?? record.error ?? "Hume stream failed"), { provider: "hume", code: codeFromStatus(status), status, details: record });
    }
    const timestamps = wordTimestamps(record.timestamp ?? record.timestamps ?? object(record.snippet).timestamps);
    const audio = typeof record.audio === "string" ? new Uint8Array(Buffer.from(record.audio, "base64")) : new Uint8Array();
    if (audio.length || timestamps.length) yield { audio, timestamps: timestamps.length ? timestamps : undefined, text: typeof record.text === "string" ? record.text : undefined };
  }
}
