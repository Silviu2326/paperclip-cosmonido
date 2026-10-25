import type { ModelDescriptor } from "../../core/types.js";

export const LANGUAGES = ["en", "zh", "ja", "de", "fr", "es", "ko", "ar", "ru", "nl", "it", "pl", "pt"];
export const PRICING_SOURCE = "https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits (2026-10-22; UTF-8 bytes)";

/** Requested Fish model catalog; rates use UTF-8 bytes despite the shared field name. */
export const FISH_AUDIO_MODELS: ModelDescriptor[] = [
  { id: "s1", name: "OpenAudio S1", tier: "flagship", latency: "low", usdPerMillionChars: 15,
    notes: `Approximately $15/1M UTF-8 bytes, not characters. ${PRICING_SOURCE}. Requested compatibility model; current docs mark S1 deprecated.` },
  { id: "s1-mini", name: "OpenAudio S1 Mini", tier: "fast", latency: "realtime",
    notes: "2026-10-22: hosted availability and price unverified; no cost estimate. Supports S1 emotion markers." },
  { id: "speech-1.6", name: "Fish Speech 1.6", tier: "balanced", latency: "low",
    notes: "2026-10-22: compatibility model; current hosted pricing is not published here." },
  { id: "speech-1.5", name: "Fish Speech 1.5", tier: "legacy", latency: "standard",
    notes: "2026-10-22: legacy compatibility model; hosted pricing and availability may vary." },
].map(model => ({ ...model, provider: "fish-audio", languages: [...LANGUAGES], supportsStreaming: true,
  supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: model.id.startsWith("s1"), maxInputChars: 15000 } as ModelDescriptor));
