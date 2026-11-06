import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { LANGUAGES, MINIMAX_MODELS } from "./models.js";
import { synthesize, synthesizeStream } from "./synthesis.js";
import { fetchVoices, listVoices } from "./voices.js";
import { cloneVoice, deleteVoice, designVoice, saveDesignedVoice } from "./cloning.js";

export { MINIMAX_MODELS } from "./models.js";

/** Create a dependency-free MiniMax HTTP/SSE adapter for global or China endpoints. */
export function createMinimaxProvider(ctx: ProviderContext): VoiceProvider {
  return { id: "minimax", name: "MiniMax",
    capabilities: { synthesize: true, streaming: true, timestamps: true, ssml: false, emotionTags: false,
      instantClone: true, professionalClone: false, voiceDesign: true, speechToSpeech: false, voiceLibrary: true,
      pronunciationDictionary: true, formats: ["mp3", "pcm", "wav", "flac"], languages: [...LANGUAGES], maxInputChars: 10000 },
    async listModels() { return MINIMAX_MODELS.map(model => ({ ...model, languages: [...model.languages] })); },
    defaultModel(options) { return options?.tier === "legacy" ? "speech-01-hd" : options?.tier === "fast" || options?.tier === "balanced" ? "speech-02-turbo" : "speech-02-hd"; },
    listVoices: query => listVoices(ctx, query),
    async getVoice(id) { return (await listVoices(ctx)).find(voice => voice.providerVoiceId === id); },
    synthesize: request => synthesize(ctx, request), synthesizeStream: request => synthesizeStream(ctx, request),
    cloneVoice: request => cloneVoice(ctx, request), deleteVoice: (id, signal) => deleteVoice(ctx, id, signal),
    designVoice: request => designVoice(ctx, request), saveDesignedVoice,
    async healthcheck(signal) { await fetchVoices(ctx, signal); return { ok: true }; },
  };
}

/** MiniMax registration; GroupId remains optional for accounts whose endpoints need it. */
export const minimaxProvider: ProviderDefinition = { id: "minimax", name: "MiniMax", docsUrl: "https://platform.minimax.io/docs/",
  credentialEnv: { apiKey: ["MINIMAX_API_KEY"], groupId: ["MINIMAX_GROUP_ID"] }, requiredCredentials: ["apiKey"], create: createMinimaxProvider };
