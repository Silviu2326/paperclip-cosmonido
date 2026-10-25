import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { age, filterVoices, gender, json, object } from "./http.js";

// Metadata is best effort from the official Aura voice table; unknown ages stay unknown.
const female = new Set("thalia andromeda helena asteria athena aurora callista cora cordelia delia electra harmonia hera iris janus juno luna minerva ophelia pandora phoebe selene theia vesta celeste estrella carina diana selena stella".split(" "));
const young = new Set("thalia cordelia delia iris luna celeste selena".split(" "));
const mature = new Set("athena atlas estrella".split(" "));
const accents: Record<string, string> = { draco: "British", pandora: "British", hyperion: "Australian", theia: "Australian", celeste: "Colombian", estrella: "Mexican", sirio: "Mexican", javier: "Mexican", nestor: "Peninsular", carina: "Peninsular", alvaro: "Peninsular", diana: "Peninsular", aquila: "Latin American", selena: "Latin American" };
const uses: Record<string, string[]> = {
  storytelling: "athena cora cordelia draco janus minerva orpheus pluto diana".split(" "),
  advertising: "asteria atlas electra iris odysseus celeste".split(" "),
  narration: "hera hermes jupiter orion pandora selene theia aquila selena".split(" "),
  conversational: "thalia arcas aries helena nestor estrella sirio javier".split(" "),
};
const english = "thalia andromeda helena apollo arcas aries asteria athena atlas aurora callista cora cordelia delia draco electra harmonia hera hermes hyperion iris janus juno jupiter luna mars minerva neptune odysseus ophelia orion orpheus pandora phoebe pluto saturn selene theia vesta zeus".split(" ");
const spanish = "celeste estrella nestor sirio carina alvaro diana aquila selena javier".split(" ");
const legacy = "asteria luna stella athena hera orion arcas perseus angus orpheus helios zeus".split(" ");

function premade(name: string, language: string, family = "aura-2"): VoiceDescriptor {
  const id = `${family === "aura-1" ? "aura" : family}-${name}-${language}`;
  return { id: `deepgram:${id}`, provider: "deepgram", providerVoiceId: id,
    name: name[0].toUpperCase() + name.slice(1), languages: [language], gender: female.has(name) ? "female" : [...english, ...spanish, ...legacy].includes(name) ? "male" : "unknown",
    age: young.has(name) ? "young" : mature.has(name) ? "old" : "middle_aged",
    accent: accents[name] ?? (language === "en" ? "American" : undefined),
    tags: Object.entries(uses).filter(([, names]) => names.includes(name)).map(([tag]) => tag),
    origin: "premade", models: [family], raw: { canonical_name: id } };
}

/** Static catalog remains usable if model discovery is unavailable. */
export const DEEPGRAM_VOICES: VoiceDescriptor[] = [
  ...english.map(name => premade(name, "en")), ...spanish.map(name => premade(name, "es")),
  ...legacy.map(name => premade(name, "en", "aura-1")),
];

/** Enrich Aura voices from /models while retaining a complete offline fallback. */
export async function listVoices(ctx: ProviderContext, query: VoiceQuery = {}): Promise<VoiceDescriptor[]> {
  if (query.limit !== undefined && query.limit <= 0) return [];
  const voices = new Map(DEEPGRAM_VOICES.map(voice => [voice.providerVoiceId, { ...voice, languages: [...voice.languages], models: [...voice.models], tags: [...voice.tags] }]));
  try {
    const response = object(await json(ctx, "/models"));
    const tts = Array.isArray(response.tts) ? response.tts : Object.values(object(response.tts));
    for (const value of tts) {
      const raw = object(value), metadata = object(raw.metadata);
      const id = String(raw.canonical_name ?? raw.name ?? "");
      if (!id.startsWith("aura-")) continue;
      const parts = id.split("-"), family = id.startsWith("aura-2-") ? "aura-2" : "aura-1";
      const existing = voices.get(id) ?? premade(parts.at(-2) ?? id, parts.at(-1) ?? "en", family);
      const languages = Array.isArray(raw.languages) ? raw.languages.filter((lang): lang is string => typeof lang === "string") : existing.languages;
      voices.set(id, { ...existing, description: typeof metadata.description === "string" ? metadata.description : existing.description,
        languages, gender: raw.gender || metadata.gender ? gender(raw.gender ?? metadata.gender) : existing.gender,
        age: raw.age || metadata.age ? age(raw.age ?? metadata.age) : existing.age,
        tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : existing.tags, raw });
    }
  } catch (error) {
    // Discovery is optional; cancellation and invalid credentials must remain visible.
    if (!(error instanceof VoiceEngineError) || !["not_found", "provider_unavailable", "timeout", "rate_limit", "unsupported"].includes(error.code)) throw error;
    ctx.logger?.debug("Deepgram model discovery unavailable; using static Aura catalog");
  }
  return filterVoices([...voices.values()], query);
}
