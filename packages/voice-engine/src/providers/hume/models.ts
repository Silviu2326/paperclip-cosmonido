import type { ModelDescriptor } from "../../core/types.js";

export const HUME_LANGUAGES = ["en", "ja", "ko", "es", "fr", "pt", "it", "de", "ru", "hi", "ar"];

/** Octave versions and dated, plan-specific pricing guidance. */
export const HUME_MODELS: ModelDescriptor[] = [
  { provider: "hume", id: "octave-2", name: "Octave 2", tier: "flagship", languages: [...HUME_LANGUAGES], latency: "low",
    supportsStreaming: true, supportsTimestamps: true, supportsSsml: false, supportsEmotionTags: true, maxInputChars: 5000,
    notes: "2026-10-22: Creator-plan reference approximately $0.10/1k characters ($100/1M); https://www.hume.ai/pricing. Actual pricing is plan dependent. Description/acting-instruction support varies by version; see endpoint notes." },
  { provider: "hume", id: "octave", name: "Octave", tier: "legacy", languages: ["en", "es"], latency: "low",
    supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: true, maxInputChars: 5000,
    notes: "Legacy Octave; description-based voice design and acting instructions. Audio cloning is not exposed by this adapter." },
];
