import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { age, filterVoices, gender, json, object } from "./http.js";

const languages: Record<string, string> = { english: "en", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", chinese: "zh", mandarin: "zh", japanese: "ja", korean: "ko", hindi: "hi", arabic: "ar" };

/** Normalize both premade and cloned PlayHT voice shapes. */
export function normalizeVoice(value: unknown, cloned = false): VoiceDescriptor {
  const raw = object(value), id = String(raw.id ?? raw.voice_id ?? "");
  const language = String(raw.language_code ?? raw.language ?? "");
  const tag = languages[language.toLowerCase()] ?? (/^[a-z]{2,3}(?:[-_][a-zA-Z0-9]+)*$/.test(language) ? language.replaceAll("_", "-") : "");
  return { id: `playht:${id}`, provider: "playht", providerVoiceId: id, name: String(raw.name ?? raw.voice_name ?? id),
    languages: tag ? [tag] : [], gender: gender(raw.gender), age: age(raw.age),
    accent: typeof raw.accent === "string" ? raw.accent : undefined,
    tags: [raw.style, raw.tempo, raw.texture, raw.loudness].filter((tag): tag is string => typeof tag === "string"),
    origin: cloned || raw.is_cloned === true ? "cloned" : "premade",
    previewUrl: typeof raw.sample === "string" ? raw.sample : typeof raw.sample_url === "string" ? raw.sample_url : undefined,
    models: typeof raw.voice_engine === "string" ? [raw.voice_engine] : [], raw };
}

/** Retrieve premade and account-owned voices, preserving fetch errors. */
export async function listVoices(ctx: ProviderContext, query: VoiceQuery = {}): Promise<VoiceDescriptor[]> {
  if (query.limit !== undefined && query.limit <= 0) return [];
  const origins = query.origin ? [query.origin].flat() : undefined;
  const voices: VoiceDescriptor[] = [];
  for (const [path, cloned] of [["/voices", false], ["/cloned-voices", true]] as const) {
    if (origins && !origins.includes(cloned ? "cloned" : "premade")) continue;
    const raw = await json(ctx, path), data = object(raw);
    const rows = Array.isArray(raw) ? raw : Array.isArray(data.voices) ? data.voices : Array.isArray(data.data) ? data.data : [];
    voices.push(...rows.map(row => normalizeVoice(row, cloned)));
  }
  return filterVoices([...new Map(voices.map(voice => [voice.id, voice])).values()], query);
}
