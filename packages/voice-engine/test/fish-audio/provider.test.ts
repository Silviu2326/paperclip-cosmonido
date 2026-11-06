import { describe, expect, it, vi } from "vitest";
import type { ProviderContext, SynthesisRequest, VoiceRef } from "../../src/core/types.js";
import { createFishAudioProvider, FISH_AUDIO_MODELS, fishAudioProvider, getBalance, listOwnVoices, transcribe } from "../../src/providers/fish-audio/index.js";

const request: SynthesisRequest & { voice: VoiceRef } = { text: "Hola 世界", voice: { provider: "fish-audio", voiceId: "speaker" } };
const sample = { data: new Uint8Array([0, 128, 255]), mimeType: "audio/wav", fileName: "speaker.wav" };
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>, extras: Partial<ProviderContext> = {}) {
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => responder(String(url), init ?? {}));
  const ctx: ProviderContext = { credentials: { apiKey: "test-key" }, fetch: fetch as typeof globalThis.fetch, ...extras };
  return { fetch, ctx, provider: createFishAudioProvider(ctx) };
}
function stream(parts: number[][]) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { parts.forEach(part => controller.enqueue(new Uint8Array(part))); controller.close(); } }));
}

describe("Fish Audio", () => {
  it("registers the requested models and defaults", async () => {
    const { provider } = setup(() => response({}));
    expect(fishAudioProvider.requiredCredentials).toEqual(["apiKey"]);
    expect(FISH_AUDIO_MODELS.map(model => model.id)).toEqual(["s1", "s1-mini", "speech-1.6", "speech-1.5"]);
    expect(provider.defaultModel()).toBe("s1");
    expect(provider.defaultModel({ tier: "balanced" })).toBe("speech-1.6");
    expect(provider.defaultModel({ tier: "fast" })).toBe("s1-mini");
    expect((await provider.listModels())[0].usdPerMillionChars).toBe(15);
  });

  it("maps JSON synthesis, S1 markers, prosody, byte billing, and raw references", async () => {
    const { provider, fetch } = setup(() => new Response(new Uint8Array([1, 2, 255]), { headers: { "x-request-id": "req-1" } }));
    const result = await provider.synthesize({ ...request, model: "s1", format: { container: "mp3", bitrate: 192, sampleRate: 44100 },
      settings: { speed: 1.2, volume: -3, stability: 0.95, emotion: "excited", seed: 123 },
      providerOptions: { references: [{ audio: sample.data, text: "reference" }], chunk_length: 500, latency: "balanced", normalize: true, top_p: 0.8 } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.fish.audio/v1/tts");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key");
    expect(new Headers(init?.headers).get("model")).toBe("s1");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ text: "(excited) Hola 世界", reference_id: "speaker", format: "mp3", mp3_bitrate: 192,
      sample_rate: 44100, temperature: 0.1, prosody: { speed: 1.2, volume: -3 }, streaming: false,
      chunk_length: 300, latency: "balanced", normalize: true, top_p: 0.8, references: [{ audio: "AID/", text: "reference" }] });
    expect(Buffer.from(body.references[0].audio, "base64")).toEqual(Buffer.from(sample.data));
    expect(body.seed).toBeUndefined();
    expect(result.audio.data).toEqual(new Uint8Array([1, 2, 255]));
    expect(result.audio.mimeType).toBe("audio/mpeg");
    const units = Buffer.byteLength(body.text);
    expect(result.usage).toMatchObject({ unit: "byte", units, estimatedCents: units * 15 / 10000, requestId: "req-1" });
  });

  it.each([["wav", "audio/wav"], ["pcm", "audio/pcm"], ["opus", "audio/opus"]] as const)("maps %s format", async (container, mime) => {
    const { provider, fetch } = setup(() => new Response(new Uint8Array([1])));
    const sampleRate = container === "opus" ? 48000 : 24000;
    const result = await provider.synthesize({ ...request, format: { container, sampleRate, ...(container === "opus" ? { bitrate: 64 } : {}) } });
    expect(result.audio.mimeType).toBe(mime);
    expect(result.audio.format.sampleRate).toBe(sampleRate);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ format: container, sample_rate: sampleRate,
      ...(container === "opus" ? { opus_bitrate: 64000 } : {}) });
  });

  it("does not add emotion markers to legacy models and clamps stability", async () => {
    const { provider, fetch } = setup(() => new Response(new Uint8Array([1])));
    const result = await provider.synthesize({ ...request, model: "speech-1.6", settings: { emotion: "happy", stability: -3 } });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ text: request.text, temperature: 1 });
    expect(result.usage.estimatedCents).toBeNull();
  });

  it("streams binary HTTP chunks unchanged and supports buffered streaming:true", async () => {
    const { provider, fetch } = setup(() => stream([[0, 1], [128], [255]]));
    const result = [];
    for await (const chunk of provider.synthesizeStream!(request)) result.push([...chunk.audio]);
    expect(result).toEqual([[0, 1], [128], [255]]);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).streaming).toBe(true);
    const buffered = await provider.synthesize({ ...request, providerOptions: { streaming: true } });
    expect(buffered.audio.data).toEqual(new Uint8Array([0, 1, 128, 255]));
  });

  it("rejects impossible audio combinations before fetching", async () => {
    const { provider, fetch } = setup(() => response({}));
    await expect(provider.synthesize({ ...request, format: { container: "flac" } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.synthesize({ ...request, format: { container: "mp3", bitrate: 256 } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.synthesize({ ...request, format: { container: "opus", sampleRate: 24000 } })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes voices, query filters, own voices, and audio/cover previews", async () => {
    const raw = { _id: "id-1", title: "Ana", description: "Spanish narrator", languages: ["es_ES"], tags: ["narration"],
      author: { name: "Alice" }, like_count: 20, cover_image: "https://img.test/cover", samples: [{ audio: "https://audio.test/sample" }] };
    const { provider, fetch, ctx } = setup(url => url.includes("/model?") ? response({ items: [raw] }) : response({ ...raw, samples: [] }));
    const voices = await provider.listVoices({ search: "Ana", language: "es", limit: 5 });
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("title")).toBe("Ana");
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("language")).toBe("es");
    expect(voices[0]).toMatchObject({ id: "fish-audio:id-1", name: "Ana", languages: ["es-ES"], origin: "community",
      previewUrl: "https://audio.test/sample", raw: { author: raw.author, like_count: 20 } });
    expect((await provider.getVoice!("id-1"))?.previewUrl).toBe("https://img.test/cover");
    expect((await listOwnVoices(ctx))[0].origin).toBe("cloned");
    expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).searchParams.get("self")).toBe("true");
  });

  it("returns undefined for missing voices", async () => {
    const { provider } = setup(() => response({ detail: "missing" }, 404));
    expect(await provider.getVoice!("missing")).toBeUndefined();
  });

  it("requires consent before upload and creates private multipart clones", async () => {
    const { provider, fetch } = setup(() => response({ _id: "cloned", title: "My voice" }));
    const clone = { name: "My voice", description: "Reference", samples: [sample], denoise: true };
    await expect(provider.cloneVoice!(clone)).rejects.toMatchObject({ code: "invalid_request", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
    const result = await provider.cloneVoice!({ ...clone, consent: { attested: true }, providerOptions: { texts: ["Hello"], tags: ["narrator"] } });
    const form = fetch.mock.calls[0][1]?.body as FormData;
    expect(form.get("visibility")).toBe("private");
    expect(form.get("train_mode")).toBe("fast");
    expect(form.get("type")).toBe("tts");
    expect(form.get("enhance_audio_quality")).toBe("true");
    expect(form.getAll("texts[]")).toEqual(["Hello"]);
    expect(form.getAll("tags[]")).toEqual(["narrator"]);
    const file = form.get("voices") as File;
    expect(file.name).toBe("speaker.wav");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(sample.data);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).has("Content-Type")).toBe(false);
    expect(result).toMatchObject({ status: "ready", voice: { origin: "cloned", raw: { consent: { attested: true } } } });
  });

  it("updates metadata and files and deletes a voice with a 204 response", async () => {
    const { provider, fetch } = setup((_, init) => init.method === "DELETE" ? new Response(null, { status: 204 }) : response({ _id: "id/1", title: "New" }));
    await provider.updateVoice!("id/1", { name: "New", description: "Changed", labels: { tags: "warm,calm", visibility: "unlisted" }, addSamples: [sample] });
    const form = fetch.mock.calls[0][1]?.body as FormData;
    expect(form.get("title")).toBe("New");
    expect(form.getAll("tags[]")).toEqual(["warm", "calm"]);
    expect(form.get("visibility")).toBe("unlisted");
    expect(form.getAll("voices")).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toContain("/model/id%2F1");
    await provider.deleteVoice!("id/1");
    expect(fetch.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("encodes ASR audio as base64 and exposes wallet health", async () => {
    const { provider, fetch, ctx } = setup(url => url.endsWith("/asr") ? response({ text: "Hola" }) : response({ credit: 42 }));
    expect(await transcribe(ctx, sample, { language: "es", ignoreTimestamps: true })).toEqual({ text: "Hola" });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ audio: "AID/", language: "es", ignore_timestamps: true });
    expect(await getBalance(ctx)).toEqual({ credit: 42 });
    expect(await provider.healthcheck!()).toMatchObject({ ok: true });
  });

  it("retrieves the updated voice after an empty metadata PATCH response", async () => {
    const { provider, fetch } = setup((_, init) => init.method === "PATCH" ? new Response(null, { status: 204 }) : response({ _id: "id", title: "Renamed" }));
    expect((await provider.updateVoice!("id", { name: "Renamed", labels: { tags: "" } })).name).toBe("Renamed");
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ title: "Renamed", tags: [] });
    expect(fetch.mock.calls[1][1]?.method).toBeUndefined();
  });

  it.each([[401, "auth", false], [402, "quota_exceeded", false], [429, "rate_limit", true], [503, "provider_unavailable", true]] as const)("maps HTTP %s", async (status, code, retryable) => {
    const { provider } = setup(() => response({ detail: "Provider failure" }, status, { "Retry-After": "2" }));
    await expect(provider.synthesize(request)).rejects.toMatchObject({ name: "VoiceEngineError", provider: "fish-audio", message: "Provider failure", status, code, retryable, retryAfterMs: 2000 });
  });

  it("parses HTTP-date Retry-After", async () => {
    const { provider } = setup(() => response({ message: "Rate limit" }, 429, { "Retry-After": new Date(Date.now() + 10000).toUTCString() }));
    const error = await provider.synthesize(request).catch(error => error);
    expect(error.retryAfterMs).toBeGreaterThan(8000);
    expect(error.retryAfterMs).toBeLessThanOrEqual(10000);
  });

  it("honors cancellation, timeout, body errors, and early stream cleanup", async () => {
    const aborted = new AbortController(); aborted.abort();
    const { provider, fetch } = setup(() => response({}));
    await expect(provider.synthesize({ ...request, signal: aborted.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
    const stalled = setup(() => new Response(new ReadableStream()), { timeoutMs: 5 });
    await expect(stalled.provider.synthesize(request)).rejects.toMatchObject({ code: "timeout" });
    const cancel = vi.fn();
    const early = setup(() => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel })));
    for await (const _ of early.provider.synthesizeStream!(request)) break;
    expect(cancel).toHaveBeenCalledOnce();
    const broken = setup(() => new Response(new ReadableStream({ start(controller) { controller.error(new Error("broken body")); } })));
    await expect(broken.provider.synthesizeStream!(request)[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
