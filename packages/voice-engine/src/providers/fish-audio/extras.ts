import type { AudioInput, ProviderContext } from "../../core/types.js";
import { json, jsonBody } from "./http.js";

/** Transcribe raw audio using Fish's JSON/base64 ASR endpoint. */
export function transcribe(ctx: ProviderContext, audio: AudioInput, options: { language?: string; ignoreTimestamps?: boolean; signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
  return json(ctx, "/v1/asr", { ...jsonBody({ audio: Buffer.from(audio.data).toString("base64"), language: options.language,
    ignore_timestamps: options.ignoreTimestamps ?? false }), signal: options.signal });
}

/** Return the unmodified Fish API-credit wallet response. */
export function getBalance(ctx: ProviderContext, signal?: AbortSignal) {
  return json(ctx, "/wallet/self/api-credit", { signal });
}
