import type { ProviderContext, ProviderDefinition, VoiceDescriptor, VoiceProvider } from "../../core/types.js";
import { HUME_LANGUAGES, HUME_MODELS } from "./models.js";
import { deleteVoice, listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
import { designVoice, saveDesignedVoice } from "./design.js";

export { HUME_MODELS } from "./models.js";

/** Create an Octave adapter with prompt design and saved-voice provider tracking. */
export function createHumeProvider(ctx: ProviderContext): VoiceProvider {
  const known = new Map<string, string>();
  const remember = (voice: VoiceDescriptor) => { known.set(voice.providerVoiceId, String(voice.raw?.provider ?? "HUME_AI")); return voice; };
  const voiceOptions = (id: string, options?: Record<string, unknown>) => ({ voiceProvider: known.get(id) ?? "HUME_AI", ...options });
  return { id: "hume", name: "Hume Octave", capabilities: {
    synthesize: true, streaming: true, timestamps: true, ssml: false, emotionTags: true,
    instantClone: false, professionalClone: false, voiceDesign: true, speechToSpeech: false,
    voiceLibrary: true, pronunciationDictionary: false, formats: ["mp3", "wav", "pcm"], languages: [...HUME_LANGUAGES], maxInputChars: 5000,
  }, listModels: async () => HUME_MODELS.map(model => ({ ...model, languages: [...model.languages] })),
  listVoices: async query => (await listVoices(ctx, query)).map(remember),
  getVoice: async id => (await listVoices(ctx)).map(remember).find(voice => voice.providerVoiceId === id),
  defaultModel: options => options?.tier === "legacy" ? "octave" : "octave-2",
  synthesize: input => synthesize(ctx, { ...input, providerOptions: voiceOptions(input.voice.voiceId, input.providerOptions) }),
  synthesizeStream: input => synthesizeStream(ctx, { ...input, providerOptions: voiceOptions(input.voice.voiceId, input.providerOptions) }),
  designVoice: input => designVoice(ctx, input), saveDesignedVoice: async (id, name, description) => remember(await saveDesignedVoice(ctx, id, name, description)),
  deleteVoice: async (id, signal) => { await deleteVoice(ctx, id, signal); known.delete(id); } };
}

/** Hume API-key registration; audio cloning is intentionally unsupported. */
export const humeProvider: ProviderDefinition = { id: "hume", name: "Hume Octave", docsUrl: "https://dev.hume.ai", credentialEnv: { apiKey: ["HUME_API_KEY"] }, requiredCredentials: ["apiKey"], create: createHumeProvider };
