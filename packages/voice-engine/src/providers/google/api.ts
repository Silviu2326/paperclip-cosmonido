import type { ProviderContext } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";

/** Resolve a stable/beta Cloud TTS endpoint without loading application credentials. */
export function endpoint(ctx: ProviderContext, path: string, beta = false): string {
  const base = (ctx.baseUrl ?? ctx.credentials.baseUrl ?? "https://texttospeech.googleapis.com/v1").replace(/\/$/, "").replace(/\/v1(?:beta1)?$/, "");
  return `${base}/${beta ? "v1beta1" : "v1"}${path}`;
}

/** Authenticate with an explicit OAuth token or API key; OAuth takes precedence. */
export function headers(ctx: ProviderContext): Record<string, string> {
  if (!ctx.credentials.apiKey && !ctx.credentials.accessToken) throw new VoiceEngineError("Google requires apiKey or accessToken", { provider: "google", code: "auth" });
  const value: Record<string, string> = { "Content-Type": "application/json" };
  if (ctx.credentials.accessToken) value.Authorization = `Bearer ${ctx.credentials.accessToken}`;
  else value["X-Goog-Api-Key"] = ctx.credentials.apiKey!;
  if (ctx.credentials.project) value["X-Goog-User-Project"] = ctx.credentials.project;
  return value;
}
