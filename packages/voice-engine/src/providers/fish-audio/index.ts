import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { FISH_AUDIO_MODELS, LANGUAGES } from "./models.js";
import { synthesize, synthesizeStream } from "./synthesis.js";
import { cloneVoice, deleteVoice, filterVoices, getVoice, listFishVoices, updateVoice } from "./voices.js";
import { getBalance } from "./extras.js";

export { FISH_AUDIO_MODELS } from "./models.js";
export { transcribe, getBalance } from "./extras.js";
export { listFishVoices, listOwnVoices } from "./voices.js";
export type { FishVoiceListOptions } from "./voices.js";

/** Create a dependency-free Fish Audio HTTP adapter. */
export function createFishAudioProvider(ctx: ProviderContext): VoiceProvider {
  return {
    id: "fish-audio", name: "Fish Audio",
    capabilities: { synthesize: true, streaming: true, timestamps: false, ssml: false, emotionTags: true,
      instantClone: true, professionalClone: false, voiceDesign: false, speechToSpeech: false, voiceLibrary: true,
      pronunciationDictionary: false, formats: ["mp3", "wav", "pcm", "opus"], languages: [...LANGUAGES], maxInputChars: 15000 },
    async listModels() { return FISH_AUDIO_MODELS.map(model => ({ ...model, languages: [...model.languages] })); },
    defaultModel(options) { return ({ fast: "s1-mini", balanced: "speech-1.6", legacy: "speech-1.5", flagship: "s1" })[options?.tier ?? "flagship"]; },
    async listVoices(query = {}) {
      if (query.limit !== undefined && query.limit <= 0) return [];
      return filterVoices(await listFishVoices(ctx, { title: query.search, language: query.language,
        pageSize: query.limit, self: query.origin === "cloned" ? true : undefined }), query);
    },
    getVoice: id => getVoice(ctx, id),
    synthesize: request => synthesize(ctx, request),
    synthesizeStream: request => synthesizeStream(ctx, request),
    cloneVoice: request => cloneVoice(ctx, request),
    updateVoice: (id, request) => updateVoice(ctx, id, request),
    deleteVoice: (id, signal) => deleteVoice(ctx, id, signal),
    async healthcheck(signal) { const balance = await getBalance(ctx, signal); return { ok: true, detail: JSON.stringify(balance) }; },
  };
}

/** Fish Audio provider registration and environment credential mapping. */
export const fishAudioProvider: ProviderDefinition = {
  id: "fish-audio", name: "Fish Audio", docsUrl: "https://docs.fish.audio/",
  credentialEnv: { apiKey: ["FISH_AUDIO_API_KEY", "FISH_API_KEY"] }, requiredCredentials: ["apiKey"], create: createFishAudioProvider,
};
