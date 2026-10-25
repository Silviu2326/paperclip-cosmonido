import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { AZURE_LANGUAGES, AZURE_MODELS, defaultModel } from "./models.js";
import { listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
import { cloneVoice, getPersonalVoice } from "./clone.js";
export { AZURE_MODELS } from "./models.js";
export { getPersonalVoice } from "./clone.js";

/** Create the Azure REST adapter with optional Personal Voice enrollment. */
export function createAzureProvider(ctx: ProviderContext): VoiceProvider {
  const jobs = new Map<string, string>();
  return { id: "azure", name: "Azure AI Speech", capabilities: {
    synthesize: true, streaming: true, timestamps: false, ssml: true, emotionTags: true,
    instantClone: true, professionalClone: false, voiceDesign: false, speechToSpeech: false,
    voiceLibrary: true, pronunciationDictionary: true, formats: ["mp3", "wav", "pcm", "opus", "ogg", "mulaw", "alaw"], languages: AZURE_LANGUAGES, maxInputChars: 10000,
  }, listModels: async () => structuredClone(AZURE_MODELS), listVoices: query => listVoices(ctx, query), defaultModel,
  getVoice: async id => {
    const job = jobs.get(id);
    if (job || id.startsWith("personal-job:")) {
      const voice = await getPersonalVoice(ctx, job ?? id);
      jobs.set(voice.providerVoiceId, job ?? id.replace(/^personal-job:/, ""));
      return voice;
    }
    return (await listVoices(ctx)).find(v => v.providerVoiceId === id);
  }, synthesize: request => synthesize(ctx, request), synthesizeStream: request => synthesizeStream(ctx, request),
  cloneVoice: async request => {
    const result = await cloneVoice(ctx, request);
    if (result.jobId) { jobs.set(result.voice.providerVoiceId, result.jobId); jobs.set(result.jobId, result.jobId); }
    return result;
  } };
}

/** Registration metadata; region defaults to westeurope. */
export const azureProvider: ProviderDefinition = { id: "azure", name: "Azure AI Speech", docsUrl: "https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech",
  credentialEnv: { apiKey: ["AZURE_SPEECH_KEY", "SPEECH_KEY"], region: ["AZURE_SPEECH_REGION", "SPEECH_REGION"] }, requiredCredentials: ["apiKey"], create: createAzureProvider };
