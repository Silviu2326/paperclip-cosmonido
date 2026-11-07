import type { AudioFormat, ProviderContext, SynthesisChunk, SynthesisRequest, SynthesisResult, VoiceRef } from "../../core/types.js";
import { invalid, request, stream } from "./http.js";

type Input = SynthesisRequest & { voice: VoiceRef };

/** Resolve Aura's encoding/container matrix, rejecting impossible combinations. */
export function audioFormat(input: AudioFormat = { container: "wav" }) {
  if (input.channels === 2 || (input.bitDepth !== undefined && input.bitDepth !== 16)) invalid("Deepgram Aura supports mono 16-bit PCM", "unsupported");
  const container = input.container;
  const encoding = container === "wav" || container === "pcm" ? "linear16" : container === "ogg" ? "opus" : container;
  const params = new URLSearchParams({ encoding });
  const fixed = encoding === "mp3" || encoding === "aac" ? 22050 : encoding === "opus" ? 48000 : undefined;
  if (fixed && input.sampleRate !== undefined && input.sampleRate !== fixed) invalid(`Deepgram ${encoding} has fixed sample rate ${fixed}`, "unsupported");
  const rate = input.sampleRate ?? fixed ?? (container === "mulaw" || container === "alaw" ? 8000 : container === "flac" ? 48000 : 24000);
  const rates = encoding === "linear16" ? [8000, 16000, 24000, 32000, 48000] : encoding === "mulaw" || encoding === "alaw" ? [8000, 16000] : encoding === "flac" ? [8000, 16000, 22050, 32000, 48000] : [fixed];
  if (!rates.includes(rate)) invalid("Unsupported Deepgram sample rate", "unsupported");
  if (!fixed) params.set("sample_rate", String(rate));
  if (encoding === "linear16" || encoding === "mulaw" || encoding === "alaw") params.set("container", container === "wav" ? "wav" : "none");
  if (encoding === "opus") params.set("container", "ogg");
  if (input.bitrate !== undefined) {
    const bps = input.bitrate * 1000;
    if (encoding === "mp3" ? ![32000, 48000].includes(bps) : encoding === "opus" ? bps < 4000 || bps > 650000 : encoding === "aac" ? bps < 4000 || bps > 192000 : true) invalid("Unsupported Deepgram bit rate", "unsupported");
    params.set("bit_rate", String(bps));
  }
  const mimeType = encoding === "opus" ? "audio/ogg;codecs=opus" : container === "mp3" ? "audio/mpeg" : container === "pcm" ? "audio/pcm" : `audio/${container}`;
  const format: AudioFormat = { ...input, sampleRate: rate, channels: 1 };
  if (encoding === "linear16") format.bitDepth = 16;
  return { params, format, mimeType };
}

function prepare(input: Input) {
  if (input.text.length > 2000) invalid("Deepgram Aura accepts at most 2000 characters");
  const voice = input.voice.voiceId;
  const model = input.model && !["aura-1", "aura-2"].includes(input.model) ? input.model : voice;
  if (!/^aura-(?:2-)?[a-z0-9-]+-[a-z]{2}$/.test(model)) invalid("Deepgram requires an Aura voice model ID");
  if (input.model === "aura-2" && !model.startsWith("aura-2-") || input.model === "aura-1" && model.startsWith("aura-2-")) invalid("Deepgram voice does not belong to the requested Aura family");
  const format = audioFormat(input.format);
  format.params.set("model", model);
  return { ...format, model, path: `/speak?${format.params}`, init: { method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input.providerOptions, text: input.text }) } };
}

/** Synthesize using a voice model, with settings intentionally ignored by Aura. */
export async function synthesize(ctx: ProviderContext, input: Input): Promise<SynthesisResult> {
  const start = Date.now(), prepared = prepare(input);
  const response = await request(ctx, prepared.path, prepared.init, async res => ({ data: new Uint8Array(await res.arrayBuffer()), requestId: res.headers.get("dg-request-id") ?? res.headers.get("x-request-id") ?? undefined }));
  const price = prepared.model.startsWith("aura-2-") ? 30 : undefined;
  return { provider: "deepgram", model: prepared.model, voice: { provider: "deepgram", voiceId: prepared.model }, language: input.language,
    audio: { data: response.data, format: prepared.format, mimeType: prepared.mimeType }, requestId: response.requestId,
    cached: false, latencyMs: Date.now() - start,
    usage: { provider: "deepgram", model: prepared.model, operation: "synthesize", unit: "character", units: input.text.length,
      estimatedCents: price === undefined ? null : input.text.length * price * 100 / 1_000_000,
      pricingSource: "https://deepgram.com/pricing (2026-10-22; Aura 2 estimate)", requestId: response.requestId } };
}

/** Yield the HTTP Speak response incrementally; this does not use WebSockets. */
export async function* synthesizeStream(ctx: ProviderContext, input: Input): AsyncGenerator<SynthesisChunk> {
  const prepared = prepare(input);
  for await (const audio of stream(ctx, prepared.path, prepared.init)) yield { audio };
}
