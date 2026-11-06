import type { AudioFormat, ProviderContext, SynthesisRequest, SynthesisResult, VoiceRef } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { bounded, openHttp, streamHttp } from "./http.js";
import { OPENAI_MODELS } from "./models.js";

type Request = SynthesisRequest & { voice: VoiceRef };
const mime: Record<string, string> = { mp3: "audio/mpeg", opus: "audio/ogg; codecs=opus", aac: "audio/aac", flac: "audio/flac", wav: "audio/wav", pcm: "audio/pcm" };

function outputFormat(requested: AudioFormat = { container: "mp3" }): AudioFormat {
  if (!mime[requested.container] || requested.channels === 2 || requested.bitrate !== undefined
    || (requested.bitDepth !== undefined && (!["pcm", "wav"].includes(requested.container) || requested.bitDepth !== 16))) {
    throw new VoiceEngineError("Unsupported OpenAI audio format", { provider: "openai", code: "unsupported" });
  }
  const pcm = requested.container === "pcm" || requested.container === "wav";
  if (requested.sampleRate !== undefined && (!pcm || requested.sampleRate !== 24000)) {
    throw new VoiceEngineError("OpenAI has no sample-rate control; PCM/WAV is 24 kHz", { provider: "openai", code: "unsupported" });
  }
  return pcm ? { ...requested, sampleRate: 24000, channels: 1, bitDepth: 16 } : { ...requested };
}

function prepare(ctx: ProviderContext, request: Request) {
  if (!ctx.credentials.apiKey) throw new VoiceEngineError("OpenAI apiKey is required", { provider: "openai", code: "auth" });
  const model = request.model ?? "gpt-4o-mini-tts";
  const format = outputFormat(request.format);
  const input = request.ssml ? request.text.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&") : request.text;
  const body: Record<string, unknown> = { ...request.providerOptions, model, input, voice: request.voice.voiceId, response_format: format.container, speed: bounded(request.settings?.speed, 0.25, 4) };
  // These models reject instructions, even if supplied through the escape hatch.
  delete body.instructions;
  delete body.stream_format;
  if (model.startsWith("gpt-4o-mini-tts")) {
    const instructions = [
      request.language ? `Speak in ${request.language.toLowerCase() === "es-es" ? "Castilian Spanish" : request.language}.` : undefined,
      request.settings?.emotion ? `Use a ${request.settings.emotion} tone.` : undefined,
      request.settings?.style !== undefined ? `Use an expressiveness level of ${bounded(request.settings.style, 0, 1)} on a 0 to 1 scale.` : undefined,
      typeof request.providerOptions?.instructions === "string" ? request.providerOptions.instructions : undefined,
    ].filter(Boolean).join(" ");
    if (instructions) body.instructions = instructions;
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${ctx.credentials.apiKey}`, "Content-Type": "application/json" };
  if (ctx.credentials.organization) headers["OpenAI-Organization"] = ctx.credentials.organization;
  if (ctx.credentials.project) headers["OpenAI-Project"] = ctx.credentials.project;
  if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;
  let url: URL;
  try { url = new URL(ctx.baseUrl ?? ctx.credentials.baseUrl ?? "https://api.openai.com/v1"); }
  catch (cause) { throw new VoiceEngineError("Invalid OpenAI base URL", { provider: "openai", code: "invalid_request", cause }); }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/audio/speech`;
  return { model, format, url: url.toString(), init: { method: "POST", headers, body: JSON.stringify(body), signal: request.signal } };
}

/** Generate a complete Speech API audio result. */
export async function synthesize(ctx: ProviderContext, request: Request): Promise<SynthesisResult> {
  const start = Date.now();
  const prepared = prepare(ctx, request);
  const http = await openHttp(ctx, prepared.url, prepared.init);
  try {
    const data = new Uint8Array(await http.run(() => http.response.arrayBuffer()));
    const model = OPENAI_MODELS.find(m => m.id === prepared.model);
    const requestId = http.response.headers.get("x-request-id") ?? undefined;
    return { provider: "openai", model: prepared.model, voice: request.voice, language: request.language,
      audio: { data, format: prepared.format, mimeType: mime[prepared.format.container] }, cached: false, latencyMs: Date.now() - start, requestId,
      usage: { provider: "openai", model: prepared.model, operation: "synthesize", unit: "character", units: request.text.length,
        estimatedCents: model?.usdPerMillionChars === undefined ? null : request.text.length * model.usdPerMillionChars / 10000,
        pricingSource: model?.notes ?? "Unknown model pricing", requestId },
    };
  } finally { http.close(); }
}

/** Yield the HTTP chunked audio body without buffering the complete response. */
export async function* synthesizeStream(ctx: ProviderContext, request: Request) {
  const prepared = prepare(ctx, request);
  yield* streamHttp(ctx, prepared.url, prepared.init);
}
