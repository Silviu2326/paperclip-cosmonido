import type { ModelDescriptor } from "../../core/types.js";

export const CARTESIA_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "hi", "nl", "pl", "ru", "sv", "tr", "ar", "bg", "ca", "cs", "da", "el", "fi", "he", "hr", "hu", "id", "ms", "no", "ro", "sk", "sl", "ta", "th", "uk", "vi", "bn", "te", "tl", "ml", "mr", "gu"];

/** Requested Sonic catalog; prices are estimates, not account billing quotes. */
export const CARTESIA_MODELS: ModelDescriptor[] = [
  ["sonic-3", "Sonic 3", "flagship"], ["sonic-2", "Sonic 2", "balanced"],
  ["sonic-turbo", "Sonic Turbo", "fast"], ["sonic-english", "Sonic English", "legacy"],
  ["sonic-multilingual", "Sonic Multilingual", "legacy"],
].map(([id, name, tier]) => ({
  provider: "cartesia", id, name, tier: tier as ModelDescriptor["tier"],
  languages: id === "sonic-english" ? ["en"] : id === "sonic-3" ? [...CARTESIA_LANGUAGES] : CARTESIA_LANGUAGES.slice(0, 16),
  latency: "realtime", supportsStreaming: true, supportsTimestamps: true, supportsSsml: false,
  supportsEmotionTags: true, usdPerMillionChars: 50,
  notes: "2026-10-22: approximate PAYG $50/1M characters; verify https://cartesia.ai/pricing. Sonic 3: 40+ languages, emotion/laughter tags, volume/speed, advertised ~90ms. Legacy availability varies.",
}));
