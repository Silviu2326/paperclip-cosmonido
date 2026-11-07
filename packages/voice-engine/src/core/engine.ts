import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_FORMAT } from "./audio.js";
import { MemoryCacheStore, synthesisCacheKey } from "./cache.js";
import { VoiceCatalog, toVoiceRef } from "./catalog.js";
import { EnvCredentialResolver, hasRequiredCredentials } from "./credentials.js";
import { VoiceEngineError } from "./errors.js";
import { withTimeout } from "./http.js";
import { normalizeLanguageTag } from "./languages.js";
import { synthesizeLongText } from "./long-synthesis.js";
import { ProviderRegistry } from "./registry.js";
import { DEFAULT_ROUTING, planRoute, withRetry } from "./router.js";
import { countBillableChars, normalizeText, stripSsml } from "./text.js";
import type {
  CacheStore, CloneVoiceRequest, CloneVoiceResult, CredentialResolver, DesignVoiceRequest, DesignVoiceResult,
  EngineEvent, EngineEventListener, EngineVoiceId, ModelDescriptor, ProviderDefinition, ProviderId, RoutingPolicy,
  SpeechToSpeechRequest, SynthesisChunk, SynthesisRequest, SynthesisResult, UpdateVoiceRequest, UsageRecord,
  VoiceDescriptor, VoiceEngine, VoiceEngineOptions, VoiceProvider, VoiceQuery, VoiceRef,
} from "./types.js";

type PreparedRequest = SynthesisRequest & { voice: VoiceRef; model: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Standalone engine coordinating credentials, providers, caching, routing and usage events. */
export class DefaultVoiceEngine implements VoiceEngine {
  private readonly registry: ProviderRegistry;
  private readonly credentials: CredentialResolver;
  private readonly cache: CacheStore | false;
  private readonly catalog: VoiceCatalog;
  private readonly routing: RoutingPolicy;
  private readonly retry: NonNullable<VoiceEngineOptions["retry"]>;
  private readonly listeners = new Set<EngineEventListener>();
  private readonly credentialHashes = new WeakMap<VoiceProvider, string>();
  constructor(private readonly options: VoiceEngineOptions = {}) {
    this.registry = new ProviderRegistry(options.providers ?? []);
    this.credentials = options.credentials ?? new EnvCredentialResolver(this.registry.list());
    this.cache = options.cache ?? new MemoryCacheStore();
    this.routing = { ...DEFAULT_ROUTING, ...options.routing, byLanguage: { ...DEFAULT_ROUTING.byLanguage, ...options.routing?.byLanguage } };
    this.retry = options.retry ?? { attempts: 3, baseDelayMs: 300, maxDelayMs: 5000 };
    this.catalog = new VoiceCatalog(this, { logger: options.logger });
  }

  async provider(id: ProviderId): Promise<VoiceProvider> {
    const def = this.registry.get(id);
    if (!def) throw new VoiceEngineError(`Unknown voice provider: ${id}`, { code: "not_found", provider: id });
    const credentials = await this.credentials.resolve(id, this.options.scope);
    if (!hasRequiredCredentials(def, credentials)) {
      const missing = def.requiredCredentials.filter((field) => !credentials?.[field]?.trim());
      const instructions = missing.map((field) => `${field} (${def.credentialEnv[field]?.join(" or ") || "configure your CredentialResolver"})`).join(", ");
      throw new VoiceEngineError(`Missing credentials for ${def.name}: ${instructions}. ${def.docsUrl}`, { code: "auth", provider: id });
    }
    const provider = this.registry.instantiate(id, {
      credentials: credentials ?? {}, fetch: this.options.fetch ?? globalThis.fetch,
      logger: this.options.logger, timeoutMs: this.options.timeoutMs ?? 60_000,
    });
    this.credentialHashes.set(provider, hash(Object.entries(credentials ?? {}).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))));
    return provider;
  }

  providers(): ProviderDefinition[] { return this.registry.list(); }
  async availableProviders(): Promise<ProviderId[]> {
    const available = await Promise.all(this.providers().map(async (def) => {
      try { return hasRequiredCredentials(def, await this.credentials.resolve(def.id, this.options.scope)) ? def.id : undefined; }
      catch (error) { this.warn("Credential resolution failed", { provider: def.id, error }); return undefined; }
    }));
    return available.filter((id): id is ProviderId => id !== undefined);
  }
  async listModels(provider?: ProviderId): Promise<ModelDescriptor[]> {
    if (provider) return (await this.provider(provider)).listModels();
    return (await Promise.all((await this.availableProviders()).map(async (id) => {
      try { return await (await this.provider(id)).listModels(); }
      catch (error) { this.warn("Model catalog provider failed", { provider: id, error }); return []; }
    }))).flat();
  }
  listVoices(query: VoiceQuery = {}): Promise<VoiceDescriptor[]> { return this.catalog.list(query); }
  async getVoice(id: EngineVoiceId | VoiceRef): Promise<VoiceDescriptor | undefined> {
    const ref = toVoiceRef(id), provider = await this.provider(ref.provider);
    return provider.getVoice ? provider.getVoice(ref.voiceId) : (await this.listVoices({ provider: ref.provider })).find((voice) => voice.providerVoiceId === ref.voiceId);
  }
  async recommendVoice(query: VoiceQuery): Promise<VoiceDescriptor | undefined> { return (await this.catalog.rank({ ...query, limit: 1 }))[0]; }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const started = Date.now(), requestId = randomUUID(), visited = new Set<ProviderId>();
    let current = request;
    while (true) {
      this.checkAbort(request.signal);
      const { provider, prepared } = await this.prepare(current);
      visited.add(provider.id);
      const key = hash([this.options.scope?.companyId ?? null, this.credentialHashes.get(provider), synthesisCacheKey(prepared, provider.id, prepared.model)]);
      let cached;
      if (this.cache) {
        try { cached = await this.cache.get(key); } catch (error) { this.warn("Synthesis cache read failed", { error }); }
      }
      this.checkAbort(request.signal);
      if (cached) {
        this.emit({ type: "cache.hit", key });
        return { ...cached, language: prepared.language, cached: true, latencyMs: Date.now() - started, requestId,
          usage: { provider: cached.provider, model: cached.model, operation: "synthesize", unit: "character", units: 0, estimatedCents: 0, pricingSource: "engine cache" } };
      }
      this.emit({ type: "cache.miss", key });
      this.emit({ type: "synthesis.start", provider: provider.id, model: prepared.model, chars: countBillableChars(prepared.text), requestId });
      let result: SynthesisResult;
      try {
        const output = await withRetry(() => this.invoke(provider.id, prepared.signal, (signal) => provider.synthesize({ ...prepared, signal })), this.retry, { signal: request.signal });
        result = { ...output, provider: provider.id, voice: prepared.voice, model: prepared.model, language: prepared.language ?? output.language,
          cached: false, latencyMs: Date.now() - started, requestId: output.requestId ?? requestId };
      } catch (error) {
        let next: SynthesisRequest | undefined;
        if (!request.signal?.aborted && error instanceof VoiceEngineError && error.retryable && this.routing.fallback && request.providerOptions?.allowFallbackVoice === true) {
          next = await this.fallbackRequest(request, visited);
        }
        this.emit({ type: "synthesis.error", provider: provider.id, error, requestId, willFallback: Boolean(next) });
        if (next) { current = next; continue; }
        throw error;
      }
      this.emit({ type: "synthesis.complete", provider: provider.id, model: result.model, result, requestId });
      this.emit({ type: "usage", usage: result.usage, scope: this.options.scope });
      if (this.cache) {
        try { await this.cache.set(key, { audio: result.audio, timestamps: result.timestamps, model: result.model, provider: result.provider, voice: result.voice, createdAt: Date.now() }, this.options.cacheTtlMs); }
        catch (error) { this.warn("Synthesis cache write failed", { error }); }
      }
      return result;
    }
  }

  async *synthesizeStream(request: SynthesisRequest): AsyncIterable<SynthesisChunk> {
    this.checkAbort(request.signal);
    const { provider, prepared } = await this.prepare(request);
    if (!provider.capabilities.streaming || !provider.synthesizeStream) {
      const result = await this.synthesize(request);
      yield { audio: result.audio.data, timestamps: result.timestamps, text: request.text };
      return;
    }
    const controller = new AbortController();
    const parent = request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal;
    const requestId = randomUUID(), signal = withTimeout(parent, this.options.timeoutMs ?? 60_000);
    const iterator = provider.synthesizeStream({ ...prepared, signal })[Symbol.asyncIterator]();
    this.emit({ type: "synthesis.start", provider: provider.id, model: prepared.model, chars: countBillableChars(prepared.text), requestId });
    let complete = false;
    try {
      while (true) {
        const chunk = await withRetry(() => iterator.next(), { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, { signal });
        if (chunk.done) { complete = true; break; }
        yield chunk.value;
      }
    } catch (error) {
      this.emit({ type: "synthesis.error", provider: provider.id, error, requestId, willFallback: false });
      throw error;
    } finally {
      if (!complete) { controller.abort(); void iterator.return?.().catch(() => undefined); }
    }
    // The stream contract contains no final result/usage envelope, so estimate usage once.
    const usage = await this.estimateCost({ text: prepared.text, voice: prepared.voice, model: prepared.model }).catch((): UsageRecord => ({
      provider: provider.id, model: prepared.model, operation: "synthesize_stream", unit: "character", units: countBillableChars(prepared.text), estimatedCents: null, pricingSource: "unknown",
    }));
    this.emit({ type: "usage", usage: { ...usage, operation: "synthesize_stream" }, scope: this.options.scope });
  }

  synthesizeLong(request: SynthesisRequest, options?: { maxChunkChars?: number; concurrency?: number }): Promise<SynthesisResult> { return synthesizeLongText(this, request, options); }

  async cloneVoice(id: ProviderId, request: CloneVoiceRequest): Promise<CloneVoiceResult> {
    const provider = await this.provider(id);
    if (!provider.cloneVoice) this.unsupported(id, "voice cloning");
    const result = await this.invoke(id, request.signal, (signal) => provider.cloneVoice!({ ...request, signal }));
    this.catalog.invalidate(id);
    this.emit({ type: "clone.complete", provider: id, voice: result.voice });
    if (result.usage) this.emit({ type: "usage", usage: result.usage, scope: this.options.scope });
    return result;
  }
  async updateVoice(id: EngineVoiceId | VoiceRef, request: UpdateVoiceRequest): Promise<VoiceDescriptor> {
    const ref = toVoiceRef(id), provider = await this.provider(ref.provider);
    if (!provider.updateVoice) this.unsupported(ref.provider, "updating voices");
    const voice = await this.invoke(provider.id, request.signal, (signal) => provider.updateVoice!(ref.voiceId, { ...request, signal }));
    this.catalog.invalidate(provider.id); return voice;
  }
  async deleteVoice(id: EngineVoiceId | VoiceRef): Promise<void> {
    const ref = toVoiceRef(id), provider = await this.provider(ref.provider);
    if (!provider.deleteVoice) this.unsupported(ref.provider, "deleting voices");
    await this.invoke(provider.id, undefined, (signal) => provider.deleteVoice!(ref.voiceId, signal));
    this.catalog.invalidate(provider.id);
  }
  async designVoice(id: ProviderId, request: DesignVoiceRequest): Promise<DesignVoiceResult> {
    const provider = await this.provider(id);
    if (!provider.designVoice) this.unsupported(id, "voice design");
    const result = await this.invoke(id, request.signal, (signal) => provider.designVoice!({ ...request, signal }));
    if (result.usage) this.emit({ type: "usage", usage: result.usage, scope: this.options.scope });
    return result;
  }
  async saveDesignedVoice(id: ProviderId, candidateId: string, name: string, description?: string): Promise<VoiceDescriptor> {
    const provider = await this.provider(id);
    if (!provider.saveDesignedVoice) this.unsupported(id, "saving designed voices");
    const voice = await this.invoke(id, undefined, () => provider.saveDesignedVoice!(candidateId, name, description));
    this.catalog.invalidate(id); return voice;
  }
  async speechToSpeech(request: SpeechToSpeechRequest): Promise<SynthesisResult> {
    const voice = toVoiceRef(request.voice), provider = await this.provider(voice.provider), start = Date.now();
    if (!provider.speechToSpeech) this.unsupported(provider.id, "speech-to-speech");
    const result = await this.invoke(provider.id, request.signal, (signal) => provider.speechToSpeech!({ ...request, voice, signal }));
    this.emit({ type: "usage", usage: result.usage, scope: this.options.scope });
    return { ...result, cached: false, latencyMs: Date.now() - start };
  }

  async estimateCost(request: Pick<SynthesisRequest, "text" | "voice" | "model">): Promise<UsageRecord> {
    const voice = toVoiceRef(request.voice), provider = await this.provider(voice.provider);
    const model = request.model ?? provider.defaultModel({ tier: this.routing.tier });
    const descriptor = (await provider.listModels()).find((candidate) => candidate.id === model), units = countBillableChars(request.text);
    return { provider: provider.id, model, operation: "synthesize", unit: "character", units,
      estimatedCents: descriptor?.usdPerMillionChars === undefined ? null : units * descriptor.usdPerMillionChars / 10_000,
      pricingSource: descriptor?.usdPerMillionChars === undefined ? "unknown" : descriptor.notes ?? `${provider.id}/${model} model catalog` };
  }
  on(listener: EngineEventListener): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  private async prepare(request: SynthesisRequest): Promise<{ provider: VoiceProvider; prepared: PreparedRequest }> {
    const voice = toVoiceRef(request.voice), provider = await this.provider(voice.provider);
    const providerOptions = { ...request.providerOptions };
    delete providerOptions.allowFallbackVoice;
    const prepared: PreparedRequest = { ...request, voice, model: request.model ?? provider.defaultModel({ language: request.language, tier: this.routing.tier }),
      text: normalizeText(request.ssml && !provider.capabilities.ssml ? stripSsml(request.text) : request.text),
      ssml: request.ssml && provider.capabilities.ssml, format: request.format ?? { ...DEFAULT_FORMAT },
      language: request.language ? normalizeLanguageTag(request.language) : undefined,
      providerOptions: Object.keys(providerOptions).length ? providerOptions : undefined };
    if (!prepared.text) throw new VoiceEngineError("Synthesis text must not be empty", { code: "invalid_request", provider: provider.id });
    if (prepared.text.length > provider.capabilities.maxInputChars) throw new VoiceEngineError(`Text exceeds ${provider.id}'s ${provider.capabilities.maxInputChars} character limit; use synthesizeLong`, { code: "invalid_request", provider: provider.id });
    if (!planRoute(prepared, this.routing, [provider]).length) this.unsupported(provider.id, "the requested synthesis language, format or timestamps");
    return { provider, prepared };
  }
  private async fallbackRequest(request: SynthesisRequest, visited: Set<ProviderId>): Promise<SynthesisRequest | undefined> {
    try {
      const candidates = await Promise.all((await this.availableProviders()).filter((id) => !visited.has(id)).map((id) => this.provider(id)));
      const routes = planRoute({ ...request, model: undefined, ssml: false, format: request.format ?? DEFAULT_FORMAT }, this.routing, candidates);
      for (const route of routes) {
        const voice = await this.recommendVoice({ provider: route.providerId, language: request.language });
        if (voice) return { ...request, voice: { provider: voice.provider, voiceId: voice.providerVoiceId }, model: route.model };
      }
    } catch (error) { this.warn("Fallback voice discovery failed", { error }); }
    return undefined;
  }
  private async invoke<T>(provider: ProviderId, parent: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = withTimeout(parent, this.options.timeoutMs ?? 60_000);
    try { return await withRetry(() => fn(signal), { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, { signal }); }
    catch (error) {
      if (error instanceof VoiceEngineError) throw error;
      throw new VoiceEngineError(error instanceof Error ? error.message : "Provider operation failed", { provider, code: error instanceof TypeError ? "provider_unavailable" : "unknown", cause: error });
    }
  }
  private checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new VoiceEngineError("Operation aborted", { code: "aborted", cause: signal.reason }); }
  private unsupported(provider: ProviderId, operation: string): never { throw new VoiceEngineError(`${provider} does not support ${operation}`, { code: "unsupported", provider }); }
  private warn(message: string, meta: Record<string, unknown>): void { try { this.options.logger?.warn(message, meta); } catch { /* Observers cannot break synthesis. */ } }
  private emit(event: EngineEvent): void {
    for (const listener of [...this.listeners]) {
      try { const result: unknown = listener(event); if (result instanceof Promise) void result.catch(() => undefined); } catch { /* Isolate listeners. */ }
    }
  }
}

/** Construct a standalone voice engine with injectable providers and services. */
export function createVoiceEngine(options: VoiceEngineOptions = {}): VoiceEngine { return new DefaultVoiceEngine(options); }
