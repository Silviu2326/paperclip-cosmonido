import { describe, expect, it } from "vitest";
import { createElevenLabsProvider, createPronunciationDictionary, downloadDubbedAudio, generateSoundEffect, getDubbing, getSubscription, isolateAudio, startDubbing } from "../../src/providers/elevenlabs/index.js";
import { requestJson, responseError } from "../../src/providers/elevenlabs/http.js";
import { speechToSpeech } from "../../src/providers/elevenlabs/sts.js";
import { synthesize, synthesizeStream } from "../../src/providers/elevenlabs/tts.js";
import { audio, collect, fake, json, sample, voice } from "./helpers.js";

describe("ElevenLabs errors and transport", () => {
  it.each([
    [401, "invalid_api_key", "auth", false], [429, "too_many_concurrent_requests", "rate_limit", true],
    [401, "quota_exceeded", "quota_exceeded", false], [429, "quota_exceeded", "quota_exceeded", false],
    [404, "voice_not_found", "not_found", false], [503, "system_busy", "provider_unavailable", true],
    [403, "detected_unusual_activity", "content_policy", false], [400, "content_policy_violation", "content_policy", false],
    [500, "concurrent_limit_exceeded", "rate_limit", true],
    [400, "content_too_long", "invalid_request", false],
  ])("maps HTTP %s/%s to %s", async (status, tag, code, retryable) => {
    const { ctx } = fake([json({ detail: { status: tag, message: "Provider explanation" } }, status as number, { "Retry-After": "2.5" })]);
    await expect(synthesize(ctx, { text: "Hello", voice })).rejects.toMatchObject({ code, status, provider: "elevenlabs", retryable, retryAfterMs: 2500, message: "Provider explanation" });
  });

  it("supports the current detail.code envelope and HTTP-date Retry-After", () => {
    const date = new Date(Date.now() + 10_000).toUTCString();
    const error = responseError(402, new Headers({ "retry-after": date }), { detail: { code: "insufficient_credits", type: "payment_required", message: "Out of credits" } });
    expect(error).toMatchObject({ code: "quota_exceeded", retryable: false });
    expect(error.retryAfterMs).toBeGreaterThan(8000);
    expect(error.retryAfterMs).toBeLessThanOrEqual(10_000);
    expect(responseError(429, new Headers({ "retry-after": "invalid" }), {}).retryAfterMs).toBeUndefined();
  });

  it("maps plain-text HTTP errors, missing credentials and network failures", async () => {
    const { ctx } = fake([new Response("Service offline", { status: 503 }), () => { throw new TypeError("fetch failed"); }]);
    await expect(requestJson(ctx, "/x")).rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
    await expect(requestJson(ctx, "/x")).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    await expect(requestJson({ ...ctx, credentials: {} }, "/x")).rejects.toMatchObject({ code: "auth" });
  });

  it("honors custom base URL and a pre-aborted signal without network I/O", async () => {
    const { ctx, calls } = fake([json({ ok: true })], { baseUrl: "https://proxy.example/eleven/" });
    await requestJson(ctx, "/v1/models");
    expect(calls[0].url.toString()).toBe("https://proxy.example/eleven/v1/models");
    await expect(requestJson(ctx, "/x", { signal: AbortSignal.abort("caller cancelled") })).rejects.toMatchObject({ code: "aborted", retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("times out while waiting for response headers", async () => {
    const { ctx } = fake([() => new Promise<Response>(() => {})], { timeoutMs: 10 });
    await expect(requestJson(ctx, "/stall")).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("keeps timeouts active during streaming body reads", async () => {
    let cancelled = false;
    const { ctx } = fake([new Response(new ReadableStream({ cancel() { cancelled = true; } }))], { timeoutMs: 10 });
    await expect(collect(synthesizeStream(ctx, { text: "hello", voice }))).rejects.toMatchObject({ code: "timeout" });
    expect(cancelled).toBe(true);
  });

  it("honors caller cancellation during body consumption", async () => {
    const controller = new AbortController();
    const { ctx } = fake([() => {
      queueMicrotask(() => controller.abort(new Error("Caller stopped")));
      return new Response(new ReadableStream());
    }]);
    await expect(synthesize(ctx, { text: "hello", voice, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("rejects malformed successful JSON with a provider error", async () => {
    const { ctx } = fake([new Response("not json")]);
    await expect(requestJson(ctx, "/x")).rejects.toMatchObject({ code: "provider_unavailable", retryable: false });
  });
});

describe("ElevenLabs extended APIs", () => {
  it("maps speech-to-speech multipart input and returns usage without inventing duration", async () => {
    const { ctx, calls } = fake([audio({ "request-id": "sts-id" })]);
    const result = await speechToSpeech(ctx, { audio: sample, voice, preserveBackground: false,
      settings: { stability: 0.8, similarity: 0.9, speed: 5, seed: 99 }, format: { container: "mulaw" } });
    expect(calls[0].url.pathname).toBe("/v1/speech-to-speech/voice%2Fid");
    expect(calls[0].url.searchParams.get("output_format")).toBe("ulaw_8000");
    const form = calls[0].init.body as FormData;
    expect(form.get("model_id")).toBe("eleven_multilingual_sts_v2");
    expect(form.get("remove_background_noise")).toBe("true");
    expect(form.get("seed")).toBe("99");
    expect(form.get("audio")).toBeInstanceOf(Blob);
    expect(JSON.parse(String(form.get("voice_settings")))).toEqual({ stability: 0.8, similarity_boost: 0.9, speed: 1.2 });
    expect(result).toMatchObject({ requestId: "sts-id", audio: { mimeType: "audio/basic", format: { container: "mulaw", sampleRate: 8000 } }, usage: { unit: "byte", units: 3, estimatedCents: null } });
  });

  it("generates loopable sound effects and maps duration/prompt influence", async () => {
    const { ctx, calls } = fake([audio()]);
    expect(await generateSoundEffect(ctx, { text: "Ocean waves", durationSeconds: 8, promptInfluence: 0.7, loop: true })).toMatchObject({ mimeType: "audio/mpeg" });
    expect(calls[0].url.pathname).toBe("/v1/sound-generation");
    expect(calls[0].body).toEqual({ text: "Ocean waves", duration_seconds: 8, prompt_influence: 0.7, loop: true, model_id: "eleven_text_to_sound_v2" });
    await expect(generateSoundEffect(ctx, { text: "Ocean", durationSeconds: 31 })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("uploads isolation audio and identifies the response without copying input format", async () => {
    const { ctx, calls } = fake([audio()]);
    const result = await isolateAudio(ctx, sample);
    expect(calls[0].url.pathname).toBe("/v1/audio-isolation");
    expect((calls[0].init.body as FormData).get("audio")).toBeInstanceOf(Blob);
    expect(result).toMatchObject({ format: { container: "mp3" }, mimeType: "audio/mpeg" });
  });

  it("detects WAV format and reads its channel, rate and bit depth metadata", async () => {
    const wav = new Uint8Array(44);
    const view = new DataView(wav.buffer);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    wav.set(new TextEncoder().encode("WAVEfmt "), 8);
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 44100, true); view.setUint16(34, 16, true);
    const { ctx } = fake([new Response(wav, { headers: { "content-type": "application/octet-stream" } })]);
    expect(await isolateAudio(ctx, sample)).toMatchObject({ mimeType: "audio/wav", format: { container: "wav", channels: 1, sampleRate: 44100, bitDepth: 16 } });
  });

  it("uploads escaped PLS rules and returns a TTS-ready locator", async () => {
    const { ctx, calls } = fake([json({ id: "dict", version_id: "ver", name: "Brands" })]);
    const result = await createPronunciationDictionary(ctx, "Brands", [
      { grapheme: 'A&B <"brand">', alias: "A and B" }, { grapheme: "tomato", phoneme: "təˈmeɪtoʊ", alphabet: "ipa" }, { grapheme: "SQL", phoneme: "S IY K W AH L", alphabet: "cmu" },
    ], { language: "en-US", description: "Brand pronunciation" });
    const form = calls[0].init.body as FormData;
    expect(calls[0].url.pathname).toBe("/v1/pronunciation-dictionaries/add-from-file");
    expect(form.get("name")).toBe("Brands");
    const xml = await (form.get("file") as Blob).text();
    expect(xml).toContain("A&amp;B &lt;&quot;brand&quot;&gt;");
    expect(xml).toContain('<phoneme alphabet="ipa">təˈmeɪtoʊ</phoneme>');
    expect(xml).toContain('<phoneme alphabet="cmu">S IY K W AH L</phoneme>');
    expect(xml).toContain('<alias>A and B</alias>');
    expect(result.locator).toEqual({ pronunciation_dictionary_id: "dict", version_id: "ver" });
    await expect(createPronunciationDictionary(ctx, "Unsupported", [{ grapheme: "x", phoneme: "x", alphabet: "x-sampa" }])).rejects.toMatchObject({ code: "unsupported" });
  });

  it("starts, polls and downloads a dubbing job", async () => {
    const { ctx, calls } = fake([json({ dubbing_id: "dub/id", expected_duration_sec: 10 }), json({ dubbing_id: "dub/id", status: "dubbed", target_languages: ["es"] }), audio()]);
    expect(await startDubbing(ctx, { audio: sample, targetLanguage: "es-ES", sourceLanguage: "en-US", name: "Spanish", numSpeakers: 2, dropBackgroundAudio: true })).toMatchObject({ dubbing_id: "dub/id" });
    const form = calls[0].init.body as FormData;
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(form.get("target_lang")).toBe("es");
    expect(form.get("source_lang")).toBe("en");
    expect(form.get("num_speakers")).toBe("2");
    expect(form.get("drop_background_audio")).toBe("true");
    expect(await getDubbing(ctx, "dub/id")).toMatchObject({ status: "dubbed" });
    expect(await downloadDubbedAudio(ctx, "dub/id", "es-ES")).toMatchObject({ mimeType: "audio/mpeg", data: new Uint8Array([1, 2, 3]) });
    expect(calls[2].url.pathname).toBe("/v1/dubbing/dub%2Fid/audio/es");
  });

  it("supports URL dubbing and preserves video response content types", async () => {
    const { ctx, calls } = fake([json({ dubbing_id: "url" }), new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } })]);
    await startDubbing(ctx, { sourceUrl: "https://example.com/video.mp4", targetLanguage: "fr" });
    expect((calls[0].init.body as FormData).get("source_url")).toBe("https://example.com/video.mp4");
    expect((await downloadDubbedAudio(ctx, "url", "fr")).mimeType).toBe("video/mp4");
    await expect(startDubbing(ctx, { targetLanguage: "es" })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("uses the subscription endpoint for health checks without consuming synthesis", async () => {
    const subscription = { character_count: 100, character_limit: 10_000, tier: "starter" };
    const { ctx, calls } = fake([json(subscription), json(subscription), json({ detail: { status: "invalid_api_key", message: "Invalid key" } }, 401)]);
    expect(await getSubscription(ctx)).toMatchObject(subscription);
    const provider = createElevenLabsProvider(ctx);
    expect(await provider.healthcheck!()).toEqual({ ok: true, detail: "starter: 100/10000 characters used" });
    expect(await provider.healthcheck!()).toEqual({ ok: false, detail: "Invalid key" });
    expect(calls.every(call => call.url.pathname === "/v1/user/subscription")).toBe(true);
  });
});
