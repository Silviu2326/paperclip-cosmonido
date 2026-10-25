import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { filterVoices } from "./http.js";
import { OPENAI_LANGUAGES, OPENAI_MODELS } from "./models.js";
import { OPENAI_VOICES } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
export { OPENAI_MODELS } from "./models.js";

/** Create a dependency-free OpenAI Speech API adapter. */
export function createOpenAiProvider(ctx: ProviderContext): VoiceProvider {
  return { id: "openai", name: "OpenAI", capabilities: {
    synthesize: true, streaming: true, timestamps: false, ssml: false, emotionTags: true,
    instantClone: false, professionalClone: false, voiceDesign: false, speechToSpeech: false,
    voiceLibrary: true, pronunciationDictionary: false,
    formats: ["mp3", "opus", "aac", "flac", "wav", "pcm"], languages: OPENAI_LANGUAGES, maxInputChars: 4096,
  }, listModels: async () => structuredClone(OPENAI_MODELS),
  listVoices: async query => filterVoices(structuredClone(OPENAI_VOICES), query),
  getVoice: async id => structuredClone(OPENAI_VOICES.find(v => v.providerVoiceId === id)),
  defaultModel: options => options?.tier === "fast" ? "tts-1" : options?.tier === "balanced" || options?.tier === "legacy" ? "tts-1-hd" : "gpt-4o-mini-tts",
  synthesize: request => synthesize(ctx, request), synthesizeStream: request => synthesizeStream(ctx, request) };
}

/** Registration metadata for API-key credential resolution. */
export const openAiProvider: ProviderDefinition = { id: "openai", name: "OpenAI", docsUrl: "https://developers.openai.com/api/docs/guides/text-to-speech",
  credentialEnv: { apiKey: ["OPENAI_API_KEY"], organization: ["OPENAI_ORGANIZATION"], project: ["OPENAI_PROJECT"], baseUrl: ["OPENAI_BASE_URL"] },
  requiredCredentials: ["apiKey"], create: createOpenAiProvider };
