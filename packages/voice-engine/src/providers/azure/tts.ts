import type { AudioFormat, ProviderContext, SynthesisRequest, SynthesisResult, VoiceRef } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { endpoint, headers } from "./api.js";
import { openHttp, streamHttp } from "./http.js";
import { AZURE_MODELS } from "./models.js";
import { buildSsml } from "./ssml.js";

type Request = SynthesisRequest & { voice: VoiceRef };

/** Select a native Azure format without promising unsupported resampling. */
export function outputFormat(requested: AudioFormat = { container: "mp3" }) {
  const format: AudioFormat = { ...requested, sampleRate: requested.sampleRate ?? (["mulaw", "alaw"].includes(requested.container) ? 8000 : ["opus", "ogg"].includes(requested.container) ? 48000 : 24000), channels: 1 };
  const khz = format.sampleRate! / 1000;
  let native: string | undefined;
  let mimeType = "audio/pcm";
  if (format.container === "mp3" && [16, 24, 48].includes(khz)) {
    format.bitrate ??= khz === 16 ? 128 : khz === 24 ? 160 : 192;
    const rates = khz === 16 ? [32, 64, 128] : khz === 24 ? [48, 96, 160] : [96, 192];
    if (rates.includes(format.bitrate)) native = `audio-${khz}khz-${format.bitrate}kbitrate-mono-mp3`;
    mimeType = "audio/mpeg";
  } else if (["wav", "pcm"].includes(format.container) && [8, 16, 24, 48].includes(khz)) {
    format.bitDepth = 16;
    native = `${format.container === "wav" ? "riff" : "raw"}-${khz}khz-16bit-mono-pcm`;
    mimeType = format.container === "wav" ? "audio/wav" : "audio/pcm";
  } else if (["ogg", "opus"].includes(format.container) && [16, 24, 48].includes(khz)) {
    native = `ogg-${khz}khz-16bit-mono-opus`; mimeType = "audio/ogg; codecs=opus";
  } else if (["mulaw", "alaw"].includes(format.container) && khz === 8) {
    native = `raw-8khz-8bit-mono-${format.container}`; mimeType = format.container === "mulaw" ? "audio/basic" : "audio/alaw";
  }
  if (!native || requested.channels === 2 || (requested.bitDepth !== undefined && (!["wav", "pcm"].includes(format.container) || requested.bitDepth !== 16)) || (requested.bitrate !== undefined && format.container !== "mp3")) {
    throw new VoiceEngineError("Unsupported Azure audio format", { provider: "azure", code: "unsupported" });
  }
  return { format, native, mimeType };
}

function prepare(ctx: ProviderContext, request: Request) {
  if (request.voice.voiceId.startsWith("personal-job:")) throw new VoiceEngineError("Personal Voice is still training; poll getVoice(jobId)", { provider: "azure", code: "invalid_request" });
  const output = outputFormat(request.format);
  const model = request.model ?? (request.voice.voiceId.startsWith("personal:") ? "custom-neural" : /HD/.test(request.voice.voiceId) ? "neural-hd" : /Multilingual/.test(request.voice.voiceId) ? "multilingual" : "neural");
  return { ...output, model, url: `${endpoint(ctx)}/cognitiveservices/v1`, init: { method: "POST", headers: { ...headers(ctx), "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": output.native }, body: buildSsml(request), signal: request.signal } };
}

/** Synthesize SSML over REST; REST does not expose word-boundary timestamps. */
export async function synthesize(ctx: ProviderContext, request: Request): Promise<SynthesisResult> {
  const started = Date.now();
  const prepared = prepare(ctx, request);
  const http = await openHttp(ctx, prepared.url, prepared.init);
  try {
    const data = new Uint8Array(await http.run(() => http.response.arrayBuffer()));
    const requestId = http.response.headers.get("x-requestid") ?? http.response.headers.get("apim-request-id") ?? undefined;
    const model = AZURE_MODELS.find(m => m.id === prepared.model);
    return { provider: "azure", model: prepared.model, voice: request.voice, language: request.language,
      audio: { data, format: prepared.format, mimeType: prepared.mimeType }, cached: false, latencyMs: Date.now() - started, requestId,
      usage: { provider: "azure", model: prepared.model, operation: "synthesize", unit: "character", units: request.text.length,
        estimatedCents: model?.usdPerMillionChars === undefined ? null : request.text.length * model.usdPerMillionChars / 10000,
        pricingSource: model?.notes ?? "Unknown model pricing", requestId } };
  } finally { http.close(); }
}

/** Yield chunked REST audio with no SDK/WebSocket dependency. */
export async function* synthesizeStream(ctx: ProviderContext, request: Request) {
  const prepared = prepare(ctx, request);
  yield* streamHttp(ctx, prepared.url, prepared.init);
}
