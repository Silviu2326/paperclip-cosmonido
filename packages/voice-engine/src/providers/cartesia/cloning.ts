import type { CloneVoiceRequest, CloneVoiceResult, ProviderContext, UpdateVoiceRequest, VoiceDescriptor, SpeechToSpeechRequest, VoiceRef, SynthesisResult } from "../../core/types.js";
import { audioFormat } from "./format.js";
import { invalid, json, request } from "./http.js";
import { normalizeVoice } from "./voices.js";

/** Clone one recording after explicit consent attestation. */
export async function cloneVoice(ctx: ProviderContext, input: CloneVoiceRequest): Promise<CloneVoiceResult> {
  if (!input.consent?.attested) invalid("Voice cloning requires consent.attested");
  if (input.mode === "professional") invalid("Cartesia professional cloning is not supported", "unsupported");
  if (input.samples.length !== 1) invalid("Cartesia instant cloning requires exactly one sample");
  const sample = input.samples[0];
  const form = new FormData();
  form.set("clip", new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }), sample.fileName ?? "sample.wav");
  const options = input.providerOptions ?? {};
  for (const [key, value] of Object.entries({ name: input.name, description: input.description, language: input.language?.split("-")[0], mode: options.mode ?? "similarity", enhance: input.denoise, base_voice_id: options.base_voice_id, ...options })) {
    if (key !== "clip" && value !== undefined) form.set(key, String(value));
  }
  const voice = normalizeVoice(await request(ctx, "/voices/clone", { method: "POST", body: form, signal: input.signal }, res => res.json()));
  return { voice: { ...voice, raw: { ...voice.raw, consent: input.consent } }, status: "ready" };
}

/** Update clone metadata through Cartesia's voice endpoint. */
export async function updateVoice(ctx: ProviderContext, id: string, input: UpdateVoiceRequest): Promise<VoiceDescriptor> {
  if (input.addSamples?.length || input.removeSampleIds?.length) invalid("Cartesia voice updates cannot modify samples", "unsupported");
  return normalizeVoice(await json(ctx, `/voices/${encodeURIComponent(id)}`, { name: input.name, description: input.description }, input.signal, "PATCH"));
}

/** Delete a saved Cartesia voice. */
export async function deleteVoice(ctx: ProviderContext, id: string, signal?: AbortSignal): Promise<void> {
  await request(ctx, `/voices/${encodeURIComponent(id)}`, { method: "DELETE", signal }, async () => undefined);
}

/** Convert an audio recording to a target voice using multipart input. */
export async function speechToSpeech(ctx: ProviderContext, input: SpeechToSpeechRequest & { voice: VoiceRef }): Promise<SynthesisResult> {
  const start = Date.now(), format = audioFormat(input.format), form = new FormData();
  form.set("clip", new Blob([new Uint8Array(input.audio.data)], { type: input.audio.mimeType }), input.audio.fileName ?? "sample.wav");
  form.set("voice[id]", input.voice.voiceId);
  for (const [key, value] of Object.entries(format.output)) form.set(`output_format[${key}]`, String(value));
  for (const [key, value] of Object.entries(input.providerOptions ?? {})) if (value !== undefined && key !== "clip") form.set(key, String(value));
  const data = await request(ctx, "/voice-changer/bytes", { method: "POST", body: form, signal: input.signal }, async res => new Uint8Array(await res.arrayBuffer()));
  return { provider: "cartesia", model: input.model ?? "voice-changer", voice: input.voice,
    audio: { data, format: format.format, mimeType: format.mimeType }, cached: false, latencyMs: Date.now() - start,
    usage: { provider: "cartesia", model: input.model ?? "voice-changer", operation: "speech_to_speech", unit: "request", units: 1, estimatedCents: null, pricingSource: "Cartesia voice changer: account dependent" } };
}
