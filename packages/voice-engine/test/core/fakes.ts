import { mimeTypeFor, wavHeader } from "../../src/core/audio.js";
import type { ModelDescriptor, ProviderCapabilities, ProviderContext, ProviderDefinition, ProviderId, SynthesisRequest, SynthesisResult, VoiceDescriptor, VoiceProvider, VoiceRef } from "../../src/core/types.js";

/** Construct a deterministic voice descriptor for catalog and engine tests. */
export function fakeVoice(provider = "fake", overrides: Partial<VoiceDescriptor> = {}): VoiceDescriptor {
  return { id: `${provider}:voice`, provider, providerVoiceId: "voice", name: "Test voice", languages: ["en-US", "es-ES"], gender: "female",
    age: "middle_aged", tags: ["narration"], origin: "premade", models: [], ...overrides };
}

/** Fake provider definition with observable construction, calls and deterministic bytes. */
export function fakeProvider(options: {
  id?: ProviderId; capabilities?: Partial<ProviderCapabilities>; voices?: VoiceDescriptor[];
  models?: ModelDescriptor[]; requiredCredentials?: string[];
  synthesize?: (request: SynthesisRequest & { voice: VoiceRef }, index: number) => Promise<SynthesisResult>;
} = {}) {
  const id = options.id ?? "fake";
  const calls: Array<SynthesisRequest & { voice: VoiceRef }> = [];
  const contexts: ProviderContext[] = [];
  const voices = options.voices ?? [fakeVoice(id)];
  let voiceLists = 0;
  const models: ModelDescriptor[] = options.models ?? [{ provider: id, id: "test-model", name: "Test model", tier: "flagship", languages: [], latency: "low",
    supportsStreaming: false, supportsTimestamps: true, supportsSsml: false, supportsEmotionTags: false, usdPerMillionChars: 20 }];
  const result = (request: SynthesisRequest & { voice: VoiceRef }): SynthesisResult => {
    const format = request.format ?? { container: "mp3", sampleRate: 44100, bitrate: 128 };
    let data = new TextEncoder().encode(request.text);
    if (format.container === "wav") {
      const pcm = new Uint8Array(data.length * 2);
      for (let index = 0; index < data.length; index++) pcm[index * 2] = data[index];
      const header = wavHeader(pcm.length, format);
      data = new Uint8Array([...header, ...pcm]);
    }
    return { audio: { data, mimeType: mimeTypeFor(format), format, durationMs: request.text.length * 100 }, voice: request.voice,
      provider: id, model: request.model ?? "test-model", language: request.language, cached: false, latencyMs: 0,
      timestamps: request.timestamps ? [{ text: request.text, startMs: 0, endMs: request.text.length * 100 }] : undefined,
      usage: { provider: id, model: request.model ?? "test-model", operation: "synthesize", unit: "character", units: request.text.length, estimatedCents: request.text.length * 0.002, pricingSource: "test" } };
  };
  const provider: VoiceProvider = {
    id, name: "Fake provider",
    capabilities: { synthesize: true, streaming: false, timestamps: true, ssml: false, emotionTags: false, instantClone: false,
      professionalClone: false, voiceDesign: false, speechToSpeech: false, voiceLibrary: true, pronunciationDictionary: false,
      formats: ["mp3", "wav", "pcm", "ogg", "opus"], languages: [], maxInputChars: 5000, ...options.capabilities },
    listModels: async () => models,
    listVoices: async () => { voiceLists++; return voices; },
    defaultModel: () => "test-model",
    synthesize: async (request) => { calls.push(request); return options.synthesize ? options.synthesize(request, calls.length) : result(request); },
  };
  const definition: ProviderDefinition = { id, name: "Fake provider", docsUrl: "https://example.test/keys",
    credentialEnv: { apiKey: ["VOICE_TEST_PRIMARY", "VOICE_TEST_SECONDARY"], region: ["VOICE_TEST_REGION"] },
    requiredCredentials: options.requiredCredentials ?? [], create: (ctx) => { contexts.push(ctx); return { ...provider }; } };
  return { definition, provider, calls, contexts, result, models, voices, get voiceLists() { return voiceLists; } };
}
