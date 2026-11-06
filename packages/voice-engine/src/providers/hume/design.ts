import type { DesignVoiceRequest, DesignVoiceResult, ProviderContext, VoiceDescriptor } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { invalid, json, object } from "./http.js";
import { generationAudio } from "./tts.js";
import { normalizeVoice } from "./voices.js";

/** Preview prompt-designed voices; automatic version routing supports voice-free design. */
export async function designVoice(ctx: ProviderContext, input: DesignVoiceRequest): Promise<DesignVoiceResult> {
  const count = input.candidates ?? 3, text = input.text ?? "Hello! This is a preview of my voice.";
  if (!Number.isInteger(count) || count < 1 || count > 5) invalid("Hume supports 1..5 design candidates");
  if (!input.prompt.trim()) invalid("Voice design requires a description");
  const description = [input.prompt, input.language ? `Language: ${input.language}.` : undefined, input.gender, input.age, input.accent].filter(Boolean).join(" ");
  const response = object(await json(ctx, "/tts", { utterances: [{ text, description }], format: { type: "mp3" }, num_generations: count, ...input.providerOptions }, input.signal));
  const candidates = Array.isArray(response.generations) ? response.generations : [];
  if (!candidates.length) throw new VoiceEngineError("Hume returned no design candidates", { provider: "hume", code: "provider_unavailable" });
  return { candidates: candidates.map(value => {
    const generation = object(value);
    if (typeof generation.generation_id !== "string") throw new VoiceEngineError("Hume design response is missing generation_id", { provider: "hume", code: "provider_unavailable" });
    return { candidateId: generation.generation_id, preview: generationAudio(generation), description };
  }), usage: { provider: "hume", operation: "design", unit: "character", units: text.length * count, estimatedCents: null, pricingSource: "https://www.hume.ai/pricing (plan dependent; 2026-10-22)" } };
}

/** Persist a preview's generation token as a custom voice. */
export async function saveDesignedVoice(ctx: ProviderContext, candidateId: string, name: string, description?: string): Promise<VoiceDescriptor> {
  const voice = normalizeVoice(await json(ctx, "/tts/voices", { generation_id: candidateId, name }), "CUSTOM_VOICE");
  return { ...voice, description: description ?? voice.description };
}
