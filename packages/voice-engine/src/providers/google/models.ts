import type { ModelDescriptor, ModelTier } from "../../core/types.js";

export const GOOGLE_LANGUAGES = "ar bg bn ca cmn cs da de el en es eu fi fil fr gl gu he hi hu id is it ja kn ko lt lv ml mr ms nb nl pa pl pt ro ru sk sr sv ta te th tr uk ur vi yue".split(" ");
const geminiLanguages = "ar bn de en es fr gu hi id it ja kn ko ml mr nl pl pt ro ru ta te th tr uk vi".split(" ");

/** Cloud TTS voice families; Gemini prices are token-based, so no character tariff is asserted. */
export const GOOGLE_MODELS: ModelDescriptor[] = [
  ["gemini-2.5-pro-tts", "Gemini 2.5 Pro TTS", "flagship", undefined],
  ["gemini-2.5-flash-tts", "Gemini 2.5 Flash TTS", "fast", undefined],
  ["chirp3-hd", "Chirp 3 HD", "balanced", 30], ["neural2", "Neural2", "balanced", 16],
  ["studio", "Studio", "flagship", 160], ["wavenet", "WaveNet", "legacy", 16], ["standard", "Standard", "legacy", 4],
].map(([id, name, tier, price]) => {
  const gemini = String(id).startsWith("gemini-");
  const ssml = !gemini && id !== "chirp3-hd";
  return { provider: "google", id: id as string, name: name as string, tier: tier as ModelTier,
    languages: gemini ? geminiLanguages : GOOGLE_LANGUAGES, latency: id === "studio" ? "standard" : "low",
    supportsStreaming: true, supportsTimestamps: ssml && id !== "studio", supportsSsml: ssml, supportsEmotionTags: gemini,
    maxInputChars: 5000, usdPerMillionChars: price as number | undefined,
    notes: "2026-10-22: https://cloud.google.com/text-to-speech/pricing ; character estimates exclude free tiers. Gemini uses token billing. Streaming here is sequential sentence REST synthesis, not native bidirectional gRPC. SSML_MARK availability depends on voice family; Studio excludes marks.",
  };
});

/** Infer the voice family without changing a caller-selected voice. */
export function voiceFamily(name: string): string | undefined {
  if (/Chirp3-HD/i.test(name)) return "chirp3-hd";
  for (const family of ["neural2", "studio", "wavenet", "standard", "polyglot", "journey", "casual", "news"]) {
    if (name.toLowerCase().includes(`-${family}-`)) return family;
  }
  return undefined;
}
