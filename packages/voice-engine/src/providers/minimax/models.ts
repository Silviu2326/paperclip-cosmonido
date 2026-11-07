import type { ModelDescriptor } from "../../core/types.js";

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", zh: "Chinese", yue: "Chinese,Yue", ja: "Japanese", ko: "Korean", es: "Spanish", pt: "Portuguese",
  fr: "French", de: "German", it: "Italian", ru: "Russian", ar: "Arabic", tr: "Turkish", nl: "Dutch", uk: "Ukrainian",
  vi: "Vietnamese", id: "Indonesian", th: "Thai", pl: "Polish", ro: "Romanian", el: "Greek", cs: "Czech", fi: "Finnish",
  hi: "Hindi", bg: "Bulgarian", da: "Danish", he: "Hebrew", ms: "Malay", sk: "Slovak", sv: "Swedish", hr: "Croatian",
  hu: "Hungarian", no: "Norwegian", sl: "Slovenian", ca: "Catalan", nn: "Nynorsk", af: "Afrikaans",
};
export const LANGUAGES = Object.keys(LANGUAGE_NAMES);
export const PRICING_SOURCE = "https://platform.minimax.io/docs/pricing/overview (2026-10-22)";

/** Requested MiniMax compatibility catalog; unverified model prices remain unknown. */
export const MINIMAX_MODELS: ModelDescriptor[] = [
  { id: "speech-2.5-hd-preview", name: "Speech 2.5 HD Preview", tier: "flagship", latency: "standard",
    notes: "2026-10-22: requested preview identifier; current docs list later versions. Availability and price unverified." },
  { id: "speech-2.5-turbo-preview", name: "Speech 2.5 Turbo Preview", tier: "fast", latency: "low",
    notes: "2026-10-22: requested preview identifier; current docs list later versions. Availability and price unverified." },
  { id: "speech-02-hd", name: "Speech 02 HD", tier: "flagship", latency: "standard", usdPerMillionChars: 100,
    notes: `$100/1M characters (pay-as-you-go). ${PRICING_SOURCE}` },
  { id: "speech-02-turbo", name: "Speech 02 Turbo", tier: "fast", latency: "low", usdPerMillionChars: 60,
    notes: `$60/1M characters (pay-as-you-go). ${PRICING_SOURCE}` },
  { id: "speech-01-hd", name: "Speech 01 HD", tier: "legacy", latency: "standard",
    notes: "2026-10-22: legacy model; price not confirmed in the current public rate card." },
  { id: "speech-01-turbo", name: "Speech 01 Turbo", tier: "legacy", latency: "low",
    notes: "2026-10-22: legacy model; price not confirmed in the current public rate card." },
].map(model => ({ ...model, provider: "minimax", languages: [...LANGUAGES], supportsStreaming: true,
  supportsTimestamps: true, supportsSsml: false, supportsEmotionTags: false, maxInputChars: 10000 } as ModelDescriptor));
