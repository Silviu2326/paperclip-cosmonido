import type { ProviderContext, ProviderDefinition, VoiceProvider } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { defaultModel, ELEVENLABS_MODELS } from "./models.js";
import { getVoice, listVoices } from "./voices.js";
import { synthesize, synthesizeStream } from "./tts.js";
import { cloneVoice, deleteVoice, updateVoice } from "./cloning.js";
import { designVoice, saveDesignedVoice } from "./design.js";
import { speechToSpeech } from "./sts.js";
import { getSubscription } from "./extras.js";

/** Create a dependency-free ElevenLabs provider using only the injected credentials and fetch. */
export function createElevenLabsProvider(ctx: ProviderContext): VoiceProvider {
  return {
    id: "elevenlabs", name: "ElevenLabs",
    capabilities: { synthesize: true, streaming: true, timestamps: true, ssml: false, emotionTags: true,
      instantClone: true, professionalClone: true, voiceDesign: true, speechToSpeech: true, voiceLibrary: true,
      pronunciationDictionary: true, formats: ["mp3", "pcm", "mulaw", "alaw", "opus"],
      languages: [...new Set(ELEVENLABS_MODELS.flatMap(model => model.languages))], maxInputChars: 40000 },
    listModels: async () => ELEVENLABS_MODELS.map(model => ({ ...model, languages: [...model.languages] })),
    defaultModel,
    listVoices: query => listVoices(ctx, query), getVoice: id => getVoice(ctx, id),
    synthesize: request => synthesize(ctx, request), synthesizeStream: request => synthesizeStream(ctx, request),
    cloneVoice: request => cloneVoice(ctx, request), updateVoice: (id, request) => updateVoice(ctx, id, request),
    deleteVoice: (id, signal) => deleteVoice(ctx, id, signal), designVoice: request => designVoice(ctx, request),
    saveDesignedVoice: (id, name, description) => saveDesignedVoice(ctx, id, name, description),
    speechToSpeech: request => speechToSpeech(ctx, request),
    healthcheck: async signal => {
      try {
        const subscription = await getSubscription(ctx, signal);
        return { ok: true, detail: `${subscription.tier}: ${subscription.character_count}/${subscription.character_limit} characters used` };
      } catch (error) {
        if (error instanceof VoiceEngineError && error.code === "aborted") throw error;
        return { ok: false, detail: error instanceof Error ? error.message : "ElevenLabs health check failed" };
      }
    },
  };
}

/** ElevenLabs registration and credential environment aliases. */
export const elevenLabsProvider: ProviderDefinition = {
  id: "elevenlabs", name: "ElevenLabs", docsUrl: "https://elevenlabs.io/docs/api-reference",
  credentialEnv: { apiKey: ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY", "XI_API_KEY"] },
  requiredCredentials: ["apiKey"], create: createElevenLabsProvider,
};

export { ELEVENLABS_MODELS, defaultModel } from "./models.js";
export { DEFAULT_OUTPUT_FORMAT, fromOutputFormat, toOutputFormat } from "./formats.js";
export { listVoices, getVoice, searchVoiceLibrary, addSharedVoice, normalizeVoice, voiceStatus } from "./voices.js";
export type { ElevenLabsVoiceQuery, VoiceLibraryQuery } from "./voices.js";
export { getProfessionalVoiceCaptcha, verifyProfessionalVoice, requestProfessionalVoiceVerification, trainProfessionalVoice } from "./cloning.js";
export * from "./extras.js";
