import type { AudioInput, CloneVoiceRequest, CloneVoiceResult, ProviderContext } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { endpoint, headers } from "./api.js";
import { jsonHttp } from "./http.js";

function audio(value: AudioInput) {
  const encoding = ({ "audio/wav": "LINEAR16", "audio/x-wav": "LINEAR16", "audio/pcm": "PCM", "audio/mpeg": "MP3", "audio/mp3": "MP3", "audio/mp4": "M4A", "audio/m4a": "M4A" } as Record<string, string>)[value.mimeType];
  if (!encoding || !(value.data instanceof Uint8Array) || !value.data.length) throw new VoiceEngineError("Unsupported or empty Google cloning audio", { provider: "google", code: "invalid_request" });
  return { audioConfig: { audioEncoding: encoding }, content: Buffer.from(value.data).toString("base64") };
}

/** Enroll an allowlist-gated Instant Custom Voice using a separate consent recording. */
export async function cloneVoice(ctx: ProviderContext, request: CloneVoiceRequest): Promise<CloneVoiceResult> {
  if (!request.consent?.attested) throw new VoiceEngineError("Instant Custom Voice requires consent.attested", { provider: "google", code: "invalid_request" });
  if (request.mode === "professional") throw new VoiceEngineError("Google professional voice training is not implemented", { provider: "google", code: "unsupported" });
  const consent = request.providerOptions?.consentAudio as AudioInput | undefined;
  if (!consent || request.samples.length !== 1 || !request.consent.text || !request.language) throw new VoiceEngineError("Google cloning requires one reference sample, consentAudio, the provider consent script in consent.text, and language", { provider: "google", code: "invalid_request" });
  const data = await jsonHttp<{ voiceCloningKey?: string }>(ctx, endpoint(ctx, "/voices:generateVoiceCloningKey", true), {
    method: "POST", headers: headers(ctx), signal: request.signal, body: JSON.stringify({
      referenceAudio: audio(request.samples[0]), voiceTalentConsent: audio(consent), consentScript: request.consent.text, languageCode: request.language,
    }),
  });
  if (typeof data.voiceCloningKey !== "string" || !data.voiceCloningKey) throw new VoiceEngineError("Google returned no voice cloning key", { provider: "google", code: "provider_unavailable" });
  const id = `clone:${data.voiceCloningKey}`;
  return { status: "ready", voice: { id: `google:${id}`, provider: "google", providerVoiceId: id, name: request.name, description: request.description,
    languages: [request.language], gender: "unknown", age: "unknown", tags: ["instant-custom-voice"], origin: "cloned", models: ["chirp3-hd"],
    raw: { consentAttested: true, allowlistRequired: true } } };
}
