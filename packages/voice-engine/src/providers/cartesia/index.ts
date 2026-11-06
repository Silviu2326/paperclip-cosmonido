import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { CARTESIA_LANGUAGES, CARTESIA_MODELS } from "./models.js";
import { getVoice, listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
import { cloneVoice, deleteVoice, speechToSpeech, updateVoice } from "./cloning.js";

export { CARTESIA_MODELS } from "./models.js";
export { localizeVoice, mixVoices, infillAudio, createPronunciationDict } from "./extras.js";

/** Create a dependency-free Cartesia adapter bound to injected credentials/transport. */
export function createCartesiaProvider(ctx: ProviderContext): VoiceProvider {
  return { id: "cartesia", name: "Cartesia", capabilities: {
    synthesize: true, streaming: true, timestamps: true, ssml: false, emotionTags: true,
    instantClone: true, professionalClone: false, voiceDesign: false, speechToSpeech: true,
    voiceLibrary: true, pronunciationDictionary: true, formats: ["mp3", "wav", "pcm", "mulaw", "alaw"],
    languages: [...CARTESIA_LANGUAGES], maxInputChars: 10000,
  }, listModels: async () => CARTESIA_MODELS.map(model => ({ ...model, languages: [...model.languages] })),
  listVoices: query => listVoices(ctx, query), getVoice: id => getVoice(ctx, id),
  defaultModel: options => options?.tier === "fast" ? "sonic-turbo" : options?.tier === "balanced" ? "sonic-2" : options?.tier === "legacy" ? "sonic-multilingual" : "sonic-3",
  synthesize: input => synthesize(ctx, input), synthesizeStream: input => synthesizeStream(ctx, input),
  cloneVoice: input => cloneVoice(ctx, input), updateVoice: (id, input) => updateVoice(ctx, id, input),
  deleteVoice: (id, signal) => deleteVoice(ctx, id, signal), speechToSpeech: input => speechToSpeech(ctx, input) };
}

/** Cartesia registration and environment credential aliases. */
export const cartesiaProvider: ProviderDefinition = { id: "cartesia", name: "Cartesia", docsUrl: "https://docs.cartesia.ai", credentialEnv: { apiKey: ["CARTESIA_API_KEY"] }, requiredCredentials: ["apiKey"], create: createCartesiaProvider };
