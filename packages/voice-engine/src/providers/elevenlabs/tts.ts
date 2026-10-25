import type { ProviderContext, SynthesisChunk, SynthesisRequest, SynthesisResult, VoiceRef, VoiceSettings, WordTimestamp } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { decodeAudio, invalid, jsonLines, malformed, object, openRequest, requestAudio, responseChunks, responseError } from "./http.js";
import { fromOutputFormat, toOutputFormat } from "./formats.js";
import { defaultModel, ELEVENLABS_MODELS, languageCode } from "./models.js";

const LANGUAGE_MODELS = new Set(["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_v3"]);
export const CHARACTER_PRICING_SOURCE = "elevenlabs character count; plan-dependent credits";

function clamp(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(`${name} must be a finite number`);
  return Math.max(min, Math.min(max, value));
}

/** Map shared voice settings to native knobs, including Eleven v3's discrete stability. */
export function voiceSettings(settings: VoiceSettings = {}, model: string, overrides: unknown = undefined): Record<string, unknown> {
  const native: Record<string, unknown> = {
    stability: settings.stability, similarity_boost: settings.similarity, style: settings.style,
    use_speaker_boost: settings.speakerBoost, speed: settings.speed, ...object(overrides),
  };
  for (const key of ["stability", "similarity_boost", "style"]) if (native[key] !== undefined) native[key] = clamp(native[key], 0, 1, key);
  if (model === "eleven_v3" && typeof native.stability === "number") native.stability = Math.round(native.stability * 2) / 2;
  if (native.speed !== undefined) native.speed = clamp(native.speed, 0.7, 1.2, "speed");
  return Object.fromEntries(Object.entries(native).filter(([, value]) => value !== undefined));
}

/** Resolve either public voice reference representation and reject other providers. */
export function voiceRef(voice: VoiceRef | string): VoiceRef {
  const ref = typeof voice === "string" ? { provider: voice.slice(0, voice.indexOf(":")), voiceId: voice.slice(voice.indexOf(":") + 1) } : voice;
  if (ref.provider !== "elevenlabs" || !ref.voiceId) throw invalid("An ElevenLabs voice ID is required");
  return { provider: "elevenlabs", voiceId: ref.voiceId };
}

function prepare(request: SynthesisRequest) {
  const options = { ...request.providerOptions };
  const model = String(options.model_id ?? request.model ?? defaultModel({ language: request.language }));
  const descriptor = ELEVENLABS_MODELS.find(item => item.id === model);
  if (!descriptor || model.includes("_sts_")) throw new VoiceEngineError(`Unsupported ElevenLabs TTS model: ${model}`, { code: "unsupported", provider: "elevenlabs" });
  const format = request.format ? toOutputFormat(request.format) : typeof options.output_format === "string" ? fromOutputFormat(options.output_format) : toOutputFormat();
  delete options.output_format;
  if (request.pronunciation?.length && !options.pronunciation_dictionary_locators) {
    throw new VoiceEngineError("Create a pronunciation dictionary first and pass pronunciation_dictionary_locators in providerOptions", { code: "unsupported", provider: "elevenlabs" });
  }
  const inputText = options.text ?? request.text;
  if (typeof inputText !== "string" || !inputText.trim()) throw invalid("Synthesis text must not be empty");
  let text: string = inputText;
  if (request.ssml) text = text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  if (model === "eleven_v3" && request.settings?.emotion) {
    const raw = request.settings.emotion.trim().toLowerCase().replace(/^\[|\]$/g, "");
    const tag = ({ whisper: "whispers", laugh: "laughs", happy: "happily" } as Record<string, string>)[raw] ?? raw;
    if (!/^[a-z][a-z -]{0,59}$/.test(tag)) throw invalid("Emotion must be a short audio tag name");
    text = `[${tag}] ${text}`;
  }
  if (!text.trim() || text.length > descriptor.maxInputChars!) throw invalid(`${model} accepts 1-${descriptor.maxInputChars} input characters (including audio tags)`);
  const body: Record<string, unknown> = {
    text, model_id: model, seed: request.settings?.seed,
    previous_text: request.context?.previousText, next_text: request.context?.nextText,
    ...options,
  };
  body.text = text;
  body.model_id = model;
  const settings = voiceSettings(request.settings, model, options.voice_settings);
  if (Object.keys(settings).length) body.voice_settings = settings;
  else delete body.voice_settings;
  const language = request.language ?? (typeof options.language_code === "string" ? options.language_code : undefined);
  if (LANGUAGE_MODELS.has(model) && language) body.language_code = languageCode(language);
  else delete body.language_code;
  if (body.seed !== undefined && (!Number.isInteger(body.seed) || Number(body.seed) < 0 || Number(body.seed) > 4294967295)) throw invalid("seed must be a uint32");
  const voice = voiceRef(request.voice);
  return { body, model, voice, format, path: `/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}` };
}

interface Character { text: string; startMs: number; endMs: number }

function characters(alignment: unknown): Character[] {
  if (alignment == null) return [];
  const data = object(alignment);
  const chars = data.characters;
  const starts = data.character_start_times_seconds;
  const ends = data.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends) || chars.length !== starts.length || chars.length !== ends.length) throw malformed("Invalid ElevenLabs character alignment");
  return chars.map((text: unknown, index) => {
    const start = starts[index];
    const end = ends[index];
    if (typeof text !== "string" || typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) throw malformed("Invalid ElevenLabs character timing");
    return { text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) };
  });
}

class WordAccumulator {
  private pending: WordTimestamp | undefined;
  add(chars: Character[]): WordTimestamp[] {
    const words: WordTimestamp[] = [];
    for (const char of chars) {
      for (const part of char.text.split(/(\s+)/u).filter(Boolean)) {
        if (/^\s+$/u.test(part)) { if (this.pending) words.push(this.pending); this.pending = undefined; }
        else if (this.pending) { this.pending.text += part; this.pending.endMs = char.endMs; }
        else this.pending = { text: part, startMs: char.startMs, endMs: char.endMs };
      }
    }
    return words;
  }
  flush(): WordTimestamp[] {
    const result = this.pending ? [this.pending] : [];
    this.pending = undefined;
    return result;
  }
}

/** Combine adjacent non-whitespace characters into words, retaining punctuation and millisecond times. */
export function alignmentToWords(alignment: unknown): WordTimestamp[] {
  const words = new WordAccumulator();
  return [...words.add(characters(alignment)), ...words.flush()];
}

/** Generate speech as audio or an audio/timestamp JSON response. */
export async function synthesize(ctx: ProviderContext, request: SynthesisRequest): Promise<SynthesisResult> {
  const start = Date.now();
  const { body, model, voice, format, path } = prepare(request);
  const query = { output_format: format.outputFormat };
  let data: Uint8Array;
  let requestId: string | undefined;
  let timestamps: WordTimestamp[] | undefined;
  if (request.timestamps) {
    const http = await openRequest(ctx, `${path}/with-timestamps`, { json: body, query, signal: request.signal });
    try {
      const text = await http.read(() => http.response.text());
      let result: Record<string, unknown>;
      try { result = object(JSON.parse(text)); } catch { throw malformed("Invalid ElevenLabs timestamp response JSON"); }
      data = decodeAudio(result.audio_base64);
      timestamps = alignmentToWords(result.normalized_alignment ?? result.alignment);
      requestId = http.response.headers.get("request-id") ?? undefined;
    } finally { http.close(); }
  } else {
    ({ data, requestId } = await requestAudio(ctx, path, { json: body, query, signal: request.signal, accept: format.mimeType }));
  }
  return { audio: { data, format: format.format, mimeType: format.mimeType }, voice, model, provider: "elevenlabs", language: request.language,
    timestamps, requestId, cached: false, latencyMs: Date.now() - start,
    usage: { provider: "elevenlabs", model, operation: "synthesize", unit: "character", units: request.text.length,
      estimatedCents: null, pricingSource: CHARACTER_PRICING_SOURCE, requestId } };
}

/** Stream audio bytes or NDJSON audio/alignment frames, preserving words split across frames. */
export async function* synthesizeStream(ctx: ProviderContext, request: SynthesisRequest): AsyncGenerator<SynthesisChunk> {
  const { body, path, format } = prepare(request);
  const http = await openRequest(ctx, `${path}/stream${request.timestamps ? "/with-timestamps" : ""}`, {
    json: body, query: { output_format: format.outputFormat }, signal: request.signal,
    accept: request.timestamps ? "application/json" : format.mimeType,
  });
  try {
    if (!request.timestamps) {
      for await (const audio of responseChunks(http)) yield { audio };
      return;
    }
    const words = new WordAccumulator();
    let offsetMs = 0;
    for await (const frame of jsonLines(http)) {
      if (frame.detail || frame.error) throw responseError(500, http.response.headers, frame.detail ? frame : { detail: frame.error });
      const chars = characters(frame.normalized_alignment ?? frame.alignment);
      const timestamps = words.add(chars.map(char => ({ ...char, startMs: char.startMs + offsetMs, endMs: char.endMs + offsetMs })));
      // HTTP alignment frames are chunk-relative. This clock excludes unaligned trailing silence.
      offsetMs += chars.reduce((max, char) => Math.max(max, char.endMs), 0);
      const audio = frame.audio_base64 == null ? new Uint8Array() : decodeAudio(frame.audio_base64);
      if (audio.length || chars.length || timestamps.length) yield { audio, timestamps, text: chars.map(char => char.text).join("") };
    }
    const tail = words.flush();
    if (tail.length) yield { audio: new Uint8Array(), timestamps: tail };
  } finally { http.close(); }
}
