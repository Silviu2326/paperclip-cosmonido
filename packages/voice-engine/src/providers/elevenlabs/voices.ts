import type { ProviderContext, VoiceAge, VoiceDescriptor, VoiceGender, VoiceOrigin, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { invalid, malformed, object, requestJson, requiredString } from "./http.js";
import { languageCode } from "./models.js";

const str = (value: unknown): string | undefined => typeof value === "string" && value ? value : undefined;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function bcp47(value: string): string | undefined {
  try { return Intl.getCanonicalLocales(value.replace(/_/g, "-"))[0]; } catch { return undefined; }
}

/** Summarize provider training state while retaining its full model-by-model state in raw. */
export function voiceStatus(raw: Record<string, unknown>): "ready" | "training" | "pending_verification" | "failed" {
  const fineTuning = object(raw.fine_tuning);
  const verification = object(raw.voice_verification);
  const states = typeof fineTuning.state === "string" ? [fineTuning.state] : Object.values(object(fineTuning.state));
  if (states.some(state => /failed|error/i.test(String(state)))) return "failed";
  if (states.some(state => /queued|training|fine_tuning|processing/i.test(String(state)))) return "training";
  if (states.includes("fine_tuned")) return "ready";
  if (verification.requires_verification === true || fineTuning.manual_verification_requested === true || states.some(state => /verif|not_started/.test(String(state)))) return "pending_verification";
  return raw.category === "professional" && !states.length ? "pending_verification" : "ready";
}

/** Normalize both account voices and Voice Library entries, preserving provider metadata. */
export function normalizeVoice(raw: Record<string, unknown>, origin?: VoiceOrigin): VoiceDescriptor {
  const id = requiredString(raw.voice_id, "voice_id");
  const labels = { ...raw, ...object(raw.labels) };
  const genderValue = String(labels.gender ?? "unknown").toLowerCase();
  const gender: VoiceGender = ["male", "female", "neutral"].includes(genderValue) ? genderValue as VoiceGender : genderValue === "non-binary" ? "neutral" : "unknown";
  const ageValue = String(labels.age ?? "unknown").toLowerCase().replace(/[ -]/g, "_");
  const age: VoiceAge = ({ child: "child", young: "young", young_adult: "young", middle_aged: "middle_aged", old: "old", elderly: "old" } as Record<string, VoiceAge>)[ageValue] ?? "unknown";
  const verified = Array.isArray(raw.verified_languages) ? raw.verified_languages.map(object) : [];
  const languages = [...new Set(verified.map(item => str(item.locale) ?? str(item.language)).concat(str(labels.language)).filter((item): item is string => !!item).map(bcp47).filter((item): item is string => !!item))];
  const category = ({ premade: "premade", cloned: "cloned", generated: "designed", professional: "professional_clone" } as Record<string, VoiceOrigin>)[String(raw.category)] ?? "custom";
  const tags = [...new Set([str(labels.use_case), str(labels.descriptive), ...strings(labels.use_cases)].filter((item): item is string => !!item))];
  return { id: `elevenlabs:${id}`, provider: "elevenlabs", providerVoiceId: id, name: str(raw.name) ?? id,
    description: str(raw.description) ?? str(labels.description), languages, gender, age,
    accent: str(labels.accent), tags, origin: origin ?? category,
    previewUrl: str(raw.preview_url) ?? str(verified[0]?.preview_url), models: strings(raw.high_quality_base_model_ids),
    raw: { ...raw, status: voiceStatus(raw) } };
}

export interface ElevenLabsVoiceQuery extends VoiceQuery {
  pageSize?: number;
  nextPageToken?: string;
  voiceType?: "personal" | "community" | "default" | "workspace";
  category?: string;
  signal?: AbortSignal;
}

function limitFor(query: VoiceQuery): number {
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0)) throw invalid("Voice query limit must be a nonnegative integer");
  return query.limit ?? Infinity;
}

function pageSize(value: number | undefined, limit: number): number {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) throw invalid("pageSize must be a positive integer");
  return Math.min(100, value ?? limit);
}

function matches(voice: VoiceDescriptor, query: VoiceQuery): boolean {
  const providers = query.provider === undefined ? undefined : Array.isArray(query.provider) ? query.provider : [query.provider];
  const origins = query.origin === undefined ? undefined : Array.isArray(query.origin) ? query.origin : [query.origin];
  return (!providers || providers.includes("elevenlabs")) && (!origins || origins.includes(voice.origin))
    && (!query.gender || voice.gender === query.gender) && (!query.age || voice.age === query.age)
    && (!query.language || !voice.languages.length || voice.languages.some(language => languageCode(language) === languageCode(query.language!)))
    && (!query.tags || query.tags.every(tag => voice.tags.some(value => value.toLowerCase() === tag.toLowerCase())))
    && (!query.search || [voice.name, voice.description, ...voice.tags].join(" ").toLowerCase().includes(query.search.toLowerCase()));
}

/** List all matching account voices using cursor pagination, applying limit after local filters. */
export async function listVoices(ctx: ProviderContext, query: ElevenLabsVoiceQuery = {}): Promise<VoiceDescriptor[]> {
  const limit = limitFor(query);
  if (!limit) return [];
  const size = pageSize(query.pageSize, limit);
  const result: VoiceDescriptor[] = [];
  const ids = new Set<string>();
  const tokens = new Set<string>();
  let token = query.nextPageToken;
  while (true) {
    if (token) tokens.add(token);
    const data = await requestJson(ctx, "/v2/voices", { signal: query.signal, query: {
      page_size: size, next_page_token: token,
      search: query.search, voice_type: query.voiceType, category: query.category,
    } });
    if (!Array.isArray(data.voices)) throw malformed("ElevenLabs response is missing voices");
    for (const raw of data.voices) {
      const voice = normalizeVoice(object(raw));
      if (!ids.has(voice.id) && matches(voice, query)) { ids.add(voice.id); result.push(voice); }
      if (result.length >= limit) return result;
    }
    if (data.has_more !== true) return result;
    token = str(data.next_page_token);
    if (!token || tokens.has(token)) throw malformed("ElevenLabs pagination did not advance");
  }
}

/** Fetch a voice including fine_tuning.state, returning undefined only for a missing voice. */
export async function getVoice(ctx: ProviderContext, voiceId: string, signal?: AbortSignal): Promise<VoiceDescriptor | undefined> {
  try { return normalizeVoice(await requestJson(ctx, `/v1/voices/${encodeURIComponent(voiceId)}`, { signal })); }
  catch (error) { if (error instanceof VoiceEngineError && error.code === "not_found") return undefined; throw error; }
}

export interface VoiceLibraryQuery extends VoiceQuery {
  accent?: string;
  useCase?: string;
  category?: "professional" | "famous" | "high_quality";
  pageSize?: number;
  page?: number;
  signal?: AbortSignal;
}

/** Search the public Voice Library, following its numbered pages until the requested limit. */
export async function searchVoiceLibrary(ctx: ProviderContext, query: VoiceLibraryQuery = {}): Promise<VoiceDescriptor[]> {
  const limit = query.limit === undefined ? 30 : limitFor(query);
  if (!limit) return [];
  const size = pageSize(query.pageSize, limit);
  if (query.page !== undefined && (!Number.isInteger(query.page) || query.page < 0)) throw invalid("page must be a nonnegative integer");
  const result: VoiceDescriptor[] = [];
  const seen = new Set<string>();
  for (let page = query.page ?? 0; result.length < limit; page++) {
    const data = await requestJson(ctx, "/v1/shared-voices", { signal: query.signal, query: {
      page, page_size: size, search: query.search,
      language: query.language ? languageCode(query.language) : undefined, gender: query.gender, age: query.age,
      accent: query.accent, use_cases: query.useCase ?? query.tags?.[0], category: query.category,
    } });
    if (!Array.isArray(data.voices)) throw malformed("ElevenLabs library response is missing voices");
    let added = 0;
    for (const raw of data.voices) {
      const voice = normalizeVoice(object(raw), "community");
      if (seen.has(voice.id)) continue;
      seen.add(voice.id); added++;
      if (matches(voice, query)) result.push(voice);
      if (result.length >= limit) return result;
    }
    if (data.has_more !== true) break;
    if (!added) throw malformed("ElevenLabs library pagination did not advance");
  }
  return result;
}

/** Add a shared voice to the current account and return its new account voice ID. */
export async function addSharedVoice(ctx: ProviderContext, publicUserId: string, voiceId: string, name: string, signal?: AbortSignal): Promise<VoiceDescriptor> {
  const data = await requestJson(ctx, `/v1/voices/add/${encodeURIComponent(publicUserId)}/${encodeURIComponent(voiceId)}`, { json: { new_name: name }, signal });
  return normalizeVoice({ ...data, voice_id: requiredString(data.voice_id, "voice_id"), name }, "community");
}
