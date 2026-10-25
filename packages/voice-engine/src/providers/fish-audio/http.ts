import type { ProviderContext } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function failure(message: string, code: "invalid_request" | "unsupported" | "provider_unavailable" = "provider_unavailable") {
  return new VoiceEngineError(message, { provider: "fish-audio", code });
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}

export function transportError(error: unknown, signal: AbortSignal): VoiceEngineError {
  if (error instanceof VoiceEngineError) return error;
  const reason = signal.aborted ? signal.reason : error;
  const name = reason instanceof Error ? reason.name : undefined;
  const code = name === "TimeoutError" ? "timeout" : signal.aborted || name === "AbortError" ? "aborted" : "provider_unavailable";
  return new VoiceEngineError(`Fish Audio request ${code}`, { provider: "fish-audio", code, cause: error });
}

export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export async function open(ctx: ProviderContext, path: string, init: RequestInit = {}) {
  if (!ctx.credentials.apiKey) throw new VoiceEngineError("Fish Audio API key is required", { provider: "fish-audio", code: "auth" });
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const timer = ctx.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), ctx.timeoutMs);
  const close = () => { if (timer !== undefined) clearTimeout(timer); };
  try {
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${ctx.credentials.apiKey}`);
    const response = await abortable(ctx.fetch(`${(ctx.baseUrl ?? "https://api.fish.audio").replace(/\/$/, "")}${path}`, { ...init, headers, signal }), signal);
    if (!response.ok) {
      const body = await abortable(response.text(), signal);
      let details: unknown = body;
      try { details = JSON.parse(body); } catch { /* Plain-text proxy errors are valid. */ }
      const fields = record(details);
      const message = fields.message ?? fields.detail ?? body;
      throw new VoiceEngineError(typeof message === "string" ? message : JSON.stringify(message), {
        provider: "fish-audio", code: codeFromStatus(response.status), status: response.status,
        retryAfterMs: retryAfter(response), details,
      });
    }
    return { response, signal, close };
  } catch (error) { close(); throw transportError(error, signal); }
}

export async function consume<T>(ctx: ProviderContext, path: string, init: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
  const connection = await open(ctx, path, init);
  try { return await abortable(read(connection.response), connection.signal); }
  catch (error) { throw transportError(error, connection.signal); }
  finally { connection.close(); }
}

export function json(ctx: ProviderContext, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  return consume(ctx, path, init, async response => record(await response.json()));
}

export function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function* chunks(ctx: ProviderContext, path: string, init: RequestInit): AsyncGenerator<Uint8Array> {
  const connection = await open(ctx, path, init);
  const reader = connection.response.body?.getReader();
  try {
    if (!reader) throw failure("Fish Audio returned no audio stream");
    while (true) {
      const { value, done } = await abortable(reader.read(), connection.signal);
      if (done) break;
      if (value.length) yield value;
    }
  } catch (error) { throw transportError(error, connection.signal); }
  finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    connection.close();
  }
}
