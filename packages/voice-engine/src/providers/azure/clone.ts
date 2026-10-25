import type { AudioInput, CloneVoiceRequest, CloneVoiceResult, ProviderContext, VoiceDescriptor } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { endpoint, headers } from "./api.js";
import { jsonHttp } from "./http.js";

type Resource = Record<string, unknown> & { id?: string; status?: string; speakerProfileId?: string };
const version = "2024-02-01-preview";

function url(ctx: ProviderContext, kind: string, id: string): string {
  return `${endpoint(ctx, true)}/customvoice/${kind}/${encodeURIComponent(id)}?api-version=${version}`;
}

function asAudio(value: unknown): AudioInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const audio = value as AudioInput;
  return audio.data instanceof Uint8Array && audio.data.length > 0 && typeof audio.mimeType === "string" ? audio : undefined;
}

function appendAudio(form: FormData, audio: AudioInput) {
  form.append("audiodata", new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }), audio.fileName ?? "sample.wav");
}

function checkFailure(resource: Resource) {
  if (/failed|canceled/i.test(resource.status ?? "")) throw new VoiceEngineError("Azure Personal Voice operation failed", { provider: "azure", code: "invalid_request", details: resource });
}

function descriptor(resource: Resource, name?: string, language?: string): VoiceDescriptor {
  checkFailure(resource);
  const id = resource.speakerProfileId ? `personal:${resource.speakerProfileId}` : `personal-job:${resource.id}`;
  return { id: `azure:${id}`, provider: "azure", providerVoiceId: id, name: name ?? String(resource.displayName ?? resource.id),
    languages: language ? [language] : [], gender: "unknown", age: "unknown", tags: ["personal-voice"], origin: "cloned", models: ["custom-neural"], raw: { ...resource } };
}

/** Retrieve a Personal Voice resource by its job ID, not its speaker profile ID. */
export async function getPersonalVoice(ctx: ProviderContext, jobId: string, signal?: AbortSignal): Promise<VoiceDescriptor> {
  const id = jobId.replace(/^personal-job:/, "");
  const resource = await jsonHttp<Resource>(ctx, url(ctx, "personalvoices", id), { headers: headers(ctx), signal });
  return descriptor({ ...resource, id: resource.id ?? id });
}

async function pause(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new VoiceEngineError("Request aborted", { provider: "azure", code: "aborted" });
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new VoiceEngineError("Request aborted", { provider: "azure", code: "aborted" })); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Best-effort, limited-access Personal Voice creation; professional CNV training is not implemented. */
export async function cloneVoice(ctx: ProviderContext, request: CloneVoiceRequest): Promise<CloneVoiceResult> {
  if (!request.consent?.attested) throw new VoiceEngineError("Personal Voice requires consent.attested", { provider: "azure", code: "invalid_request" });
  if (request.mode === "professional") throw new VoiceEngineError("Professional Custom Neural Voice training is not implemented", { provider: "azure", code: "unsupported" });
  const options = request.providerOptions ?? {};
  const consentAudio = asAudio(options.consentAudio);
  const consentAudioUrl = typeof options.consentAudioUrl === "string" ? options.consentAudioUrl : undefined;
  const audios = options.audios && typeof options.audios === "object" ? options.audios : undefined;
  if ((!consentAudio && !consentAudioUrl) || (!audios && !request.samples.length) || typeof options.companyName !== "string" || !options.companyName.trim() || !request.language) {
    throw new VoiceEngineError("Personal Voice requires language, companyName, consentAudio (or consentAudioUrl), and samples (or audios)", { provider: "azure", code: "invalid_request" });
  }
  const projectId = String(options.projectId ?? crypto.randomUUID());
  const consentId = String(options.consentId ?? crypto.randomUUID());
  const personalId = String(options.personalVoiceId ?? crypto.randomUUID());
  const auth = headers(ctx);
  const post = (kind: string, id: string, body: Record<string, unknown> | FormData, method: string) => jsonHttp<Resource>(ctx, url(ctx, kind, id), {
    method, headers: body instanceof FormData ? auth : { ...auth, "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body), signal: request.signal,
  });
  // PUT takes URLs; local recordings use the documented multipart POST variants.
  await post("projects", projectId, { kind: "PersonalVoice", description: request.description ?? request.name }, "PUT");
  const consentFields = { projectId, voiceTalentName: String(options.voiceTalentName ?? request.name), companyName: options.companyName, locale: request.language };
  let consentBody: Record<string, unknown> | FormData = { ...consentFields, audioUrl: consentAudioUrl };
  if (consentAudio) {
    const form = new FormData();
    for (const [key, value] of Object.entries(consentFields)) form.append(key, value);
    appendAudio(form, consentAudio); consentBody = form;
  }
  let consent = await post("consents", consentId, consentBody, consentAudio ? "POST" : "PUT");
  const attempts = typeof options.pollAttempts === "number" && Number.isFinite(options.pollAttempts) ? Math.max(1, Math.min(60, Math.floor(options.pollAttempts))) : 10;
  const interval = typeof options.pollIntervalMs === "number" && Number.isFinite(options.pollIntervalMs) ? Math.max(0, Math.min(5000, options.pollIntervalMs)) : 1000;
  for (let i = 0; !/^succeeded$/i.test(consent.status ?? "") && i < attempts; i++) {
    checkFailure(consent);
    await pause(interval, request.signal);
    consent = await jsonHttp<Resource>(ctx, url(ctx, "consents", consentId), { headers: auth, signal: request.signal });
  }
  checkFailure(consent);
  if (!/^succeeded$/i.test(consent.status ?? "")) throw new VoiceEngineError("Azure consent verification is still pending", {
    provider: "azure", code: "timeout", retryable: false, details: { projectId, consentId, personalVoiceId: personalId },
  });
  let voiceBody: Record<string, unknown> | FormData = { projectId, consentId, displayName: request.name, audios };
  if (!audios) {
    const form = new FormData();
    form.append("projectId", projectId); form.append("consentId", consentId); form.append("displayName", request.name);
    for (const sample of request.samples) appendAudio(form, sample);
    voiceBody = form;
  }
  const resource = await post("personalvoices", personalId, voiceBody, audios ? "PUT" : "POST");
  const voice = descriptor({ ...resource, id: resource.id ?? personalId }, request.name, request.language);
  return { voice, jobId: personalId, status: /^succeeded$/i.test(resource.status ?? "") && resource.speakerProfileId ? "ready" : "training" };
}
