import type { ModelDescriptor } from "../../core/types.js";

/** Aura voice families; each actual voice ID is passed as the Speak model. */
export const DEEPGRAM_MODELS: ModelDescriptor[] = [
  { provider: "deepgram", id: "aura-2", name: "Aura 2", tier: "flagship", languages: ["en", "es"], latency: "low",
    supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: false, maxInputChars: 2000, usdPerMillionChars: 30,
    notes: "2026-10-22: $0.030/1k characters ($30/1M), https://deepgram.com/pricing; plan discounts vary. The voice is the API model. VoiceSettings (including speed) are unsupported by Aura." },
  { provider: "deepgram", id: "aura-1", name: "Aura 1", tier: "legacy", languages: ["en"], latency: "low",
    supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: false, maxInputChars: 2000,
    notes: "Legacy Aura family. VoiceSettings are unsupported. Account-dependent availability/pricing." },
];
