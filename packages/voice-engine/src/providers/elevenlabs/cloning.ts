import type { AudioInput, CloneVoiceRequest, CloneVoiceResult, ProviderContext, UpdateVoiceRequest, VoiceDescriptor } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { appendAudio, appendFields, invalid, object, openRequest, requestJson, requiredString } from "./http.js";
import { getVoice, normalizeVoice } from "./voices.js";
import { languageCode } from "./models.js";

const pvcPath = (id: string) => `/v1/voices/pvc/${encodeURIComponent(id)}`;

function consent(request: CloneVoiceRequest): void {
  // A reusable voice replicates a person's identity: require an explicit caller attestation.
  // This local attestation never substitutes for ElevenLabs' ownership verification.
  if (request.consent?.attested !== true) throw invalid("Voice cloning requires consent.attested === true from the voice owner");
  if (!request.name.trim() || !request.samples.length) throw invalid("Voice cloning requires a name and at least one audio sample");
  for (const sample of request.samples) if (!(sample.data instanceof Uint8Array) || !sample.data.length) throw invalid("Voice samples must contain audio bytes");
}

/** Retrieve the PVC ownership challenge as the provider's base64 string or JSON value. */
export async function getProfessionalVoiceCaptcha(ctx: ProviderContext, voiceId: string, signal?: AbortSignal): Promise<unknown> {
  const http = await openRequest(ctx, `${pvcPath(voiceId)}/captcha`, { signal });
  try { return await http.read(() => http.response.json()); } finally { http.close(); }
}

/** Submit the voice owner's recording of the PVC challenge. */
export async function verifyProfessionalVoice(ctx: ProviderContext, voiceId: string, recording: AudioInput, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const form = new FormData();
  appendAudio(form, "recording", recording);
  return requestJson(ctx, `${pvcPath(voiceId)}/captcha`, { form, signal });
}

/** Request manual ownership verification with documents; approval is asynchronous. */
export async function requestProfessionalVoiceVerification(ctx: ProviderContext, voiceId: string, documents: AudioInput[], extraText?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!documents.length) throw invalid("Manual PVC verification requires supporting documents");
  const form = new FormData();
  documents.forEach((document, index) => appendAudio(form, "files", document, index));
  appendFields(form, { extra_text: extraText });
  return requestJson(ctx, `${pvcPath(voiceId)}/verification`, { form, signal });
}

/** Start training an already verified professional clone. */
export async function trainProfessionalVoice(ctx: ProviderContext, voiceId: string, modelId = "eleven_multilingual_v2", signal?: AbortSignal): Promise<Record<string, unknown>> {
  return requestJson(ctx, `${pvcPath(voiceId)}/train`, { json: { model_id: modelId }, signal });
}

/** Create an instant or professional clone, requiring an explicit voice-owner consent attestation. */
export async function cloneVoice(ctx: ProviderContext, request: CloneVoiceRequest): Promise<CloneVoiceResult> {
  consent(request);
  const labels = { ...request.labels, ...(request.language ? { language: languageCode(request.language) } : {}), consent_attested: "true" };
  if (request.mode !== "professional") {
    const form = new FormData();
    appendFields(form, { ...request.providerOptions, name: request.name, description: request.description, labels, remove_background_noise: request.denoise });
    request.samples.forEach((sample, index) => appendAudio(form, "files", sample, index));
    const data = await requestJson(ctx, "/v1/voices/add", { form, signal: request.signal });
    const voice = normalizeVoice({ ...data, voice_id: requiredString(data.voice_id, "voice_id"), name: request.name,
      description: request.description, labels, category: "cloned", consent: request.consent });
    const status = data.requires_verification === true ? "pending_verification" : "ready";
    voice.raw!.status = status;
    return { voice, status };
  }
  const options = { ...request.providerOptions };
  const language = request.language ?? (typeof options.language === "string" ? options.language : undefined);
  if (!language) throw invalid("Professional voice cloning requires the samples' language");
  const documents = options.verification_documents as AudioInput[] | undefined;
  const recording = options.verification_recording as AudioInput | undefined;
  if (documents !== undefined && !Array.isArray(documents)) throw invalid("verification_documents must be an array of files");
  for (const file of [...(documents ?? []), ...(recording ? [recording] : [])]) {
    if (!file || !(file.data instanceof Uint8Array) || !file.data.length || typeof file.mimeType !== "string") throw invalid("Verification files must contain bytes and a MIME type");
  }
  const modelId = typeof options.model_id === "string" ? options.model_id : "eleven_multilingual_v2";
  const data = await requestJson(ctx, "/v1/voices/pvc", { json: {
    name: request.name, description: request.description, language: languageCode(language), labels,
  }, signal: request.signal });
  const voiceId = requiredString(data.voice_id, "voice_id");
  const voice = normalizeVoice({ ...data, name: request.name, description: request.description, labels,
    category: "professional", consent: request.consent, fine_tuning: { state: { [modelId]: "not_started" } } });
  try {
    const form = new FormData();
    request.samples.forEach((sample, index) => appendAudio(form, "files", sample, index));
    appendFields(form, { remove_background_noise: request.denoise });
    await requestJson(ctx, `${pvcPath(voiceId)}/samples`, { form, signal: request.signal });
    if (documents?.length) {
      await requestProfessionalVoiceVerification(ctx, voiceId, documents, typeof options.verification_text === "string" ? options.verification_text : request.consent?.text, request.signal);
      voice.raw!.status = "pending_verification";
      return { voice, jobId: voiceId, status: "pending_verification" };
    }
    if (recording) await verifyProfessionalVoice(ctx, voiceId, recording, request.signal);
    try {
      await trainProfessionalVoice(ctx, voiceId, modelId, request.signal);
    } catch (error) {
      const detail = error instanceof VoiceEngineError ? object(object(error.details).detail) : {};
      if (/verification_required|voice_not_verified|not_verified/.test(String(detail.code ?? detail.status ?? ""))) {
        return { voice, jobId: voiceId, status: "pending_verification" };
      }
      throw error;
    }
    voice.raw!.status = "training";
    voice.raw!.fine_tuning = { state: { [modelId]: "queued" } };
    return { voice, jobId: voiceId, status: "training" };
  } catch (error) {
    // Preserve the created voice ID so recovery need not create another voice or consume another slot.
    if (error instanceof VoiceEngineError) throw new VoiceEngineError(error.message, {
      code: error.code, provider: "elevenlabs", status: error.status, retryable: false, retryAfterMs: error.retryAfterMs,
      details: { voice_id: voiceId, providerError: error.details }, cause: error,
    });
    throw error;
  }
}

/** Edit voice metadata and samples, retaining the current name when omitted. */
export async function updateVoice(ctx: ProviderContext, voiceId: string, request: UpdateVoiceRequest): Promise<VoiceDescriptor> {
  const current = request.name === undefined ? await getVoice(ctx, voiceId, request.signal) : undefined;
  const name = request.name ?? current?.name;
  if (!name) throw new VoiceEngineError("ElevenLabs voice not found", { code: "not_found", provider: "elevenlabs" });
  const form = new FormData();
  appendFields(form, { name, description: request.description, labels: request.labels });
  request.addSamples?.forEach((sample, index) => appendAudio(form, "files", sample, index));
  await requestJson(ctx, `/v1/voices/${encodeURIComponent(voiceId)}/edit`, { form, signal: request.signal });
  for (const sampleId of request.removeSampleIds ?? []) {
    await requestJson(ctx, `/v1/voices/${encodeURIComponent(voiceId)}/samples/${encodeURIComponent(sampleId)}`, { method: "DELETE", signal: request.signal });
  }
  const updated = await getVoice(ctx, voiceId, request.signal);
  if (!updated) throw new VoiceEngineError("ElevenLabs voice disappeared after editing", { code: "not_found", provider: "elevenlabs" });
  return updated;
}

/** Delete a voice owned by the account. */
export async function deleteVoice(ctx: ProviderContext, voiceId: string, signal?: AbortSignal): Promise<void> {
  await requestJson(ctx, `/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", signal });
}
