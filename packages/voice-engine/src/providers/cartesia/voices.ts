import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { age, filterVoices, gender, json, object } from "./http.js";

/** Normalize a Cartesia catalog or clone response. */
export function normalizeVoice(value: unknown): VoiceDescriptor {
  const raw = object(value), id = String(raw.id ?? "");
  return { id: `cartesia:${id}`, provider: "cartesia", providerVoiceId: id, name: String(raw.name ?? id),
    description: typeof raw.description === "string" ? raw.description : undefined,
    languages: typeof raw.language === "string" ? [raw.language] : [], gender: gender(raw.gender), age: age(raw.age),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    origin: raw.is_public === true ? "premade" : "cloned", models: [],
    previewUrl: typeof raw.preview_url === "string" ? raw.preview_url : undefined, raw };
}

/** List all matching pages without following provider-supplied hosts. */
export async function listVoices(ctx: ProviderContext, query: VoiceQuery = {}): Promise<VoiceDescriptor[]> {
  if (query.limit !== undefined && query.limit <= 0) return [];
  const voices: VoiceDescriptor[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("starting_after", cursor);
    if (query.language) params.set("language", query.language.split("-")[0]);
    if (query.gender) params.set("gender", query.gender);
    if (query.origin === "cloned") params.set("is_owner", "true");
    const raw = await json(ctx, `/voices?${params}`), page = object(raw);
    const rows = Array.isArray(raw) ? raw : Array.isArray(page.data) ? page.data : [];
    voices.push(...rows.map(normalizeVoice));
    if (query.limit !== undefined && filterVoices(voices, query).length >= query.limit) break;
    if (!page.has_more || !rows.length) break;
    const next = typeof page.next_page === "string" ? page.next_page : String(object(rows.at(-1)).id ?? "");
    cursor = next.includes("?") ? new URL(next, "https://api.cartesia.ai").searchParams.get("starting_after") ?? undefined : next;
    if (!cursor || seen.has(cursor)) break;
    seen.add(cursor);
  } while (cursor);
  return filterVoices(voices, query);
}

/** Retrieve a voice, returning undefined only for a provider 404. */
export async function getVoice(ctx: ProviderContext, id: string): Promise<VoiceDescriptor | undefined> {
  try { return normalizeVoice(await json(ctx, `/voices/${encodeURIComponent(id)}`)); }
  catch (error) { if (error instanceof VoiceEngineError && error.code === "not_found") return undefined; throw error; }
}
