import type { ModelDescriptor, ModelTier } from "../../core/types.js";

const multilingual = "en ja zh de hi fr ko pt it es id nl tr fil pl sv bg ro ar cs el fi hr ms sk da ta uk ru".split(" ");
const extended = [...multilingual, "hu", "no", "vi"];
const v3 = "af ar hy as ast az be bn bs bg my yue ca ceb ny hr cs da nl en et fil fi fr gl ka de el gu ha he hi hu is id ga it ja jv kn kk ky ko lv ln lt lb mk ms ml mt zh mi mr mn ne no oc or ps fa pl pt pa ro ru sr sd sk sl so es sw sv tg ta te th tr uk ur uz vi cy yo".split(" ");
const pricing = "2026-10-22: plan-dependent credits; voice multipliers and subscription tiers affect cost. https://elevenlabs.io/pricing/api";

function model(id: string, name: string, tier: ModelTier, languages: string[], maxInputChars: number | undefined, notes: string, sts = false): ModelDescriptor {
  return { provider: "elevenlabs", id, name, tier, languages: [...languages],
    latency: tier === "fast" ? "low" : "standard", supportsStreaming: true,
    supportsTimestamps: !sts, supportsSsml: false, supportsEmotionTags: id === "eleven_v3",
    maxInputChars, notes: `${notes} ${pricing}` };
}

/** Requested ElevenLabs TTS and voice-changer lineup; prices intentionally remain plan dependent. */
export const ELEVENLABS_MODELS: ModelDescriptor[] = [
  model("eleven_v3", "Eleven v3", "flagship", v3, 5000, "70+ languages; emotion/audio tags such as [whispers] and [laughs]. HTTP output streaming, not realtime input streaming."),
  model("eleven_multilingual_v2", "Eleven Multilingual v2", "balanced", multilingual, 10000, "29 languages; most stable long-form model; no language_code parameter."),
  model("eleven_flash_v2_5", "Eleven Flash v2.5", "fast", extended, 40000, "32 languages; approximately 75ms model inference latency, excluding network time."),
  model("eleven_flash_v2", "Eleven Flash v2", "fast", ["en"], 40000, "English-only Flash."),
  model("eleven_turbo_v2_5", "Eleven Turbo v2.5", "fast", extended, 40000, "32 languages; Turbo quality/latency tradeoff."),
  model("eleven_turbo_v2", "Eleven Turbo v2", "fast", ["en"], 40000, "English-only Turbo; retained for compatibility."),
  model("eleven_monolingual_v1", "Eleven English v1", "legacy", ["en"], 10000, "Legacy English model; availability depends on the account."),
  model("eleven_multilingual_sts_v2", "Eleven Multilingual Speech to Speech v2", "balanced", multilingual, undefined, "Speech-to-speech only; input limits are audio based, not character based.", true),
  model("eleven_english_sts_v2", "Eleven English Speech to Speech v2", "legacy", ["en"], undefined, "English speech-to-speech only; not a TTS model.", true),
];

/** Normalize a BCP-47 language to the language code used for model selection. */
export function languageCode(language: string): string {
  const base = language.replace(/_/g, "-").split("-")[0].toLowerCase();
  return ({ tl: "fil", nb: "no", nn: "no", iw: "he" } as Record<string, string>)[base] ?? base;
}

/** Select the requested tier, upgrading when its model cannot speak the requested language. */
export function defaultModel(options: { language?: string; tier?: ModelTier } = {}): string {
  const language = options.language ? languageCode(options.language) : undefined;
  if (options.tier === "flagship" || (language && v3.includes(language) && !extended.includes(language))) return "eleven_v3";
  if (options.tier === "fast" || (language && extended.includes(language) && !multilingual.includes(language))) return "eleven_flash_v2_5";
  if (options.tier === "legacy" && (!language || language === "en")) return "eleven_monolingual_v1";
  return "eleven_multilingual_v2";
}
