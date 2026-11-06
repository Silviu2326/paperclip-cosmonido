import type { ModelDescriptor, ModelTier } from "../../core/types.js";

export const AZURE_LANGUAGES = "ar bg ca cs da de el en es et fi fr he hi hr hu id it ja ko lt lv ms nb nl pl pt ro ru sk sl sv sw ta te th tr uk vi zh".split(" ");
const hdLanguages = new Set(["en", "es", "de", "fr", "it", "ja", "ko", "zh"]);

/** Pick an HD family only for the conservative known-language subset. */
export function defaultModel(options?: { language?: string; tier?: ModelTier }): string {
  if (options?.tier === "fast" || options?.tier === "legacy") return "neural";
  return hdLanguages.has((options?.language ?? "en").split("-")[0].toLowerCase()) ? "neural-hd" : "neural";
}

/** Azure models describe voice families; the chosen voice determines the actual engine. */
export const AZURE_MODELS: ModelDescriptor[] = [
  ["neural", "Neural", "balanced", 15], ["neural-hd", "Neural HD", "flagship", 30],
  ["multilingual", "Multilingual Neural", "balanced", 15], ["custom-neural", "Custom Neural Voice", "legacy", undefined],
].map(([id, name, tier, price]) => ({ provider: "azure", id: id as string, name: name as string, tier: tier as ModelTier,
  languages: id === "neural-hd" ? [...hdLanguages] : AZURE_LANGUAGES,
  latency: "low", supportsStreaming: true, supportsTimestamps: false, supportsSsml: true,
  supportsEmotionTags: true, maxInputChars: 10000, usdPerMillionChars: price as number | undefined,
  notes: "2026-10-22 budget estimates in USD/M characters; region/tier dependent: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/ . REST has no word-boundary events (SDK/WebSocket only). Family selection never rewrites an explicit voice name.",
}));
