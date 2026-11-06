import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { DEEPGRAM_MODELS } from "./models.js";
import { listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";

export { DEEPGRAM_MODELS } from "./models.js";
export { DEEPGRAM_VOICES } from "./voices.js";

/** Create the Aura adapter with optional remote catalog enrichment. */
export function createDeepgramProvider(ctx: ProviderContext): VoiceProvider {
  return { id: "deepgram", name: "Deepgram Aura", capabilities: {
    synthesize: true, streaming: true, timestamps: false, ssml: false, emotionTags: false,
    instantClone: false, professionalClone: false, voiceDesign: false, speechToSpeech: false,
    voiceLibrary: true, pronunciationDictionary: false, formats: ["wav", "pcm", "mulaw", "alaw", "mp3", "opus", "ogg", "flac", "aac"], languages: ["en", "es"], maxInputChars: 2000,
  }, listModels: async () => DEEPGRAM_MODELS.map(model => ({ ...model, languages: [...model.languages] })),
  listVoices: query => listVoices(ctx, query), getVoice: async id => (await listVoices(ctx)).find(voice => voice.providerVoiceId === id),
  defaultModel: options => options?.tier === "legacy" && (!options.language || options.language.startsWith("en")) ? "aura-1" : "aura-2",
  synthesize: input => synthesize(ctx, input), synthesizeStream: input => synthesizeStream(ctx, input) };
}

/** Deepgram token credential registration. */
export const deepgramProvider: ProviderDefinition = { id: "deepgram", name: "Deepgram Aura", docsUrl: "https://developers.deepgram.com", credentialEnv: { apiKey: ["DEEPGRAM_API_KEY"] }, requiredCredentials: ["apiKey"], create: createDeepgramProvider };
