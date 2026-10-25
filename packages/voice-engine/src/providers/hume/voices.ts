import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { age, filterVoices, gender, json, object, request } from "./http.js";

/** Normalize Hume's saved/preset voice records, retaining the native provider. */
export function normalizeVoice(value: unknown, provider?: string): VoiceDescriptor {
  const raw = { ...object(value) };
  raw.provider ??= provider;
  const id = String(raw.id ?? raw.name ?? "");
  return { id: `hume:${id}`, provider: "hume", providerVoiceId: id, name: String(raw.name ?? id),
    description: typeof raw.description === "string" ? raw.description : undefined,
    languages: Array.isArray(raw.languages) ? raw.languages.filter((lang): lang is string => typeof lang === "string") : typeof raw.language === "string" ? [raw.language] : [],
    gender: gender(raw.gender), age: age(raw.age), tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    origin: raw.provider === "HUME_AI" ? "premade" : "designed",
    models: Array.isArray(raw.compatible_octave_models) ? raw.compatible_octave_models.filter((model): model is string => typeof model === "string") : [], raw };
}

/** Page through both the preset and custom Hume voice libraries. */
export async function listVoices(ctx: ProviderContext, query: VoiceQuery = {}, signal?: AbortSignal): Promise<VoiceDescriptor[]> {
  if (query.limit !== undefined && query.limit <= 0) return [];
  const voices: VoiceDescriptor[] = [], origins = query.origin ? [query.origin].flat() : undefined;
  for (const provider of ["HUME_AI", "CUSTOM_VOICE"]) {
    if (origins && !origins.includes(provider === "HUME_AI" ? "premade" : "designed")) continue;
    for (let page = 0; ; page++) {
      const params = new URLSearchParams({ provider, page_number: String(page), page_size: "100" });
      const raw = object(await json(ctx, `/tts/voices?${params}`, undefined, signal));
      const rows = Array.isArray(raw.voices_page) ? raw.voices_page : Array.isArray(raw.voices) ? raw.voices : [];
      voices.push(...rows.map(row => normalizeVoice(row, provider)));
      if (query.limit !== undefined && filterVoices(voices, query).length >= query.limit) return filterVoices(voices, query);
      if (!rows.length || typeof raw.total_pages !== "number" || page + 1 >= raw.total_pages) break;
    }
  }
  return filterVoices(voices, query);
}

/** Resolve an engine voice ID to the name required by Hume's DELETE endpoint. */
export async function deleteVoice(ctx: ProviderContext, id: string, signal?: AbortSignal): Promise<void> {
  const voices = await listVoices(ctx, { origin: "designed" }, signal);
  const voice = voices.find(voice => voice.providerVoiceId === id || voice.name === id);
  if (!voice) throw new VoiceEngineError("Hume custom voice not found", { provider: "hume", code: "not_found" });
  await request(ctx, `/tts/voices?${new URLSearchParams({ name: voice.name })}`, { method: "DELETE", signal }, async () => undefined);
}
