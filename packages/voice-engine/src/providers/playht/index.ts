import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { PLAYHT_LANGUAGES, PLAYHT_MODELS } from "./models.js";
import { listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
import { cloneVoice, deleteVoice } from "./cloning.js";

export { PLAYHT_MODELS } from "./models.js";
export { synthesizeJob, synthesizeDialog } from "./extras.js";
export type { DialogTurn } from "./extras.js";

/** Create a PlayHT adapter using an API key and user ID. */
export function createPlayHtProvider(ctx: ProviderContext): VoiceProvider {
  return { id: "playht", name: "PlayHT", capabilities: {
    synthesize: true, streaming: true, timestamps: false, ssml: false, emotionTags: true,
    instantClone: true, professionalClone: false, voiceDesign: false, speechToSpeech: false,
    voiceLibrary: true, pronunciationDictionary: false, formats: ["mp3", "wav", "ogg", "flac", "mulaw", "pcm"], languages: [...PLAYHT_LANGUAGES], maxInputChars: 20000,
  }, listModels: async () => PLAYHT_MODELS.map(model => ({ ...model, languages: [...model.languages] })),
  listVoices: query => listVoices(ctx, query), getVoice: async id => (await listVoices(ctx)).find(voice => voice.providerVoiceId === id),
  defaultModel: options => options?.tier === "flagship" ? "PlayDialog" : options?.tier === "balanced" ? "PlayDialogMultilingual" : options?.tier === "legacy" ? "Play3.0" : "Play3.0-mini",
  synthesize: input => synthesize(ctx, input), synthesizeStream: input => synthesizeStream(ctx, input),
  cloneVoice: input => cloneVoice(ctx, input), deleteVoice: (id, signal) => deleteVoice(ctx, id, signal) };
}

/** PlayHT registration, including both API-key environment aliases. */
export const playHtProvider: ProviderDefinition = { id: "playht", name: "PlayHT", docsUrl: "https://docs.play.ht", credentialEnv: { apiKey: ["PLAYHT_API_KEY", "PLAY_HT_API_KEY"], userId: ["PLAYHT_USER_ID"] }, requiredCredentials: ["apiKey", "userId"], create: createPlayHtProvider };
