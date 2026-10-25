import type { AudioFormat, ProviderContext, SynthesisRequest, VoiceRef, WordTimestamp } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";
import { abortable, failure, record, transportError } from "./http.js";
import { LANGUAGE_NAMES } from "./models.js";

export const MIME: Record<string, string> = { mp3: "audio/mpeg", pcm: "audio/pcm", wav: "audio/wav", flac: "audio/flac" };

export function decodeHex(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length % 2 || !/^[0-9a-f]*$/i.test(value)) throw failure("MiniMax returned invalid hex audio");
  return new Uint8Array(Buffer.from(value, "hex"));
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function prepare(request: SynthesisRequest & { voice: VoiceRef }, stream: boolean) {
  const options = request.providerOptions ?? {};
  const format: AudioFormat = { container: "mp3", ...request.format };
  if (!MIME[format.container]) throw failure(`MiniMax does not support ${format.container}`, "unsupported");
  if (stream && format.container === "wav") throw failure("MiniMax WAV output does not support streaming", "unsupported");
  if (format.sampleRate !== undefined && ![8000, 16000, 22050, 24000, 32000, 44100].includes(format.sampleRate)) throw failure("Unsupported MiniMax sample rate", "unsupported");
  if (format.bitrate !== undefined && ![32, 64, 128, 256].includes(format.bitrate)) throw failure("Unsupported MiniMax bitrate", "unsupported");
  if (format.bitDepth !== undefined && format.bitDepth !== 16) throw failure("MiniMax only exposes 16-bit PCM", "unsupported");
  const settings = request.settings ?? {};
  const voice = { ...record(options.voice_setting), voice_id: request.voice.voiceId } as Record<string, unknown>;
  if (settings.speed !== undefined) voice.speed = clamp(settings.speed, 0.5, 2);
  // Gain in dB maps to linear amplitude; 0 dB preserves MiniMax's neutral vol=1.
  if (settings.volume !== undefined) voice.vol = clamp(10 ** (settings.volume / 20), 0, 10);
  if (settings.pitch !== undefined) voice.pitch = Math.round(clamp(settings.pitch, -12, 12));
  if (settings.emotion) {
    const aliases: Record<string, string> = { excited: "happy", joyful: "happy", fear: "fearful", scared: "fearful", disgust: "disgusted", surprise: "surprised", calm: "neutral" };
    const emotion = settings.emotion.toLowerCase();
    voice.emotion = aliases[emotion] ?? (["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"].includes(emotion) ? emotion : "neutral");
  }
  const audio = { ...record(options.audio_setting), format: format.container,
    sample_rate: format.sampleRate ?? record(options.audio_setting).sample_rate,
    bitrate: format.bitrate === undefined ? record(options.audio_setting).bitrate : format.bitrate * 1000,
    channel: format.channels ?? record(options.audio_setting).channel };
  const model = request.model ?? "speech-02-hd";
  const body: Record<string, unknown> = { ...options, model, text: request.text, stream, voice_setting: voice,
    audio_setting: audio, output_format: "hex",
    language_boost: request.language ? LANGUAGE_NAMES[request.language.toLowerCase().split("-")[0]] ?? "auto" : options.language_boost ?? "auto",
    subtitle_enable: request.timestamps ?? options.subtitle_enable ?? false };
  if (request.timestamps) body.subtitle_type = "word";
  if (stream) body.stream_options = { ...record(options.stream_options), exclude_aggregated_audio: true };
  if (request.pronunciation?.length) body.pronunciation_dict = { ...record(options.pronunciation_dict),
    tone: request.pronunciation.filter(rule => rule.phoneme || rule.alias).map(rule => `${rule.grapheme}/(${rule.phoneme ?? rule.alias})`) };
  return { model, format, body };
}

export function timestamps(value: unknown): WordTimestamp[] {
  const root = record(value);
  const entries = Array.isArray(value) ? value : root.timestamped_words ?? root.words ?? root.subtitles ?? root.subtitle ?? root.segments;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap(entry => {
    const row = record(entry);
    if (Array.isArray(row.timestamped_words) || Array.isArray(row.words)) return timestamps(row);
    const text = row.word ?? row.text;
    const start = row.startMs ?? row.time_begin ?? row.start;
    const end = row.endMs ?? row.time_end ?? row.end;
    return typeof text === "string" && typeof start === "number" && typeof end === "number" && end >= start
      ? [{ text, startMs: start, endMs: end }] : [];
  });
}

export async function fetchSubtitles(ctx: ProviderContext, location: string, callerSignal?: AbortSignal): Promise<WordTimestamp[]> {
  const controller = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  const timer = ctx.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), ctx.timeoutMs);
  try {
    const url = new URL(location, ctx.baseUrl ?? "https://api.minimax.io");
    if (!["https:", "http:"].includes(url.protocol)) throw failure("Invalid MiniMax subtitle URL");
    signal.throwIfAborted();
    // Subtitle links are signed object-storage URLs; never send the API bearer token.
    const response = await abortable(ctx.fetch(url.toString(), { signal }), signal);
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const delay = retry === null ? NaN : Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      throw new VoiceEngineError("Could not fetch MiniMax subtitles", { provider: "minimax", code: codeFromStatus(response.status), status: response.status,
        retryAfterMs: Number.isFinite(delay) ? Math.max(0, delay) : undefined });
    }
    return timestamps(await abortable(response.json(), signal));
  } catch (error) { throw transportError(error, signal); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
