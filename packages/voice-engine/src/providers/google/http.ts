import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError, codeFromStatus } from "../../core/errors.js";

const provider = "google";

/** Own a request deadline through response consumption, including streaming reads. */
export async function openHttp(ctx: ProviderContext, url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const caller = init.signal;
  let timedOut = false;
  const abort = () => controller.abort(caller?.reason);
  if (caller?.aborted) abort();
  else caller?.addEventListener("abort", abort, { once: true });
  const timer = ctx.timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(0, ctx.timeoutMs));
  const close = () => {
    clearTimeout(timer);
    caller?.removeEventListener("abort", abort);
    controller.abort();
  };
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    let onAbort: (() => void) | undefined;
    try {
      controller.signal.throwIfAborted();
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(controller.signal.reason);
          controller.signal.addEventListener("abort", onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
        }),
      ]);
    } catch (error) {
      if (error instanceof VoiceEngineError) throw error;
      throw new VoiceEngineError(
        timedOut ? "Request timed out" : controller.signal.aborted ? "Request aborted" : "Provider request failed",
        { provider, code: timedOut ? "timeout" : controller.signal.aborted ? "aborted" : "provider_unavailable", cause: error },
      );
    } finally {
      if (onAbort) controller.signal.removeEventListener("abort", onAbort);
    }
  };
  try {
    const response = await run(() => ctx.fetch(url, { ...init, signal: controller.signal }));
    if (!response.ok) {
      const text = await run(() => response.text());
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* Azure also sends plain text. */ }
      const detail = body?.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
      const message = typeof detail?.message === "string" ? detail.message : text || response.statusText;
      let code = codeFromStatus(response.status);
      const status = String(detail?.status || "");
      if (status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") code = "auth";
      if (status === "INVALID_ARGUMENT") code = "invalid_request";
      if (status === "RESOURCE_EXHAUSTED") code = /per minute|per second|rate limit|concurrent|too many/i.test(message) ? "rate_limit" : /quota|billing|daily|per day/i.test(message) ? "quota_exceeded" : "rate_limit";
      const retry = response.headers.get("retry-after");
      const seconds = retry === null ? NaN : Number(retry);
      const retryAfterMs = retry === null ? undefined : Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retry) - Date.now());
      throw new VoiceEngineError(message || "Provider request failed", {
        provider, code, status: response.status,
        retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
      });
    }
    return { response, run, close };
  } catch (error) {
    close();
    throw error;
  }
}

/** Consume a JSON response while retaining cancellation and deadline coverage. */
export async function jsonHttp<T>(ctx: ProviderContext, url: string, init?: RequestInit): Promise<T> {
  const http = await openHttp(ctx, url, init);
  try {
    return await http.run(async () => {
      try { return await http.response.json() as T; }
      catch (cause) {
        if (cause instanceof SyntaxError) throw new VoiceEngineError("Malformed provider JSON", { provider, code: "provider_unavailable", cause });
        throw cause;
      }
    });
  } finally { http.close(); }
}

/** Stream response bytes and cancel the reader when the consumer stops early. */
export async function* streamHttp(ctx: ProviderContext, url: string, init: RequestInit) {
  const http = await openHttp(ctx, url, init);
  const reader = http.response.body?.getReader();
  try {
    if (!reader) throw new VoiceEngineError("Provider returned no audio body", { provider, code: "provider_unavailable" });
    while (true) {
      const part = await http.run(() => reader.read());
      if (part.done) break;
      if (part.value.byteLength) yield { audio: part.value };
    }
  } finally {
    http.close();
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}

/** Apply the common catalog query without relying on parallel core helpers. */
export function filterVoices(voices: VoiceDescriptor[], query: VoiceQuery = {}): VoiceDescriptor[] {
  return voices.filter(v => {
    const providers = query.provider === undefined ? undefined : [query.provider].flat();
    const origins = query.origin === undefined ? undefined : [query.origin].flat();
    const language = query.language?.toLowerCase();
    return (!providers || providers.includes(v.provider))
      && (!origins || origins.includes(v.origin))
      && (!query.gender || v.gender === query.gender)
      && (!query.age || v.age === query.age)
      && (!language || !v.languages.length || v.languages.some(l => {
        const tag = l.toLowerCase();
        return tag === language || tag.startsWith(language + "-") || language.startsWith(tag + "-");
      }))
      && (!query.tags || query.tags.every(t => v.tags.includes(t)))
      && (!query.search || [v.name, v.description, ...v.tags].join(" ").toLowerCase().includes(query.search.toLowerCase()));
  }).slice(0, query.limit === undefined ? undefined : Math.max(0, query.limit));
}

/** Clamp finite settings to the provider's documented range. */
export function bounded(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) throw new VoiceEngineError("Setting must be finite", { provider, code: "invalid_request" });
  return Math.min(max, Math.max(min, value));
}

