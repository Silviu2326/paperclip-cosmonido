import type { AudioInput, ProviderContext } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";

export type JsonObject = Record<string, unknown>;

/** Read a JSON object without accepting arrays or null. */
export function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

/** Construct a provider-scoped validation error. */
export function invalid(message: string): VoiceEngineError {
  return new VoiceEngineError(message, { code: "invalid_request", provider: "elevenlabs" });
}

/** Construct an error for malformed successful provider responses. */
export function malformed(message: string): VoiceEngineError {
  return new VoiceEngineError(message, { code: "provider_unavailable", provider: "elevenlabs", retryable: false });
}

/** Require a nonempty provider response identifier. */
export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw malformed(`ElevenLabs response is missing ${field}`);
  return value;
}

/** Convert HTTP and ElevenLabs detail.status errors to the shared error contract. */
export function responseError(status: number, headers: Headers, body: unknown): VoiceEngineError {
  const root = object(body);
  const detail = object(root.detail);
  const tag = String(detail.code ?? detail.status ?? root.code ?? root.status ?? detail.type ?? "").toLowerCase();
  const message = typeof detail.message === "string" ? detail.message
    : typeof root.detail === "string" ? root.detail
      : typeof root.message === "string" ? root.message : `ElevenLabs request failed (${status})`;
  let code = codeFromStatus(status);
  if (/quota_exceeded|insufficient_credits|credit_balance/.test(tag)) code = "quota_exceeded";
  else if (/invalid_api_key|missing_api_key|unauthorized|authentication/.test(tag)) code = "auth";
  else if (/_not_found/.test(tag)) code = "not_found";
  else if (/too_many_concurrent_requests|concurrent_limit_exceeded|rate_limit|too_many_requests/.test(tag)) code = "rate_limit";
  else if (/system_busy|service_unavailable/.test(tag)) code = "provider_unavailable";
  else if (/detected_unusual_activity|content_policy|content_filter|content_violation|content_not_allowed|unsafe_content|content_rejected|moderation|safety|prohibited/.test(tag)) code = "content_policy";
  const retry = headers.get("retry-after");
  const seconds = retry === null || retry.trim() === "" ? NaN : Number(retry);
  const date = retry === null ? NaN : Date.parse(retry);
  const retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
    : Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
  return new VoiceEngineError(message, { code, provider: "elevenlabs", status, retryAfterMs, details: body });
}

function transportError(error: unknown, signal: AbortSignal): VoiceEngineError {
  if (error instanceof VoiceEngineError) return error;
  const name = object(signal.aborted ? signal.reason : error).name;
  const code = name === "TimeoutError" ? "timeout" : signal.aborted || name === "AbortError" ? "aborted" : "provider_unavailable";
  return new VoiceEngineError(`ElevenLabs ${code === "aborted" ? "request aborted" : code === "timeout" ? "request timed out" : "network request failed"}`, {
    code, provider: "elevenlabs", cause: error,
  });
}

/** Race body reads as well as fetch against cancellation, including injected fetch implementations. */
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export interface HttpRequest {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: JsonObject;
  form?: FormData;
  signal?: AbortSignal;
  accept?: string;
}

export interface HttpResponse {
  response: Response;
  read<T>(action: () => Promise<T>): Promise<T>;
  close(): void;
}

/** Open an authenticated request; callers must close it after consuming the body. */
export async function openRequest(ctx: ProviderContext, path: string, options: HttpRequest = {}): Promise<HttpResponse> {
  if (!ctx.credentials.apiKey) throw new VoiceEngineError("ElevenLabs requires an API key", { code: "auth", provider: "elevenlabs" });
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason ?? new DOMException("Aborted", "AbortError"));
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = ctx.timeoutMs ?? 120_000;
  const timer = timeout > 0 ? setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeout) : undefined;
  const close = () => {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    if (!controller.signal.aborted) controller.abort(new DOMException("Request closed", "AbortError"));
  };
  const read = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      controller.signal.throwIfAborted();
      return await abortable(action(), controller.signal);
    } catch (error) { throw transportError(error, controller.signal); }
  };
  try {
    const url = new URL(`${(ctx.baseUrl ?? "https://api.elevenlabs.io").replace(/\/+$/, "")}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = new Headers({ "xi-api-key": ctx.credentials.apiKey, accept: options.accept ?? "application/json" });
    if (options.json !== undefined) headers.set("content-type", "application/json");
    const response = await read(() => ctx.fetch(url.toString(), {
      method: options.method ?? (options.json !== undefined || options.form ? "POST" : "GET"),
      headers, body: options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json)), signal: controller.signal,
    }));
    if (!response.ok) {
      const text = await read(() => response.text());
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* Preserve non-JSON error details. */ }
      throw responseError(response.status, response.headers, body);
    }
    return { response, read, close };
  } catch (error) {
    const mapped = transportError(error, controller.signal);
    close();
    throw mapped;
  }
}

/** Execute a request and parse its JSON response with timeout coverage for the body. */
export async function requestJson(ctx: ProviderContext, path: string, options: HttpRequest = {}): Promise<JsonObject> {
  const http = await openRequest(ctx, path, options);
  try {
    const text = await http.read(() => http.response.text());
    if (!text.trim()) return {};
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw malformed("Expected a JSON object from ElevenLabs");
      return value as JsonObject;
    } catch (error) {
      if (error instanceof VoiceEngineError) throw error;
      throw malformed("Invalid JSON from ElevenLabs");
    }
  } finally { http.close(); }
}

/** Read audio bytes and the provider request ID. */
export async function requestAudio(ctx: ProviderContext, path: string, options: HttpRequest = {}) {
  const http = await openRequest(ctx, path, { ...options, accept: options.accept ?? "audio/*" });
  try {
    return { data: new Uint8Array(await http.read(() => http.response.arrayBuffer())),
      requestId: http.response.headers.get("request-id") ?? undefined,
      contentType: http.response.headers.get("content-type")?.split(";")[0] };
  } finally { http.close(); }
}

/** Stream a response with cancellation and reader cleanup even when the consumer stops early. */
export async function* responseChunks(http: HttpResponse): AsyncGenerator<Uint8Array> {
  const reader = http.response.body?.getReader();
  if (!reader) throw malformed("ElevenLabs returned no response body");
  try {
    while (true) {
      const { done, value } = await http.read(() => reader.read());
      if (done) break;
      if (value.length) yield value;
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Decode NDJSON regardless of HTTP chunk and UTF-8 character boundaries. */
export async function* jsonLines(http: HttpResponse): AsyncGenerator<JsonObject> {
  const decoder = new TextDecoder();
  let pending = "";
  const parse = (line: string): JsonObject => {
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Not an object");
      return value as JsonObject;
    } catch { throw malformed("Invalid ElevenLabs timestamp stream JSON"); }
  };
  for await (const chunk of responseChunks(http)) {
    pending += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line) yield parse(line);
    }
    if (pending.length > 32 * 1024 * 1024) throw malformed("ElevenLabs timestamp stream line is too large");
  }
  pending += decoder.decode();
  if (pending.trim()) yield parse(pending.trim());
}

/** Append audio under the documented multipart field (repeated `files`, not literal `files[]`). */
export function appendAudio(form: FormData, field: string, audio: AudioInput, index = 0): void {
  if (!(audio.data instanceof Uint8Array) || !audio.data.length) throw invalid("Audio samples must contain bytes");
  const ext = ({ "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac" } as Record<string, string>)[audio.mimeType] ?? "bin";
  form.append(field, new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }), audio.fileName ?? `sample-${index}.${ext}`);
}

/** Append scalar/JSON provider-specific fields to a multipart request. */
export function appendFields(form: FormData, fields: JsonObject): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
}

/** Decode ElevenLabs base64 audio, rejecting malformed provider payloads. */
export function decodeAudio(value: unknown): Uint8Array {
  if (typeof value !== "string") throw malformed("ElevenLabs response is missing base64 audio");
  try { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
  catch { throw malformed("ElevenLabs returned invalid base64 audio"); }
}
