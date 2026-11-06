import type { ProviderContext, ProviderDefinition, VoiceDescriptor, VoiceProvider } from "../../core/types.js";
import { GOOGLE_LANGUAGES, GOOGLE_MODELS } from "./models.js";
import { listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
import { cloneVoice } from "./clone.js";
export { GOOGLE_MODELS } from "./models.js";

/** Create a Cloud TTS REST adapter using explicitly supplied API-key or OAuth credentials. */
export function createGoogleProvider(ctx: ProviderContext): VoiceProvider {
  const clones = new Map<string, VoiceDescriptor>();
  return { id: "google", name: "Google Cloud Text-to-Speech", capabilities: {
    synthesize: true, streaming: true, timestamps: true, ssml: true, emotionTags: true,
    instantClone: true, professionalClone: false, voiceDesign: false, speechToSpeech: false,
    voiceLibrary: true, pronunciationDictionary: true, formats: ["mp3", "wav", "pcm", "opus", "ogg", "mulaw", "alaw"], languages: GOOGLE_LANGUAGES, maxInputChars: 5000,
  }, listModels: async () => structuredClone(GOOGLE_MODELS), listVoices: query => listVoices(ctx, query),
  getVoice: async id => structuredClone(clones.get(id) ?? (await listVoices(ctx)).find(v => v.providerVoiceId === id)),
  defaultModel: options => options?.tier === "fast" ? "gemini-2.5-flash-tts" : options?.tier === "balanced" ? "chirp3-hd" : options?.tier === "legacy" ? "neural2" : "gemini-2.5-pro-tts",
  synthesize: request => synthesize(ctx, request), synthesizeStream: request => synthesizeStream(ctx, request),
  cloneVoice: async request => { const result = await cloneVoice(ctx, request); clones.set(result.voice.providerVoiceId, result.voice); return result; },
  };
}

/** The contract cannot express OR credentials: calls enforce apiKey OR accessToken. */
export const googleProvider: ProviderDefinition = { id: "google", name: "Google Cloud Text-to-Speech", docsUrl: "https://cloud.google.com/text-to-speech/docs/authentication",
  credentialEnv: { apiKey: ["GOOGLE_TTS_API_KEY", "GOOGLE_API_KEY"], accessToken: ["GOOGLE_ACCESS_TOKEN"], project: ["GOOGLE_CLOUD_PROJECT"] }, requiredCredentials: [], create: createGoogleProvider };
