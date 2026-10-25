import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { endpoint, headers } from "./api.js";
import { filterVoices, jsonHttp } from "./http.js";
import { voiceFamily } from "./models.js";

/** Normalize Cloud TTS voice metadata, preserving native sample-rate information. */
export function normalizeVoice(raw: Record<string, unknown>): VoiceDescriptor {
  const name = String(raw.name ?? "");
  const family = voiceFamily(name);
  const isGemini = ["Kore", "Puck", "Charon", "Aoede", "Leda", "Orus", "Zephyr"].includes(name);
  const gender = String(raw.ssmlGender).toLowerCase();
  return { id: `google:${name}`, provider: "google", providerVoiceId: name, name,
    languages: Array.isArray(raw.languageCodes) ? raw.languageCodes.filter((l): l is string => typeof l === "string") : [],
    gender: gender === "male" || gender === "female" || gender === "neutral" ? gender : "unknown", age: "unknown",
    tags: family ? [family] : isGemini ? ["gemini", "prompt-steerable"] : [], origin: "premade",
    models: family ? [family] : isGemini ? ["gemini-2.5-pro-tts", "gemini-2.5-flash-tts"] : [], raw };
}

const fallback: [string, string][] = [
  ["es-ES-Chirp3-HD-Aoede", "FEMALE"], ["es-ES-Neural2-A", "FEMALE"], ["es-US-Neural2-B", "MALE"], ["es-ES-Standard-A", "FEMALE"],
  ["en-US-Chirp3-HD-Kore", "FEMALE"], ["en-US-Neural2-F", "FEMALE"], ["en-US-Neural2-D", "MALE"], ["en-US-Studio-O", "FEMALE"],
  ["en-US-Wavenet-D", "MALE"], ["en-GB-Neural2-A", "FEMALE"], ["en-US-Standard-C", "FEMALE"],
  ["pt-BR-Neural2-A", "FEMALE"], ["pt-BR-Neural2-B", "MALE"], ["pt-BR-Chirp3-HD-Aoede", "FEMALE"],
  ["fr-FR-Neural2-A", "FEMALE"], ["fr-FR-Neural2-B", "MALE"], ["de-DE-Neural2-A", "FEMALE"], ["de-DE-Neural2-B", "MALE"],
  ["ja-JP-Neural2-B", "FEMALE"], ["ja-JP-Neural2-C", "MALE"],
];
const gemini: [string, string][] = [["Kore", "FEMALE"], ["Puck", "MALE"], ["Charon", "MALE"], ["Aoede", "FEMALE"], ["Leda", "FEMALE"], ["Orus", "MALE"], ["Zephyr", "FEMALE"]];
export const GOOGLE_VOICES: VoiceDescriptor[] = [
  ...fallback.map(([name, ssmlGender]) => normalizeVoice({ name, ssmlGender, languageCodes: [name.split("-").slice(0, 2).join("-")], naturalSampleRateHertz: 24000 })),
  ...gemini.map(([name, ssmlGender]) => ({ ...normalizeVoice({ name, ssmlGender, languageCodes: [] }), tags: ["gemini", "prompt-steerable"], models: ["gemini-2.5-pro-tts", "gemini-2.5-flash-tts"] })),
];

/** Fetch the live catalog; preserve auth failures and use fallback only for transient outages. */
export async function listVoices(ctx: ProviderContext, query?: VoiceQuery): Promise<VoiceDescriptor[]> {
  const auth = headers(ctx);
  try {
    const data = await jsonHttp<{ voices?: Record<string, unknown>[] }>(ctx, endpoint(ctx, `/voices${query?.language ? `?languageCode=${encodeURIComponent(query.language)}` : ""}`), { headers: auth });
    if (!Array.isArray(data.voices)) throw new VoiceEngineError("Invalid Google voice catalog", { provider: "google", code: "provider_unavailable" });
    const voices = data.voices.map(normalizeVoice);
    // Some regional catalogs do not enumerate Gemini's short, multilingual voice names.
    for (const voice of GOOGLE_VOICES.filter(v => v.models.includes("gemini-2.5-pro-tts"))) {
      if (!voices.some(v => v.providerVoiceId === voice.providerVoiceId)) voices.push(structuredClone(voice));
    }
    return filterVoices(voices, query);
  } catch (error) {
    if (!(error instanceof VoiceEngineError) || !["provider_unavailable", "timeout"].includes(error.code)) throw error;
    ctx.logger?.warn("Google voice catalog unavailable; using static fallback", { code: error.code });
    return filterVoices(structuredClone(GOOGLE_VOICES), query);
  }
}
