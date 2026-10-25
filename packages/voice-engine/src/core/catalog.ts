import { VoiceEngineError } from "./errors.js";
import { languageMatches, normalizeLanguageTag } from "./languages.js";
import type { EngineVoiceId, Logger, ProviderId, VoiceDescriptor, VoiceProvider, VoiceQuery, VoiceRef } from "./types.js";

/** Parse a provider-qualified ID, retaining any colons inside the provider voice ID. */
export function parseEngineVoiceId(id: string): VoiceRef {
  const separator = id.indexOf(":");
  if (separator < 1 || !id.slice(separator + 1).trim() || /\s/.test(id.slice(0, separator))) {
    throw new VoiceEngineError(`Expected a provider:voiceId identifier, received ${JSON.stringify(id)}`, { code: "invalid_request" });
  }
  return { provider: id.slice(0, separator), voiceId: id.slice(separator + 1) };
}

/** Serialize a voice reference into its engine-wide identifier. */
export function toEngineVoiceId(ref: VoiceRef): EngineVoiceId {
  if (!ref.provider || /[:\s]/.test(ref.provider) || !ref.voiceId.trim()) throw new VoiceEngineError("Invalid voice reference", { code: "invalid_request" });
  return `${ref.provider}:${ref.voiceId}`;
}

/** Normalize either supported voice identifier representation. */
export function toVoiceRef(idOrRef: string | VoiceRef): VoiceRef {
  return typeof idOrRef === "string" ? parseEngineVoiceId(idOrRef) : parseEngineVoiceId(toEngineVoiceId(idOrRef));
}

/** Filter voices using primary language matching and any-of tags and origins. */
export function filterVoices(voices: VoiceDescriptor[], query: VoiceQuery = {}): VoiceDescriptor[] {
  const providers = query.provider ? [query.provider].flat() : undefined;
  const origins = query.origin ? [query.origin].flat() : undefined;
  const tags = query.tags?.map((tag) => tag.toLocaleLowerCase());
  const search = query.search?.trim().toLocaleLowerCase();
  const matches = voices.filter((voice) => (!providers || providers.includes(voice.provider))
    && (!query.language || !voice.languages.length || voice.languages.some((language) => languageMatches(language, query.language!)))
    && (!query.gender || query.gender === voice.gender) && (!query.age || query.age === voice.age)
    && (!origins || origins.includes(voice.origin))
    && (!tags?.length || voice.tags.some((tag) => tags.includes(tag.toLocaleLowerCase())))
    && (!search || [voice.name, voice.description ?? "", ...voice.tags].join(" ").toLocaleLowerCase().includes(search)));
  return query.limit === undefined ? matches : matches.slice(0, Math.max(0, query.limit));
}

/** Rank matches by exact language, primary language, multilingual, then curated quality. */
export function rankVoices(voices: VoiceDescriptor[], query: VoiceQuery = {}): VoiceDescriptor[] {
  const language = query.language ? normalizeLanguageTag(query.language) : undefined;
  const score = (voice: VoiceDescriptor) => {
    const languageScore = !language ? 0 : voice.languages.some((tag) => normalizeLanguageTag(tag) === language) ? 100
      : voice.languages.some((tag) => languageMatches(tag, language)) ? 50 : 10;
    const flagship = voice.tags.includes("flagship") || voice.raw?.tier === "flagship" || voice.raw?.flagship === true;
    return languageScore + (voice.origin === "premade" ? 4 : 0) + (flagship ? 2 : 0);
  };
  const ranked = filterVoices(voices, { ...query, limit: undefined }).sort((a, b) => score(b) - score(a));
  return query.limit === undefined ? ranked : ranked.slice(0, Math.max(0, query.limit));
}

type CatalogSource = { availableProviders(): Promise<ProviderId[]>; provider(id: ProviderId): Promise<VoiceProvider> };
type CatalogOptions = { ttlMs?: number; logger?: Logger };
type CatalogEntry = { provider: VoiceProvider; expiresAt: number; voices?: VoiceDescriptor[]; pending?: Promise<VoiceDescriptor[]> };

/** Aggregate available providers with instance-aware TTL caching and partial-failure tolerance. */
export class VoiceCatalog {
  private readonly cache = new Map<ProviderId, CatalogEntry>();
  constructor(private readonly source: CatalogSource, private readonly options: CatalogOptions = {}) {}
  async list(query: VoiceQuery = {}): Promise<VoiceDescriptor[]> {
    const selected = query.provider ? [query.provider].flat() : undefined;
    const ids = (await this.source.availableProviders()).filter((id) => !selected || selected.includes(id));
    const groups = await Promise.all(ids.map(async (id) => {
      try {
        const provider = await this.source.provider(id);
        let entry = this.cache.get(id);
        if (entry?.provider === provider) {
          if (entry.pending) return await entry.pending;
          if (entry.voices && entry.expiresAt > Date.now()) return entry.voices;
        }
        entry = { provider, expiresAt: 0 };
        this.cache.set(id, entry);
        const target = entry;
        target.pending = Promise.resolve().then(() => provider.listVoices()).then((voices) => {
          target.voices = structuredClone(voices);
          target.expiresAt = Date.now() + (this.options.ttlMs ?? 300_000);
          return target.voices;
        }).finally(() => { target.pending = undefined; });
        return await target.pending;
      } catch (error) {
        try { this.options.logger?.warn("Voice catalog provider failed", { provider: id, error }); } catch { /* Loggers must not break partial results. */ }
        return [];
      }
    }));
    return filterVoices(structuredClone(groups.flat()), query);
  }
  /** Return the best matching voices before applying the result limit. */
  async rank(query: VoiceQuery = {}): Promise<VoiceDescriptor[]> { return rankVoices(await this.list({ ...query, limit: undefined }), query); }
  /** Discard cached voices after provider-side voice mutations. */
  invalidate(provider?: ProviderId): void { if (provider) this.cache.delete(provider); else this.cache.clear(); }
}

/** Create a unified voice catalog over an engine or compatible provider source. */
export function createVoiceCatalog(source: CatalogSource, options: CatalogOptions = {}): VoiceCatalog { return new VoiceCatalog(source, options); }
