import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";

const PROVIDER = "cartesia";
const BASE_URL = "https://api.cartesia.ai";

/** Create a provider-scoped validation error. */
export function invalid(message: string, code: "invalid_request" | "unsupported" = "invalid_request"): never {
  throw new VoiceEngineError(message, { provider: PROVIDER, code });
}

/** Read an object without trusting an external JSON shape. */
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Normalize transport failures while retaining cancellation and timeout semantics. */
function failure(error: unknown, signal: AbortSignal): VoiceEngineError {
  if (error instanceof VoiceEngineError) return error;
  const reason = signal.aborted ? signal.reason : error;
  const name = reason instanceof Error ? reason.name : "";
  const code = name === "TimeoutError" ? "timeout" : signal.aborted || name === "AbortError" ? "aborted" : "provider_unavailable";
  return new VoiceEngineError(`${PROVIDER} request ${code}`, { provider: PROVIDER, code, cause: error });
}

/** Race pending I/O against cancellation, including injected fetch implementations. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
    if (signal.aborted) stop();
  });
}

async function open(ctx: ProviderContext, path: string, init: RequestInit, authenticated = true) {
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const timer = ctx.timeoutMs === undefined ? undefined : setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")), Math.max(0, ctx.timeoutMs),
  );
  const close = () => { clearTimeout(timer); controller.abort(); };
  try {
    if (signal.aborted) throw signal.reason;
    const headers = new Headers(init.headers);
    if (authenticated) {
      if (!ctx.credentials.apiKey) {
        throw new VoiceEngineError("Missing cartesia credentials", { provider: PROVIDER, code: "auth" });
      }
      headers.set("X-API-Key", ctx.credentials.apiKey); headers.set("Cartesia-Version", "2025-04-16");
    }
    const url = authenticated ? (ctx.baseUrl ?? BASE_URL).replace(/\/$/, "") + path : path;
    const response = await abortable(ctx.fetch(url, { ...init, headers, signal }), signal);
    if (!response.ok) {
      const raw = await abortable(response.text(), signal);
      let details: unknown = raw;
      try { details = JSON.parse(raw); } catch { /* Non-JSON error responses are preserved. */ }
      const record = object(details);
      const message = record.err_msg ?? record.message ?? object(record.error).message ?? record.error ?? response.statusText;
      const retry = response.headers.get("retry-after");
      const parsed = retry === null ? NaN : /^\d+(\.\d+)?$/.test(retry.trim()) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      throw new VoiceEngineError(String(message || `${PROVIDER} HTTP ${response.status}`), {
        provider: PROVIDER, code: codeFromStatus(response.status), status: response.status,
        retryAfterMs: Number.isFinite(parsed) ? Math.max(0, parsed) : undefined, details,
      });
    }
    return { response, signal, close };
  } catch (error) {
    const normalized = failure(error, signal);
    close();
    throw normalized;
  }
}

/** Consume a response before releasing its timeout and abort resources. */
export async function request<T>(ctx: ProviderContext, path: string, init: RequestInit, consume: (response: Response) => Promise<T>, authenticated = true): Promise<T> {
  const session = await open(ctx, path, init, authenticated);
  try { return await abortable(consume(session.response), session.signal); }
  catch (error) {
    if (error instanceof SyntaxError) throw new VoiceEngineError("Invalid JSON response", { provider: PROVIDER, code: "provider_unavailable", cause: error });
    throw failure(error, session.signal);
  } finally { session.close(); }
}

/** Send JSON using the caller's injected transport. */
export async function json(ctx: ProviderContext, path: string, body?: unknown, signal?: AbortSignal, method = body === undefined ? "GET" : "POST"): Promise<unknown> {
  return request(ctx, path, { method, signal, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) },
    async response => response.status === 204 ? undefined : response.json());
}

/** Yield transport bytes and cancel the reader when a consumer stops early. */
export async function* stream(ctx: ProviderContext, path: string, init: RequestInit): AsyncGenerator<Uint8Array> {
  const session = await open(ctx, path, init);
  const reader = session.response.body?.getReader();
  try {
    if (!reader) throw new VoiceEngineError("Empty response stream", { provider: PROVIDER, code: "provider_unavailable" });
    while (true) {
      const next = await abortable(reader.read(), session.signal);
      if (next.done) break;
      if (next.value.length) yield next.value;
    }
  } catch (error) { throw failure(error, session.signal); }
  finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    session.close();
  }
}

/** Decode split UTF-8 records without assuming HTTP chunk boundaries. */
export async function* lines(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    let index: number;
    while ((index = pending.indexOf("\n")) >= 0) {
      yield pending.slice(0, index).replace(/\r$/, "");
      pending = pending.slice(index + 1);
    }
  }
  pending += decoder.decode();
  if (pending) yield pending.replace(/\r$/, "");
}

/** Parse stream JSON and report malformed records as provider failures. */
export function parse(value: string): Record<string, unknown> {
  try { return object(JSON.parse(value)); }
  catch (cause) { throw new VoiceEngineError("Invalid stream JSON", { provider: PROVIDER, code: "provider_unavailable", cause }); }
}

/** Join audio chunks into one buffer. */
export function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Apply common catalog filters after provider normalization. */
export function filterVoices(voices: VoiceDescriptor[], query: VoiceQuery = {}): VoiceDescriptor[] {
  const origins = query.origin ? [query.origin].flat() : undefined;
  const providers = query.provider ? [query.provider].flat() : undefined;
  return voices.filter(voice =>
    (!providers || providers.includes(voice.provider)) &&
    (!query.language || voice.languages.some(lang => lang.toLowerCase() === query.language!.toLowerCase() || lang.toLowerCase().split("-")[0] === query.language!.toLowerCase().split("-")[0])) &&
    (!query.gender || voice.gender === query.gender) && (!query.age || voice.age === query.age) &&
    (!origins || origins.includes(voice.origin)) && (!query.tags || query.tags.every(tag => voice.tags.includes(tag))) &&
    (!query.search || [voice.name, voice.description, ...voice.tags].join(" ").toLowerCase().includes(query.search.toLowerCase())),
  ).slice(0, query.limit === undefined ? undefined : Math.max(0, query.limit));
}

/** Normalize gender labels without inferring unsupported metadata. */
export function gender(value: unknown): VoiceDescriptor["gender"] {
  const text = String(value ?? "").toLowerCase();
  if (text === "masculine") return "male";
  if (text === "feminine") return "female";
  return text === "male" || text === "female" || text === "neutral" ? text : "unknown";
}

/** Normalize common catalog age labels. */
export function age(value: unknown): VoiceDescriptor["age"] {
  const text = String(value ?? "").toLowerCase().replace(/[ -]/g, "_");
  if (text === "young_adult" || text === "young") return "young";
  if (text === "middle_aged" || text === "adult") return "middle_aged";
  if (text === "old" || text === "senior" || text === "mature") return "old";
  return text === "child" ? "child" : "unknown";
}

