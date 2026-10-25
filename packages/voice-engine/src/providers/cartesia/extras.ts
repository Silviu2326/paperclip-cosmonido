import type { AudioFormat, AudioInput, AudioOutput, ProviderContext, VoiceDescriptor } from "../../core/types.js";
import { audioFormat } from "./format.js";
import { invalid, json, request } from "./http.js";
import { normalizeVoice } from "./voices.js";

/** Localize a voice to another language or dialect. */
export async function localizeVoice(ctx: ProviderContext, input: { voiceId: string; name: string; language: string; description?: string; dialect?: string; signal?: AbortSignal }): Promise<VoiceDescriptor> {
  return normalizeVoice(await json(ctx, "/voices/localize", { voice_id: input.voiceId, name: input.name, language: input.language, description: input.description, dialect: input.dialect }, input.signal));
}

/** Mix weighted voices through the legacy/account-gated mix endpoint. */
export async function mixVoices(ctx: ProviderContext, voices: { id: string; weight: number }[], options: { name?: string; signal?: AbortSignal } = {}): Promise<VoiceDescriptor> {
  if (!voices.length || voices.some(voice => !Number.isFinite(voice.weight) || voice.weight < 0) || !voices.some(voice => voice.weight > 0)) invalid("Voice mix requires nonnegative weights with a positive total");
  return normalizeVoice(await json(ctx, "/voices/mix", { voices, name: options.name }, options.signal));
}

/** Generate replacement speech between optional left/right audio context clips. */
export async function infillAudio(ctx: ProviderContext, input: { text: string; voiceId: string; leftAudio?: AudioInput; rightAudio?: AudioInput; model?: string; language?: string; format?: AudioFormat; signal?: AbortSignal }): Promise<AudioOutput> {
  const format = audioFormat(input.format), form = new FormData();
  form.set("transcript", input.text); form.set("voice_id", input.voiceId); form.set("model_id", input.model ?? "sonic-2");
  if (input.language) form.set("language", input.language);
  for (const [key, value] of Object.entries(format.output)) form.set(`output_format[${key}]`, String(value));
  for (const [key, clip] of [["left_audio", input.leftAudio], ["right_audio", input.rightAudio]] as const) {
    if (clip) form.set(key, new Blob([new Uint8Array(clip.data)], { type: clip.mimeType }), clip.fileName ?? `${key}.wav`);
  }
  const data = await request(ctx, "/infill/bytes", { method: "POST", signal: input.signal, body: form }, async res => new Uint8Array(await res.arrayBuffer()));
  return { data, format: format.format, mimeType: format.mimeType };
}

/** Create a pronunciation dictionary using Cartesia's native items schema. */
export async function createPronunciationDict(ctx: ProviderContext, input: { name: string; items: Record<string, unknown>[]; signal?: AbortSignal }): Promise<unknown> {
  return json(ctx, "/pronunciation-dicts", { name: input.name, items: input.items }, input.signal);
}
