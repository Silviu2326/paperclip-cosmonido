import { VoiceEngineError } from "./errors.js";
import { languageMatches, normalizeLanguageTag, primaryLanguage } from "./languages.js";
import type { ModelDescriptor, ProviderId, RoutingPolicy, SynthesisRequest, VoiceProvider } from "./types.js";

/** Language-aware defaults; explicit voice bindings still take precedence in the engine. */
export const DEFAULT_ROUTING: RoutingPolicy = {
  preferred: ["elevenlabs", "openai", "fish-audio", "azure", "google", "minimax", "cartesia", "deepgram", "playht", "hume"],
  fallback: true, tier: "flagship",
  byLanguage: Object.fromEntries([
    ...["ja", "zh", "ko"].map((tag) => [tag, ["fish-audio", "elevenlabs"]]),
    ...["es", "en", "pt", "fr", "de", "it"].map((tag) => [tag, ["elevenlabs", "openai", "fish-audio"]]),
  ]),
};

type Candidate = VoiceProvider | { provider: VoiceProvider; models?: ModelDescriptor[] };
type Route = { providerId: ProviderId; model: string };
type RouteRequest = SynthesisRequest & { streaming?: boolean };

/** Order capable providers and models by language overrides, preference and requested tier. */
export function planRoute(request: RouteRequest, policy: RoutingPolicy, candidates: Candidate[]): Route[] {
  const language = request.language ? normalizeLanguageTag(request.language) : undefined;
  const overrides = Object.entries(policy.byLanguage ?? {});
  const byLanguage = language ? overrides.find(([tag]) => normalizeLanguageTag(tag) === language)?.[1]
    ?? overrides.find(([tag]) => normalizeLanguageTag(tag) === primaryLanguage(language))?.[1] ?? [] : [];
  const preferred = [...new Set([...byLanguage, ...(policy.preferred ?? [])])];
  const routes = candidates.flatMap((candidate) => {
    const provider = "provider" in candidate ? candidate.provider : candidate;
    const models = "provider" in candidate ? candidate.models : undefined;
    const capabilities = provider.capabilities;
    if (!capabilities.synthesize || request.streaming && (!capabilities.streaming || !provider.synthesizeStream)
      || request.timestamps && !capabilities.timestamps || request.ssml && !capabilities.ssml
      || request.format && !capabilities.formats.includes(request.format.container)
      || language && capabilities.languages.length > 0 && !capabilities.languages.some((tag) => languageMatches(tag, language))
      || request.text.length > capabilities.maxInputChars) return [];
    let model = request.model ?? provider.defaultModel({ language: request.language, tier: policy.tier });
    if (models?.length) {
      const supported = models.filter((item) => (!request.model || item.id === request.model)
        && (!request.streaming || item.supportsStreaming) && (!request.timestamps || item.supportsTimestamps)
        && (!request.ssml || item.supportsSsml) && (!item.maxInputChars || request.text.length <= item.maxInputChars)
        && (!language || !item.languages.length || item.languages.some((tag) => languageMatches(tag, language))));
      supported.sort((a, b) => Number(b.tier === policy.tier) - Number(a.tier === policy.tier) || Number(b.id === model) - Number(a.id === model));
      if (!supported.length) return [];
      model = supported[0].id;
    }
    return [{ providerId: provider.id, model }];
  });
  const priority = (id: ProviderId) => { const index = preferred.indexOf(id); return index === -1 ? preferred.length : index; };
  return routes.sort((a, b) => priority(a.providerId) - priority(b.providerId));
}

type RetryPolicy = { attempts: number; baseDelayMs: number; maxDelayMs: number; signal?: AbortSignal };
type RetryOptions = { isRetryable?: (error: unknown) => boolean; signal?: AbortSignal };

function abortError(signal: AbortSignal): VoiceEngineError {
  return new VoiceEngineError(signal.reason?.name === "TimeoutError" ? "Operation timed out" : "Operation aborted", {
    code: signal.reason?.name === "TimeoutError" ? "timeout" : "aborted", cause: signal.reason,
  });
}

function abortable<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError(signal!)); };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { if (signal?.aborted) throw abortError(signal); return fn(); }).then(
      (value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(abortError(signal!)); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Retry transient failures with capped exponential jitter and uncapped Retry-After minimums. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, policy: RetryPolicy, options: RetryOptions = {}): Promise<T> {
  if (!Number.isInteger(policy.attempts) || policy.attempts < 1 || !Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs < 0
    || !Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < 0) throw new VoiceEngineError("Invalid retry policy", { code: "invalid_request" });
  const signal = options.signal ?? policy.signal;
  const retryable = options.isRetryable ?? ((error: unknown) => error instanceof VoiceEngineError && error.retryable);
  for (let attempt = 1; ; attempt++) {
    try { return await abortable(() => fn(attempt), signal); }
    catch (error) {
      if (signal?.aborted) throw abortError(signal);
      if (attempt >= policy.attempts || !retryable(error)) throw error;
      const retryAfterMs = error instanceof VoiceEngineError ? error.retryAfterMs : undefined;
      const backoff = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1)) * (0.5 + Math.random() * 0.5);
      const wait = Math.max(backoff, Number.isFinite(retryAfterMs) ? retryAfterMs! : 0);
      // Long Retry-After values are split to avoid Node's signed 32-bit timer overflow.
      let remaining = wait;
      do { const interval = Math.min(remaining, 2_147_483_647); await delay(interval, signal); remaining -= interval; } while (remaining > 0);
    }
  }
}
