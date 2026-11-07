import { VoiceEngineError } from "../core/errors.js";
import { UsageError } from "./args.js";

/** Normalize errors without exposing provider response bodies or credentials. */
export function errorDetails(error: unknown): { code: string; provider?: string; status?: number; message: string } {
  return error instanceof VoiceEngineError
    ? { code: error.code, provider: error.provider, status: error.status, message: error.message }
    : { code: error instanceof UsageError ? "usage" : "unknown", message: error instanceof Error ? error.message : String(error) };
}

/** Format actionable engine errors consistently in diagnostics and tables. */
export function errorText(error: ReturnType<typeof errorDetails>): string {
  return Object.entries(error).filter(([, value]) => value !== undefined).map(([key, value]) => key === "message" ? value : `${key}=${value}`).join(" ");
}
