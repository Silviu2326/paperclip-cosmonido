import type { ProviderId } from "./types.js";

export type VoiceEngineErrorCode =
  | "auth"
  | "rate_limit"
  | "quota_exceeded"
  | "invalid_request"
  | "unsupported"
  | "not_found"
  | "provider_unavailable"
  | "timeout"
  | "aborted"
  | "content_policy"
  | "unknown";

export class VoiceEngineError extends Error {
  readonly code: VoiceEngineErrorCode;
  readonly provider?: ProviderId;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code: VoiceEngineErrorCode;
      provider?: ProviderId;
      status?: number;
      retryable?: boolean;
      retryAfterMs?: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "VoiceEngineError";
    this.code = options.code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
    this.retryable = options.retryable ?? defaultRetryable(options.code);
  }
}

function defaultRetryable(code: VoiceEngineErrorCode): boolean {
  return code === "rate_limit" || code === "provider_unavailable" || code === "timeout";
}

export function isVoiceEngineError(error: unknown): error is VoiceEngineError {
  return error instanceof VoiceEngineError;
}

/** Map an HTTP status to an error code. Providers refine with body parsing. */
export function codeFromStatus(status: number): VoiceEngineErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 402) return "quota_exceeded";
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "provider_unavailable";
  if (status === 400 || status === 422) return "invalid_request";
  return "unknown";
}
