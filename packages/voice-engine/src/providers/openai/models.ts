import type { ModelDescriptor } from "../../core/types.js";

export const OPENAI_LANGUAGES = "af ar hy az be bs bg ca zh hr cs da nl en et fi fr gl de el he hi hu is id it ja kn kk ko lv lt mk ms mr mi ne no fa pl pt ro ru sr sk sl es sw sv tl ta th tr uk ur vi cy".split(" ");
const pricingNote = "2026-10-22: https://developers.openai.com/api/docs/models/gpt-4o-mini-tts ; requested Speech API models are deprecated, shutdown 2027-01-06.";

/** Speech API models; the mini character price is only a routing estimate. */
export const OPENAI_MODELS: ModelDescriptor[] = [
  { provider: "openai", id: "gpt-4o-mini-tts", name: "GPT-4o Mini TTS", tier: "flagship", languages: OPENAI_LANGUAGES, latency: "low", supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: true, maxInputChars: 4096, usdPerMillionChars: 12, notes: `${pricingNote} Billed at $0.60/M input text TOKENS and $12/M output audio TOKENS; $12/M characters is an approximate budget heuristic, not a published character tariff.` },
  { provider: "openai", id: "tts-1-hd", name: "TTS-1 HD", tier: "balanced", languages: OPENAI_LANGUAGES, latency: "standard", supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: false, maxInputChars: 4096, usdPerMillionChars: 30, notes: `${pricingNote} $30/M characters; https://developers.openai.com/api/docs/pricing` },
  { provider: "openai", id: "tts-1", name: "TTS-1", tier: "fast", languages: OPENAI_LANGUAGES, latency: "low", supportsStreaming: true, supportsTimestamps: false, supportsSsml: false, supportsEmotionTags: false, maxInputChars: 4096, usdPerMillionChars: 15, notes: `${pricingNote} $15/M characters; https://developers.openai.com/api/docs/pricing` },
];
