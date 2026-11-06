import type { ModelDescriptor } from "../../core/types.js";

export const PLAYHT_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "hi", "ar", "nl", "pl", "ru", "sv", "tr", "cs", "da", "el", "fi", "he", "hu", "id", "ms", "no", "ro", "sk", "th", "uk", "vi", "bn", "ta", "te", "ur", "tl", "hr", "bg"];

/** PlayHT engines; pricing is plan dependent and intentionally unspecified. */
export const PLAYHT_MODELS: ModelDescriptor[] = [
  ["Play3.0-mini", "Play 3.0 Mini", "fast"], ["PlayDialog", "Play Dialog", "flagship"],
  ["PlayDialogMultilingual", "Play Dialog Multilingual", "balanced"], ["Play3.0", "Play 3.0", "legacy"],
].map(([id, name, tier]) => ({ provider: "playht", id, name, tier: tier as ModelDescriptor["tier"],
  languages: [...PLAYHT_LANGUAGES], latency: id === "Play3.0-mini" ? "low" : "standard",
  supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: true,
  maxInputChars: id === "Play3.0-mini" ? 20000 : 2000,
  notes: "2026-10-22: plan-dependent pricing, https://play.ht/pricing. PlayDialog supports two-speaker dialogue. PlayDialogMultilingual and Play3.0 are compatibility IDs; confirm account availability.",
}));
