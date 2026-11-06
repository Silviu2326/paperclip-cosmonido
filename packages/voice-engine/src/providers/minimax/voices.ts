import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { failure, json, jsonBody, record } from "./http.js";
import { LANGUAGE_NAMES } from "./models.js";

export function normalizeVoice(value: unknown, origin: VoiceDescriptor["origin"]): VoiceDescriptor {
  const raw = record(value);
  const id = String(raw.voice_id ?? raw.id ?? "");
  if (!id) throw failure("MiniMax returned a voice without an id");
  const desc = raw.description;
  const description = Array.isArray(desc) ? desc.map(String).join(", ") : typeof desc === "string" ? desc : "";
  const language = Object.entries(LANGUAGE_NAMES).find(([, name]) => id.toLowerCase().startsWith(`${name.toLowerCase()}_`))?.[0]
    ?? (id.toLowerCase().startsWith("cantonese_") || id.toLowerCase().startsWith("chinese (cantonese)_") ? "yue"
      : id.toLowerCase().startsWith("chinese (mandarin)_") ? "zh" : undefined);
  const traits = `${description} ${String(raw.voice_name ?? "")} ${id.replace(/_/g, " ")}`.toLowerCase();
  return { id: `minimax:${id}`, provider: "minimax", providerVoiceId: id,
    name: String(raw.voice_name ?? raw.name ?? id), description: description || undefined,
    languages: language ? [language] : [], gender: /\b(female|woman|girl)\b/.test(traits) ? "female" : /\b(male|man|boy)\b/.test(traits) ? "male" : "unknown",
    age: /\b(child|kid|boy|girl)\b/.test(traits) ? "child" : /\b(young|youth)\b/.test(traits) ? "young" : /\b(old|elderly|senior)\b/.test(traits) ? "old" : /\b(middle[ -]?aged|mature|adult)\b/.test(traits) ? "middle_aged" : "unknown",
    tags: Array.isArray(desc) ? desc.map(String) : [], origin, models: [], raw,
    previewUrl: typeof raw.preview_audio === "string" ? raw.preview_audio : undefined };
}

const FALLBACK = [
  ["English_expressive_narrator", "English Expressive Narrator"],
  ["English_Graceful_Lady", "English Graceful Lady"],
  ["English_Trustworth_Man", "English Trustworthy Man"],
  ["Spanish_SereneWoman", "Spanish Serene Woman"],
  ["Spanish_TrustworthyMan", "Spanish Trustworthy Man"],
  ["Chinese (Mandarin)_Warm_Bestie", "Mandarin Warm Bestie"],
];

export function filterVoices(voices: VoiceDescriptor[], query: VoiceQuery = {}) {
  const origins = query.origin ? [query.origin].flat() : undefined;
  return voices.filter(voice => (!query.gender || voice.gender === query.gender) && (!query.age || voice.age === query.age)
    && (!origins || origins.includes(voice.origin)) && (!query.tags || query.tags.every(tag => voice.tags.includes(tag)))
    && (!query.language || voice.languages.length === 0 || voice.languages.includes(query.language.toLowerCase().split("-")[0]))
    && (!query.search || `${voice.name} ${voice.description ?? ""} ${voice.tags.join(" ")}`.toLowerCase().includes(query.search.toLowerCase())))
    .slice(0, query.limit === undefined ? undefined : Math.max(0, query.limit));
}

export async function fetchVoices(ctx: ProviderContext, signal?: AbortSignal) {
  const body = await json(ctx, "/v1/get_voice", { ...jsonBody({ voice_type: "all" }), signal });
  const groups: [string, VoiceDescriptor["origin"]][] = [["system_voice", "premade"], ["voice_cloning", "cloned"], ["voice_generation", "designed"]];
  if (!groups.some(([key]) => Array.isArray(body[key]))) throw failure("MiniMax returned an invalid voice list");
  return groups.flatMap(([key, origin]) => Array.isArray(body[key]) ? (body[key] as unknown[]).map(voice => normalizeVoice(voice, origin)) : []);
}

export async function listVoices(ctx: ProviderContext, query?: VoiceQuery) {
  let voices: VoiceDescriptor[];
  try { voices = await fetchVoices(ctx); }
  catch (error) {
    if (error instanceof VoiceEngineError && ["aborted", "timeout"].includes(error.code)) throw error;
    ctx.logger?.warn("MiniMax voice catalog unavailable; using static system voices");
    voices = FALLBACK.map(([voice_id, voice_name]) => {
      const voice = normalizeVoice({ voice_id, voice_name }, "premade");
      if (voice_id.startsWith("Chinese")) voice.languages = ["zh"];
      return voice;
    });
  }
  return filterVoices(voices, query);
}
