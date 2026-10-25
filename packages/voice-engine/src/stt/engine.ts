import { VoiceEngineError } from "../core/errors.js";
import { withRetry } from "../core/router.js";
import { createDefinitionCredentialResolver, hasRequiredDefinitionCredentials } from "../net/credentials.js";
import { defaultWebSocketFactory } from "../net/websocket.js";
import type { SttEngine, SttEngineOptions, SttProvider, SttProviderDefinition, SttProviderId, SttModelDescriptor, TranscriptionRequest, SttStreamConfig, SttUsageRecord, SttEngineEvent } from "./types.js";
import type { ProviderCredentials } from "../core/types.js";

export const DEFAULT_STT_ROUTING = { preferred: ["deepgram", "elevenlabs", "soniox", "assemblyai", "openai"], fallback: true, byLanguage: { es: ["elevenlabs", "deepgram", "openai"] } };
const retryDefaults = { attempts: 2, baseDelayMs: 150, maxDelayMs: 1000 };

/** Create a lazy, credential-aware STT facade. */
export function createSttEngine(options: SttEngineOptions = {}): SttEngine {
  const defs = options.providers ?? [];
  const resolver = options.credentials ?? createDefinitionCredentialResolver(defs);
  const instances = new Map<SttProviderId, Promise<SttProvider>>();
  const listeners = new Set<(event: SttEngineEvent) => void>();
  const policy = { ...DEFAULT_STT_ROUTING, ...options.routing, byLanguage: { ...DEFAULT_STT_ROUTING.byLanguage, ...options.routing?.byLanguage } };
  const emit = (event: SttEngineEvent) => { for (const listener of listeners) { try { listener(event); } catch { /* observers cannot interrupt work */ } } };
  const def = (id: SttProviderId) => defs.find((item) => item.id === id);
  async function credentials(id: SttProviderId): Promise<ProviderCredentials | undefined> { return resolver.resolve(id, options.scope); }
  async function available(): Promise<SttProviderId[]> { const out: SttProviderId[] = []; for (const item of defs) if (hasRequiredDefinitionCredentials(item, await credentials(item.id))) out.push(item.id); return out; }
  async function provider(id: SttProviderId): Promise<SttProvider> {
    const definition = def(id); if (!definition) throw new VoiceEngineError(`Unknown STT provider: ${id}`, { code: "not_found", provider: id });
    const creds = await credentials(id);
    if (!hasRequiredDefinitionCredentials(definition, creds)) {
      const missing = definition.requiredCredentials.filter((field) => !creds?.[field]?.trim()).flatMap((field) => definition.credentialEnv[field] ?? [field]);
      throw new VoiceEngineError(`Missing credentials for ${id}; set one of: ${missing.join(", ")}`, { code: "auth", provider: id });
    }
    let instance = instances.get(id);
    if (!instance) { instance = Promise.resolve(definition.create({ credentials: creds ?? {}, fetch: options.fetch ?? fetch, logger: options.logger, timeoutMs: options.timeoutMs, webSocket: options.webSocket ?? defaultWebSocketFactory })); instances.set(id, instance); }
    return instance;
  }
  async function candidateIds(request: TranscriptionRequest & { provider?: SttProviderId }, streaming = false): Promise<SttProviderId[]> {
    const byLanguage = policy.byLanguage as Record<string, SttProviderId[]>; const configured = byLanguage[request.language ?? ""] ?? byLanguage[request.language?.split("-")[0] ?? ""] ?? [];
    const order = request.provider ? [request.provider] : [...new Set([...configured, ...(policy.preferred ?? [])])];
    const availableIds = await available(); const out: SttProviderId[] = [];
    for (const id of order) {
      if (!availableIds.includes(id)) continue;
      const p = await provider(id); const c = p.capabilities;
      if (streaming ? !c.streaming || !c.streamEncodings.includes((request as unknown as SttStreamConfig).encoding) : !c.batch) continue;
      if (request.wordTimestamps && !c.wordTimestamps || request.diarization?.enabled && !c.diarization || request.keywords?.length && !c.keywords || request.translateTo && !c.translation) continue;
      if ("data" in request.audio && c.maxFileBytes && request.audio.data.byteLength > c.maxFileBytes) continue;
      out.push(id);
    }
    return out;
  }
  return {
    provider, providers: () => [...defs], availableProviders: available,
    async listModels(id) { const ids = id ? [id] : await available(); return (await Promise.all(ids.map(async (key) => (await provider(key)).listModels()))).flat(); },
    async transcribe(request) {
      const ids = await candidateIds(request); if (!ids.length) throw new VoiceEngineError("No STT provider supports this request", { code: "unsupported" });
      const requestId = crypto.randomUUID(); let last: unknown;
      for (let i = 0; i < ids.length; i++) { const id = ids[i]; const p = await provider(id); const models = await p.listModels(); const model = request.model ?? p.defaultModel({ language: request.language === "auto" ? undefined : request.language, tier: policy.tier });
        emit({ type: "stt.start", provider: id, model, requestId });
        try { const result = await withRetry(() => p.transcribe({ ...request, model }), { ...(options.retry ?? retryDefaults), signal: request.signal }); emit({ type: "stt.complete", provider: id, model: result.model, result, requestId }); emit({ type: "stt.usage", usage: result.usage, scope: options.scope }); return result; }
        catch (error) { last = error; const fallback = Boolean(policy.fallback) && i < ids.length - 1 && error instanceof VoiceEngineError && error.retryable; emit({ type: "stt.error", provider: id, error, requestId, willFallback: fallback }); if (!fallback) throw error; }
      } throw last;
    },
    async openStream(config) { const ids = await candidateIds({ audio: { url: "" }, ...config, provider: config.provider } as unknown as TranscriptionRequest & { provider?: SttProviderId }, true); const id = ids[0]; if (!id) throw new VoiceEngineError("No credentialed STT provider supports this stream encoding", { code: "unsupported" }); const p = await provider(id); if (!p.openStream) throw new VoiceEngineError(`${id} does not implement streaming`, { code: "unsupported", provider: id }); return p.openStream(config); },
    async estimateCost({ provider: id, model, durationSeconds }): Promise<SttUsageRecord> { const p = await provider(id); const models = await p.listModels(); const selected = models.find((m) => m.id === model) ?? models.find((m) => m.id === p.defaultModel()); const rate = selected?.usdPerHour; return { provider: id, model: selected?.id ?? model, operation: "transcribe", unit: "second", units: durationSeconds, estimatedCents: rate === undefined ? null : rate * durationSeconds / 3600 * 100, pricingSource: selected?.notes ?? "Unknown pricing" }; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

