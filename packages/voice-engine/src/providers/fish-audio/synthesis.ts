import type { AudioFormat, ProviderContext, SynthesisRequest, SynthesisResult, VoiceRef } from "../../core/types.js";
import { chunks, consume, failure, jsonBody, record } from "./http.js";
import { FISH_AUDIO_MODELS, PRICING_SOURCE } from "./models.js";

type Request = SynthesisRequest & { voice: VoiceRef };
const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", pcm: "audio/pcm", opus: "audio/opus" };

function prepare(request: Request, streaming: boolean) {
  const model = request.model ?? "s1";
  const options = request.providerOptions ?? {};
  const format: AudioFormat = { container: "mp3", ...request.format };
  if (!MIME[format.container]) throw failure(`Fish Audio does not support ${format.container}`, "unsupported");
  const sampleRate = format.sampleRate ?? options.sample_rate;
  const rates = format.container === "opus" ? [48000] : format.container === "mp3" ? [32000, 44100] : [8000, 16000, 24000, 32000, 44100];
  if (sampleRate !== undefined && (typeof sampleRate !== "number" || !rates.includes(sampleRate))) throw failure("Unsupported Fish Audio sample rate for this format", "unsupported");
  if (sampleRate !== undefined) format.sampleRate = sampleRate;
  if (format.channels !== undefined && format.channels !== 1) throw failure("Fish Audio supports mono output only", "unsupported");
  if (format.bitDepth !== undefined && format.bitDepth !== 16) throw failure("Fish Audio only exposes 16-bit PCM", "unsupported");
  if (format.container === "mp3" && format.bitrate !== undefined && ![64, 128, 192].includes(format.bitrate)) {
    throw failure("Fish Audio MP3 bitrate must be 64, 128, or 192 kbps", "unsupported");
  }
  if (format.container === "opus" && format.bitrate !== undefined && ![24, 32, 48, 64].includes(format.bitrate)) throw failure("Unsupported Fish Audio Opus bitrate", "unsupported");
  const settings = request.settings ?? {};
  const emotion = settings.emotion?.replace(/[()]/g, "").trim();
  const text = model.startsWith("s1") && emotion ? `(${emotion}) ${request.text}` : request.text;
  const body: Record<string, unknown> = {
    ...options, text, reference_id: request.voice.voiceId || undefined, format: format.container, streaming,
    sample_rate: format.sampleRate ?? options.sample_rate,
    ...(format.container === "mp3" ? { mp3_bitrate: format.bitrate ?? options.mp3_bitrate } : {}),
    ...(format.container === "opus" ? { opus_bitrate: format.bitrate === undefined ? options.opus_bitrate : format.bitrate * 1000 } : {}),
    prosody: { ...record(options.prosody), ...(settings.speed === undefined ? {} : { speed: settings.speed }),
      ...(settings.volume === undefined ? {} : { volume: settings.volume }) },
  };
  if (settings.stability !== undefined) body.temperature = Math.max(0.1, Math.min(1, 1 - settings.stability));
  if (typeof body.chunk_length === "number") body.chunk_length = Math.max(100, Math.min(300, body.chunk_length));
  if (Array.isArray(options.references)) {
    body.references = options.references.map(reference => {
      const ref = record(reference);
      return { ...ref, audio: ref.audio instanceof Uint8Array ? Buffer.from(ref.audio).toString("base64") : ref.audio };
    });
    if (options.reference_id === null || request.voice.voiceId === "") delete body.reference_id;
  }
  const init = jsonBody(body);
  init.headers = { ...init.headers, model };
  init.signal = request.signal;
  return { model, format, text, init };
}

export async function synthesize(ctx: ProviderContext, request: Request): Promise<SynthesisResult> {
  const started = Date.now();
  const prepared = prepare(request, request.providerOptions?.streaming === true);
  const { data, requestId } = await consume(ctx, "/v1/tts", prepared.init, async response => ({
    data: new Uint8Array(await response.arrayBuffer()), requestId: response.headers.get("x-request-id") ?? undefined,
  }));
  if (!data.length) throw failure("Fish Audio returned empty audio");
  const units = new TextEncoder().encode(prepared.text).length;
  const rate = FISH_AUDIO_MODELS.find(model => model.id === prepared.model)?.usdPerMillionChars;
  return { provider: "fish-audio", model: prepared.model, voice: request.voice, language: request.language,
    audio: { data, format: prepared.format, mimeType: MIME[prepared.format.container] }, cached: false,
    latencyMs: Date.now() - started, requestId,
    usage: { provider: "fish-audio", model: prepared.model, operation: "synthesize", unit: "byte", units,
      estimatedCents: rate === undefined ? null : units * rate / 10000, pricingSource: PRICING_SOURCE, requestId } };
}

export async function* synthesizeStream(ctx: ProviderContext, request: Request) {
  const prepared = prepare(request, true);
  for await (const audio of chunks(ctx, "/v1/tts", prepared.init)) yield { audio };
}
