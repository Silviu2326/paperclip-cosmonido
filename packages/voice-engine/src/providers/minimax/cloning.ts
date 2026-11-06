import type { CloneVoiceRequest, CloneVoiceResult, DesignVoiceRequest, DesignVoiceResult, ProviderContext, VoiceDescriptor } from "../../core/types.js";
import { decodeHex } from "./audio.js";
import { failure, json, jsonBody, record } from "./http.js";
import { normalizeVoice } from "./voices.js";

function voiceId(value: unknown, name: string): string {
  if (value !== undefined) {
    if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9-]{7,}$/.test(value)) throw failure("MiniMax voice_id must contain at least 8 letters/digits/hyphens and start with a letter", "invalid_request");
    return value;
  }
  const slug = name.normalize("NFKD").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  return `voice-${slug || "clone"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function cloneVoice(ctx: ProviderContext, request: CloneVoiceRequest): Promise<CloneVoiceResult> {
  if (!request.consent?.attested) throw failure("Voice cloning requires consent.attested", "invalid_request");
  if (request.mode === "professional") throw failure("MiniMax supports instant cloning only", "unsupported");
  if (request.samples.length !== 1) throw failure("MiniMax cloning requires exactly one reference audio file", "invalid_request");
  const options = request.providerOptions ?? {};
  const id = voiceId(options.voice_id, request.name);
  const sample = request.samples[0];
  const form = new FormData();
  form.set("purpose", "voice_clone");
  form.set("file", new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }), sample.fileName ?? "sample.wav");
  const upload = await json(ctx, "/v1/files/upload", { method: "POST", body: form, signal: request.signal });
  const fileId = record(upload.file).file_id ?? upload.file_id;
  if (typeof fileId !== "number" && typeof fileId !== "string") throw failure("MiniMax upload returned no file_id");
  const result = await json(ctx, "/v1/voice_clone", { ...jsonBody({ ...options, file_id: fileId, voice_id: id,
    text: options.text, model: options.model ?? "speech-02-hd", need_noise_reduction: request.denoise ?? options.need_noise_reduction ?? false,
    need_volume_normalization: options.need_volume_normalization ?? true, accuracy: options.accuracy }), signal: request.signal });
  const voice = normalizeVoice({ ...result, voice_id: id, voice_name: request.name, description: request.description, consent: request.consent }, "cloned");
  if (request.language) voice.languages = [request.language];
  return { voice, status: "ready" };
}

export async function deleteVoice(ctx: ProviderContext, id: string, signal?: AbortSignal) {
  await json(ctx, "/v1/delete_voice", { ...jsonBody({ voice_type: "voice_cloning", voice_id: id }), signal });
}

export async function designVoice(ctx: ProviderContext, request: DesignVoiceRequest): Promise<DesignVoiceResult> {
  const options = request.providerOptions ?? {};
  if (options.voice_id !== undefined) voiceId(options.voice_id, "design");
  const result = await json(ctx, "/v1/voice_design", { ...jsonBody({ ...options, prompt: request.prompt,
    preview_text: request.text ?? "Hello! This is a preview of my voice." }), signal: request.signal });
  if (typeof result.voice_id !== "string" || !result.voice_id) throw failure("MiniMax design returned no voice_id");
  return { candidates: [{ candidateId: result.voice_id, description: request.prompt,
    preview: { data: decodeHex(result.trial_audio), mimeType: "audio/mpeg", format: { container: "mp3" } } }] };
}

/** MiniMax design already persists the voice; saving only names its local descriptor. */
export async function saveDesignedVoice(candidateId: string, name: string, description?: string): Promise<VoiceDescriptor> {
  return normalizeVoice({ voice_id: candidateId, voice_name: name, description, already_persisted: true }, "designed");
}
