import type { ProviderContext } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";

/** Resolve the Speech or Custom Voice origin, including private custom domains. */
export function endpoint(ctx: ProviderContext, custom = false): string {
  const region = ctx.credentials.region ?? "westeurope";
  return (custom ? ctx.credentials.customVoiceEndpoint ?? ctx.baseUrl ?? ctx.credentials.endpoint ?? `https://${region}.api.cognitive.microsoft.com`
    : ctx.baseUrl ?? ctx.credentials.endpoint ?? `https://${region}.tts.speech.microsoft.com`).replace(/\/$/, "").replace(/\/cognitiveservices\/v1$/, "");
}

/** Build subscription-key headers, never reading environment variables directly. */
export function headers(ctx: ProviderContext): Record<string, string> {
  if (!ctx.credentials.apiKey) throw new VoiceEngineError("Azure Speech apiKey is required", { provider: "azure", code: "auth" });
  return { "Ocp-Apim-Subscription-Key": ctx.credentials.apiKey, "User-Agent": "paperclip-voice-engine/0.1" };
}
