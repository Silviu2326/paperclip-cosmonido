import type { AudioInput, CloneVoiceRequest, CloneVoiceResult, ProviderContext, UpdateVoiceRequest, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { consume, failure, json, jsonBody, record } from "./http.js";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : [];
}

export function normalizeVoice(value: unknown, origin: VoiceDescriptor["origin"] = "community"): VoiceDescriptor {
  const raw = record(value);
  const id = String(raw._id ?? raw.id ?? "");
  if (!id) throw failure("Fish Audio returned a model without an id");
  const sample = record(Array.isArray(raw.samples) ? raw.samples[0] : undefined);
  return { id: `fish-audio:${id}`, provider: "fish-audio", providerVoiceId: id,
    name: String(raw.title ?? raw.name ?? id), description: typeof raw.description === "string" ? raw.description : undefined,
    languages: strings(raw.languages ?? raw.language).map(language => language.replace(/_/g, "-")),
    tags: strings(raw.tags), gender: "unknown", age: "unknown", origin, models: [], raw,
    previewUrl: typeof sample.audio === "string" ? sample.audio : typeof raw.cover_image === "string" ? raw.cover_image : undefined };
}

export function filterVoices(voices: VoiceDescriptor[], query: VoiceQuery = {}) {
  const origins = query.origin ? [query.origin].flat() : undefined;
  return voices.filter(voice => (!query.gender || voice.gender === query.gender)
    && (!query.age || voice.age === query.age) && (!origins || origins.includes(voice.origin))
    && (!query.tags || query.tags.every(tag => voice.tags.includes(tag)))
    && (!query.language || voice.languages.length === 0 || voice.languages.some(language => language.toLowerCase().split("-")[0] === query.language!.toLowerCase().split("-")[0]))
    && (!query.search || `${voice.name} ${voice.description ?? ""} ${voice.tags.join(" ")}`.toLowerCase().includes(query.search.toLowerCase())))
    .slice(0, query.limit === undefined ? undefined : Math.max(0, query.limit));
}

export interface FishVoiceListOptions {
  pageSize?: number;
  pageNumber?: number;
  title?: string;
  tag?: string;
  self?: boolean;
  authorId?: string;
  language?: string;
  sortBy?: "score" | "task_count" | "created_at";
  signal?: AbortSignal;
}

/** Browse Fish's model/voice catalog with its native filters. */
export async function listFishVoices(ctx: ProviderContext, options: FishVoiceListOptions = {}): Promise<VoiceDescriptor[]> {
  const query = new URLSearchParams({ page_size: String(options.pageSize ?? 50), page_number: String(options.pageNumber ?? 1) });
  for (const [key, value] of Object.entries({ title: options.title, tag: options.tag, self: options.self,
    author_id: options.authorId, language: options.language, sort_by: options.sortBy })) {
    if (value !== undefined) query.set(key, String(value));
  }
  const body = await json(ctx, `/model?${query}`, { signal: options.signal });
  const items = body.items ?? body.models;
  if (!Array.isArray(items)) throw failure("Fish Audio returned an invalid model list");
  return items.map(item => normalizeVoice(item, options.self ? "cloned" : "community"));
}

/** List voices owned by the authenticated Fish account. */
export function listOwnVoices(ctx: ProviderContext, options: Omit<FishVoiceListOptions, "self"> = {}) {
  return listFishVoices(ctx, { ...options, self: true });
}

export async function getVoice(ctx: ProviderContext, id: string) {
  try { return normalizeVoice(await json(ctx, `/model/${encodeURIComponent(id)}`)); }
  catch (error) { if (error instanceof VoiceEngineError && error.code === "not_found") return undefined; throw error; }
}

function addSamples(form: FormData, samples: AudioInput[]) {
  samples.forEach((sample, index) => form.append("voices", new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }), sample.fileName ?? `sample-${index}.wav`));
}

export async function cloneVoice(ctx: ProviderContext, request: CloneVoiceRequest): Promise<CloneVoiceResult> {
  if (!request.consent?.attested) throw failure("Voice cloning requires consent.attested", "invalid_request");
  if (request.mode === "professional") throw failure("Fish Audio supports instant cloning only", "unsupported");
  if (!request.samples.length) throw failure("Provide at least one voice sample", "invalid_request");
  const options = request.providerOptions ?? {};
  const form = new FormData();
  for (const [key, value] of Object.entries({ visibility: "private", type: "tts", title: request.name,
    description: request.description ?? "", train_mode: "fast", enhance_audio_quality: String(request.denoise ?? false) })) form.set(key, value);
  addSamples(form, request.samples);
  strings(options.texts).forEach(text => form.append("texts[]", text));
  const tags = strings(options.tags);
  if (request.language) tags.push(request.language);
  for (const [key, value] of Object.entries(request.labels ?? {})) tags.push(`${key}:${value}`);
  tags.forEach(tag => form.append("tags[]", tag));
  const voice = normalizeVoice(await json(ctx, "/model", { method: "POST", body: form, signal: request.signal }), "cloned");
  voice.raw = { ...voice.raw, consent: request.consent };
  return { voice, status: "ready" };
}

export async function updateVoice(ctx: ProviderContext, id: string, request: UpdateVoiceRequest) {
  if (request.removeSampleIds?.length) throw failure("Fish Audio cannot remove individual samples", "unsupported");
  const form = new FormData();
  if (request.name !== undefined) form.set("title", request.name);
  if (request.description !== undefined) form.set("description", request.description);
  if (request.labels?.visibility !== undefined) {
    if (!["private", "public", "unlisted"].includes(request.labels.visibility)) throw failure("Invalid Fish visibility", "invalid_request");
    form.set("visibility", request.labels.visibility);
  }
  if (request.labels?.tags !== undefined) request.labels.tags.split(",").map(tag => tag.trim()).filter(Boolean).forEach(tag => form.append("tags[]", tag));
  addSamples(form, request.addSamples ?? []);
  const metadata: Record<string, unknown> = {};
  for (const key of ["title", "description", "visibility"]) if (form.has(key)) metadata[key] = form.get(key);
  if (request.labels?.tags !== undefined) metadata.tags = form.getAll("tags[]");
  const body = await consume(ctx, `/model/${encodeURIComponent(id)}`, {
    ...(request.addSamples?.length ? { body: form } : jsonBody(metadata)), method: "PATCH", signal: request.signal,
  }, async response => { const text = await response.text(); return text.trim() ? record(JSON.parse(text)) : {}; });
  if (body._id !== undefined || body.id !== undefined) return normalizeVoice(body, "cloned");
  const updated = await json(ctx, `/model/${encodeURIComponent(id)}`, { signal: request.signal });
  return normalizeVoice(updated, "cloned");
}

export async function deleteVoice(ctx: ProviderContext, id: string, signal?: AbortSignal) {
  await consume(ctx, `/model/${encodeURIComponent(id)}`, { method: "DELETE", signal }, async () => undefined);
}
