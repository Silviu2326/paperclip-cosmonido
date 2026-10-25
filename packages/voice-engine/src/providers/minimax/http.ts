import type { ProviderContext } from "../../core/types.js";
import { codeFromStatus, VoiceEngineError } from "../../core/errors.js";
import type { VoiceEngineErrorCode } from "../../core/errors.js";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function failure(message: string, code: "invalid_request" | "unsupported" | "provider_unavailable" = "provider_unavailable") {
  return new VoiceEngineError(message, { provider: "minimax", code });
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}

export function checkStatus(body: Record<string, unknown>, status = 200, retryAfterMs?: number): void {
  const base = record(body.base_resp);
  if (base.status_code === undefined || Number(base.status_code) === 0) return;
  const codes: Record<number, VoiceEngineErrorCode> = { 1002: "rate_limit", 1004: "auth", 1008: "quota_exceeded",
    2013: "invalid_request", 1039: "invalid_request", 2037: "content_policy", 2038: "content_policy" };
  throw new VoiceEngineError(String(base.status_msg ?? "MiniMax API error"), { provider: "minimax", status,
    code: codes[Number(base.status_code)] ?? (status >= 400 ? codeFromStatus(status) : "unknown"), retryAfterMs, details: body });
}

export function transportError(error: unknown, signal: AbortSignal): VoiceEngineError {
  if (error instanceof VoiceEngineError) return error;
  const reason = signal.aborted ? signal.reason : error;
  const name = reason instanceof Error ? reason.name : undefined;
  const code = name === "TimeoutError" ? "timeout" : signal.aborted || name === "AbortError" ? "aborted" : "provider_unavailable";
  return new VoiceEngineError(`MiniMax request ${code}`, { provider: "minimax", code, cause: error });
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
  if (!ctx.credentials.apiKey) throw new VoiceEngineError("MiniMax API key is required", { provider: "minimax", code: "auth" });
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const timer = ctx.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), ctx.timeoutMs);
  const close = () => { if (timer !== undefined) clearTimeout(timer); };
  try {
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${ctx.credentials.apiKey}`);
    const url = new URL(`${(ctx.baseUrl ?? "https://api.minimax.io").replace(/\/$/, "")}${path}`);
    if (ctx.credentials.groupId) url.searchParams.set("GroupId", ctx.credentials.groupId);
    const response = await abortable(ctx.fetch(url.toString(), { ...init, headers, signal }), signal);
    if (!response.ok) {
      const body = await abortable(response.text(), signal);
      let details: unknown = body;
      try { details = JSON.parse(body); } catch { /* Plain-text proxy errors are valid. */ }
      const fields = record(details);
      checkStatus(fields, response.status, retryAfter(response));
      const message = fields.message ?? fields.detail ?? body;
      throw new VoiceEngineError(typeof message === "string" ? message : JSON.stringify(message), {
        provider: "minimax", code: codeFromStatus(response.status), status: response.status,
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
  return consume(ctx, path, init, async response => {
    const body = record(await response.json());
    checkStatus(body, response.status, retryAfter(response));
    return body;
  });
}

export function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function* chunks(ctx: ProviderContext, path: string, init: RequestInit): AsyncGenerator<{ bytes: Uint8Array; retryAfterMs?: number }> {
  const connection = await open(ctx, path, init);
  const reader = connection.response.body?.getReader();
  try {
    if (!reader) throw failure("MiniMax returned no audio stream");
    while (true) {
      const { value, done } = await abortable(reader.read(), connection.signal);
      if (done) break;
      if (value.length) yield { bytes: value, retryAfterMs: retryAfter(connection.response) };
    }
  } catch (error) { throw transportError(error, connection.signal); }
  finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    connection.close();
  }
}

