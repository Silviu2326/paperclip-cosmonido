import { codeFromStatus, VoiceEngineError } from "./errors.js";
import type { ProviderContext, ProviderId } from "./types.js";

/** Combine caller cancellation with a timeout (milliseconds). */
export function withTimeout(signal: AbortSignal | undefined | null, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(0, Math.floor(ms)));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Read response chunks and cancel the reader when iteration ends early. */
export async function* iterateBody(response: Response): AsyncIterable<Uint8Array> {
  if (!response.body) return;
  const reader = response.body.getReader();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { finished = true; return; }
      if (value.byteLength) yield value;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Consume a response while enforcing a limit on actual bytes received. */
export async function readBounded(response: Response, maxBytes: number, label = "Response"): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new VoiceEngineError("maxBytes must be a nonnegative integer", { code: "invalid_request" });
  const tooLarge = () => new VoiceEngineError(`${label} exceeds ${maxBytes} bytes`, { code: "invalid_request" });
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of iterateBody(response)) {
    length += chunk.byteLength;
    if (length > maxBytes) throw tooLarge();
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Parse Retry-After delta seconds or HTTP dates into milliseconds. */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header?.trim()) return undefined;
  const value = header.trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const ms = Number(value) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (/^[+-]?[\d.]+$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function bodyMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return undefined;
  const value = body as Record<string, unknown>;
  for (const field of ["message", "error", "detail", "status"]) {
    const message = bodyMessage(value[field]);
    if (message) return message;
  }
  return undefined;
}

/** Map HTTP errors with a bounded, best-effort JSON provider message. */
export async function errorFromResponse(response: Response, provider: ProviderId): Promise<VoiceEngineError> {
  let details: unknown;
  let message: string | undefined;
  try {
    const text = new TextDecoder().decode(await readBounded(response, 64 * 1024, "Error response"));
    try { details = JSON.parse(text); message = bodyMessage(details); }
    catch { message = text.trim().slice(0, 500); }
  } catch { /* Preserve the HTTP status even when the error body is unreadable. */ }
  return new VoiceEngineError(`${provider}: ${message || response.statusText || `HTTP ${response.status}`}`, {
    provider, code: codeFromStatus(response.status), status: response.status,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")), details,
  });
}

type FetchOptions = { provider?: ProviderId; maxBytes?: number };

async function fetchBody(ctx: ProviderContext, input: string | URL | Request, init: RequestInit, options: FetchOptions): Promise<Uint8Array> {
  const originalSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = withTimeout(originalSignal, ctx.timeoutMs ?? 60_000);
  try {
    signal.throwIfAborted();
    const response = await ctx.fetch(input, { ...init, signal });
    if (!response.ok) throw await errorFromResponse(response, options.provider ?? "unknown");
    return await readBounded(response, options.maxBytes ?? 64 * 1024 * 1024);
  } catch (error) {
    if (error instanceof VoiceEngineError) throw error;
    const timeout = signal.aborted && !originalSignal?.aborted;
    throw new VoiceEngineError(timeout ? "Request timed out" : signal.aborted ? "Request aborted" : "Network request failed", {
      code: timeout ? "timeout" : signal.aborted ? "aborted" : "provider_unavailable", provider: options.provider, cause: error,
    });
  }
}

/** Fetch JSON through an injected transport with bounded reads and error mapping. */
export async function fetchJson<T = unknown>(ctx: ProviderContext, input: string | URL | Request, init: RequestInit = {}, options: FetchOptions = {}): Promise<T> {
  const bytes = await fetchBody(ctx, input, init, { maxBytes: 8 * 1024 * 1024, ...options });
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch (cause) { throw new VoiceEngineError("Provider returned invalid JSON", { code: "provider_unavailable", provider: options.provider, cause }); }
}

/** Fetch raw bytes through an injected transport with bounded reads. */
export function fetchBytes(ctx: ProviderContext, input: string | URL | Request, init: RequestInit = {}, options: FetchOptions = {}): Promise<Uint8Array> {
  return fetchBody(ctx, input, init, options);
}

type MultipartPart = { name: string; value: string | Blob | Uint8Array; fileName?: string; contentType?: string };

/** Build multipart form data; fetch supplies its boundary and Content-Type header. */
export function buildMultipart(parts: MultipartPart[]): FormData {
  const form = new FormData();
  for (const part of parts) {
    if (typeof part.value === "string") form.append(part.name, part.value);
    else {
      const blob = part.value instanceof Blob ? part.value : new Blob([new Uint8Array(part.value)], { type: part.contentType });
      form.append(part.name, blob, part.fileName ?? "audio");
    }
  }
  return form;
}
