import type { AudioFormat, ProviderContext, SynthesisChunk, SynthesisRequest, SynthesisResult, VoiceRef } from "../../core/types.js";
import { invalid, request, stream } from "./http.js";

export type PlayHtInput = SynthesisRequest & { voice: VoiceRef };

/** Translate audio containers into the PlayHT streaming format enum. */
export function audioFormat(input: AudioFormat = { container: "mp3" }) {
  if (!["mp3", "wav", "ogg", "flac", "mulaw", "pcm"].includes(input.container)) invalid("Unsupported PlayHT output format", "unsupported");
  if (input.channels === 2 || input.bitrate !== undefined || input.bitDepth !== undefined && input.bitDepth !== 16) invalid("PlayHT does not expose channel, bitrate or PCM depth controls", "unsupported");
  if (input.sampleRate !== undefined && (input.sampleRate < 8000 || input.sampleRate > 48000 || !Number.isInteger(input.sampleRate))) invalid("PlayHT sample rate must be 8000..48000");
  return { format: { ...input }, output: input.container === "pcm" ? "raw" : input.container,
    mimeType: input.container === "mp3" ? "audio/mpeg" : input.container === "pcm" ? "audio/pcm" : `audio/${input.container}` };
}

/** Map universal voice settings and dialog aliases to native request fields. */
export function synthesisBody(input: PlayHtInput): Record<string, unknown> {
  const model = input.model ?? "Play3.0-mini", settings = input.settings ?? {};
  const { turnPrefix, turnPrefix2, voice2, pollIntervalMs: _poll, ...options } = input.providerOptions ?? {};
  if (input.text.length > (model === "Play3.0-mini" ? 20000 : 2000)) invalid("Text exceeds the PlayHT engine character limit");
  let language: string | undefined;
  if (input.language) {
    const code = input.language.split("-")[0].toLowerCase();
    language = code === "zh" ? "mandarin" : new Intl.DisplayNames(["en"], { type: "language" }).of(code)?.toLowerCase();
  }
  return { text: input.text, voice: input.voice.voiceId, voice_engine: model, output_format: audioFormat(input.format).output,
    sample_rate: input.format?.sampleRate, speed: settings.speed === undefined ? undefined : Math.max(0.1, Math.min(5, settings.speed)),
    seed: settings.seed, temperature: settings.stability === undefined ? undefined : 2 * (1 - Math.max(0, Math.min(1, settings.stability))),
    voice_guidance: settings.similarity === undefined ? undefined : 1 + 5 * Math.max(0, Math.min(1, settings.similarity)),
    style_guidance: settings.style === undefined ? undefined : 1 + 29 * Math.max(0, Math.min(1, settings.style)),
    emotion: model === "PlayDialog" || model === "PlayDialogMultilingual" ? undefined : settings.emotion,
    language, turn_prefix: turnPrefix, turn_prefix_2: turnPrefix2, voice_2: voice2, ...options };
}

/** Build the common synthesis result and unknown-plan usage record. */
export function synthesisResult(input: PlayHtInput, data: Uint8Array, start: number, requestId?: string): SynthesisResult {
  const format = audioFormat(input.format), model = input.model ?? "Play3.0-mini";
  return { provider: "playht", model, voice: input.voice, language: input.language,
    audio: { data, format: format.format, mimeType: format.mimeType }, cached: false, latencyMs: Date.now() - start, requestId,
    usage: { provider: "playht", model, operation: "synthesize", unit: "character", units: input.text.length,
      estimatedCents: null, pricingSource: "https://play.ht/pricing (plan dependent; 2026-10-22)", requestId } };
}

/** Buffer the streaming endpoint for ordinary synthesis. */
export async function synthesize(ctx: ProviderContext, input: PlayHtInput): Promise<SynthesisResult> {
  const start = Date.now(), format = audioFormat(input.format);
  const response = await request(ctx, "/tts/stream", { method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json", Accept: format.mimeType }, body: JSON.stringify(synthesisBody(input)) },
  async res => ({ data: new Uint8Array(await res.arrayBuffer()), requestId: res.headers.get("x-request-id") ?? undefined }));
  return synthesisResult(input, response.data, start, response.requestId);
}

/** Yield PlayHT's chunked audio response incrementally. */
export async function* synthesizeStream(ctx: ProviderContext, input: PlayHtInput): AsyncGenerator<SynthesisChunk> {
  const format = audioFormat(input.format);
  for await (const audio of stream(ctx, "/tts/stream", { method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json", Accept: format.mimeType }, body: JSON.stringify(synthesisBody(input)) })) yield { audio };
}
