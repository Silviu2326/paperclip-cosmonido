import { vi } from "vitest";
import type { AudioOutput, EngineEvent, EngineEventListener, ProviderCapabilities, ProviderDefinition, SynthesisRequest, SynthesisResult, UsageRecord, VoiceDescriptor, VoiceEngine, VoiceProvider } from "../../src/core/types.js";

export const fakeVoice: VoiceDescriptor = { id: "fake:alice", provider: "fake", providerVoiceId: "alice", name: "Alice", languages: ["es-ES", "en-US"], gender: "female", age: "middle_aged", tags: ["narration", "calm"], origin: "premade", models: ["fake-tts"] };
export const fakeAudio: AudioOutput = { data: new Uint8Array([82, 73, 70, 70]), mimeType: "audio/mpeg", format: { container: "mp3" } };
export const fakeUsage: UsageRecord = { provider: "fake", model: "fake-tts", operation: "synthesize", unit: "character", units: 5, estimatedCents: 0.025, pricingSource: "fixture rate card" };
export const fakeCapabilities: ProviderCapabilities = { synthesize: true, streaming: true, timestamps: true, ssml: false, emotionTags: false, instantClone: true, professionalClone: true, voiceDesign: true, speechToSpeech: true, voiceLibrary: true, pronunciationDictionary: false, formats: ["mp3", "wav"], languages: ["es-ES", "en-US"], maxInputChars: 2000 };
export const fakeDefinition: ProviderDefinition = { id: "fake", name: "Fake Voice", docsUrl: "https://example.test/voice", credentialEnv: { apiKey: ["FAKE_API_KEY", "FAKE_KEY"], region: ["FAKE_REGION"] }, requiredCredentials: ["apiKey"], create: () => { throw new Error("Fake engine must not instantiate definitions"); } };

/** Create a complete contract-only engine with observable calls and controllable events. */
export function createFakeEngine(overrides: Partial<VoiceEngine> = {}): VoiceEngine & { emit(event: EngineEvent): void } {
  const listeners = new Set<EngineEventListener>();
  const result = (request?: SynthesisRequest): SynthesisResult => ({ audio: fakeAudio, voice: { provider: "fake", voiceId: "alice" }, model: "fake-tts", provider: "fake", timestamps: [{ text: "Hello", startMs: 0, endMs: 100 }], usage: { ...fakeUsage, units: request?.text.length ?? 5 }, cached: false, latencyMs: 12 });
  const provider: VoiceProvider = { id: "fake", name: "Fake Voice", capabilities: fakeCapabilities,
    listModels: vi.fn(async () => []), listVoices: vi.fn(async () => [fakeVoice]), defaultModel: () => "fake-tts", synthesize: vi.fn(async request => result(request)), healthcheck: vi.fn(async () => ({ ok: true, detail: "Healthy" })) };
  const engine: VoiceEngine & { emit(event: EngineEvent): void } = {
    providers: vi.fn(() => [fakeDefinition]), provider: vi.fn(async () => provider), availableProviders: vi.fn(async () => ["fake"]),
    listModels: vi.fn<VoiceEngine["listModels"]>(async () => [{ id: "fake-tts", provider: "fake", name: "Fake TTS", tier: "balanced", languages: ["es-ES"], latency: "low", supportsStreaming: true, supportsTimestamps: true, supportsSsml: false, supportsEmotionTags: false, usdPerMillionChars: 5 }]),
    listVoices: vi.fn(async () => [fakeVoice]), getVoice: vi.fn(async () => fakeVoice), recommendVoice: vi.fn(async () => fakeVoice),
    synthesize: vi.fn(async request => result(request)), synthesizeLong: vi.fn(async request => result(request)),
    synthesizeStream: vi.fn(async function* () { yield { audio: new Uint8Array([1, 2]), timestamps: [{ text: "Hello", startMs: 0, endMs: 100 }] }; yield { audio: new Uint8Array([3, 4]) }; }),
    cloneVoice: vi.fn<VoiceEngine["cloneVoice"]>(async () => ({ voice: { ...fakeVoice, origin: "cloned" }, status: "ready" })),
    updateVoice: vi.fn(async () => fakeVoice), deleteVoice: vi.fn(async () => {}),
    designVoice: vi.fn(async () => ({ candidates: [{ candidateId: "candidate-1", preview: fakeAudio }, { candidateId: "candidate-2", preview: fakeAudio }], usage: fakeUsage })),
    saveDesignedVoice: vi.fn<VoiceEngine["saveDesignedVoice"]>(async () => ({ ...fakeVoice, origin: "designed" })), speechToSpeech: vi.fn(async () => result()),
    estimateCost: vi.fn(async request => ({ ...fakeUsage, units: request.text.length })),
    on: vi.fn(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }),
    emit: event => { for (const listener of listeners) listener(event); }, ...overrides,
  };
  return engine;
}
