import type { CloneVoiceRequest, CloneVoiceResult, ProviderContext } from "../../core/types.js";
import { invalid, object, request } from "./http.js";
import { normalizeVoice } from "./voices.js";

/** Create an instant clone from one file or a sample_file_url after consent. */
export async function cloneVoice(ctx: ProviderContext, input: CloneVoiceRequest): Promise<CloneVoiceResult> {
  if (!input.consent?.attested) invalid("Voice cloning requires consent.attested");
  if (input.mode === "professional") invalid("PlayHT professional cloning is not supported", "unsupported");
  const url = input.providerOptions?.sample_file_url;
  if (input.samples.length > 1 || input.samples.length === 0 && typeof url !== "string" || input.samples.length && url) invalid("Provide exactly one cloning sample or sample_file_url");
  const form = new FormData();
  form.set("voice_name", input.name);
  if (input.samples[0]) {
    const sample = input.samples[0];
    form.set("sample_file", new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }), sample.fileName ?? "sample.wav");
    form.set("mime_type", sample.mimeType);
  } else form.set("sample_file_url", String(url));
  const raw = object(await request(ctx, "/cloned-voices/instant", { method: "POST", body: form, signal: input.signal }, res => res.json()));
  const voice = normalizeVoice(raw.voice ?? raw, true);
  return { voice: { ...voice, raw: { ...voice.raw, consent: input.consent } }, status: "ready" };
}

/** Delete an account clone using PlayHT's JSON DELETE body. */
export async function deleteVoice(ctx: ProviderContext, id: string, signal?: AbortSignal): Promise<void> {
  await request(ctx, "/cloned-voices", { method: "DELETE", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voice_id: id }) }, async () => undefined);
}
