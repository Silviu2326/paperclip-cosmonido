import { describe, expect, it } from "vitest";
import type { AudioFormat } from "../../src/core/types.js";
import { createElevenLabsProvider, defaultModel, ELEVENLABS_MODELS, fromOutputFormat, toOutputFormat } from "../../src/providers/elevenlabs/index.js";
import { alignmentToWords, synthesize, synthesizeStream } from "../../src/providers/elevenlabs/tts.js";
import { alignment, audio, collect, fake, json, stream, voice } from "./helpers.js";

describe("ElevenLabs models and formats", () => {
  it("selects requested tiers and upgrades for languages unavailable in v2", () => {
    expect(defaultModel()).toBe("eleven_multilingual_v2");
    expect(defaultModel({ tier: "balanced", language: "es-ES" })).toBe("eleven_multilingual_v2");
    expect(defaultModel({ tier: "flagship" })).toBe("eleven_v3");
    expect(defaultModel({ tier: "fast" })).toBe("eleven_flash_v2_5");
    for (const language of ["sw-KE", "kn-IN", "ml", "bn", "yo"]) expect(defaultModel({ tier: "fast", language })).toBe("eleven_v3");
    expect(defaultModel({ language: "vi-VN" })).toBe("eleven_flash_v2_5");
    expect(ELEVENLABS_MODELS).toHaveLength(9);
    expect(ELEVENLABS_MODELS.find(model => model.id === "eleven_v3")).toMatchObject({ maxInputChars: 5000, supportsEmotionTags: true, latency: "standard" });
    expect(ELEVENLABS_MODELS.every(model => model.usdPerMillionChars === undefined && model.notes?.includes("2026-10-22"))).toBe(true);
  });

  it("round trips every requested native output format", () => {
    const names = ["mp3_22050_32", ...[32, 64, 96, 128, 192].map(rate => `mp3_44100_${rate}`),
      ...[8000, 16000, 22050, 24000, 44100, 48000].map(rate => `pcm_${rate}`), "ulaw_8000", "alaw_8000",
      ...[32, 64, 96, 128, 192].map(rate => `opus_48000_${rate}`)];
    for (const name of names) expect(toOutputFormat(fromOutputFormat(name).format).outputFormat).toBe(name);
    expect(toOutputFormat().outputFormat).toBe("mp3_44100_128");
    expect(toOutputFormat({ container: "pcm" })).toMatchObject({ outputFormat: "pcm_24000", mimeType: "audio/pcm" });
    expect(toOutputFormat({ container: "mp3", sampleRate: 22050 }).outputFormat).toBe("mp3_22050_32");
  });

  it.each<AudioFormat>([{ container: "mp3", sampleRate: 16000 }, { container: "pcm", bitrate: 128 }, { container: "pcm", bitDepth: 24 },
    { container: "wav" }, { container: "mp3", channels: 2 }, { container: "mp3", sampleRate: 22050, bitrate: 128 }])("rejects unsupported format %j", format => {
    expect(() => toOutputFormat(format)).toThrow(expect.objectContaining({ code: "unsupported" }));
  });
});

describe("ElevenLabs synthesis", () => {
  it("reproduces the existing server call and maps all native voice knobs", async () => {
    const { ctx, calls } = fake([audio({ "request-id": "req-1" })]);
    const result = await synthesize(ctx, { text: "Hola", voice, language: "es-ES", settings: {
      speed: 4, stability: 0.43, similarity: 0.8, style: 0.6, speakerBoost: false, seed: 42, pitch: 8, volume: 10, emotion: "angry",
    }, context: { previousText: "Antes", nextText: "Después" }, providerOptions: {
      apply_text_normalization: "on", pronunciation_dictionary_locators: [{ pronunciation_dictionary_id: "dict", version_id: "version" }],
      language_code: "fr",
    } });
    expect(calls[0].url.toString()).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid?output_format=mp3_44100_128");
    expect(calls[0].headers.get("xi-api-key")).toBe("test-elevenlabs-key");
    expect(calls[0].headers.get("content-type")).toBe("application/json");
    expect(calls[0].body).toEqual({ text: "Hola", model_id: "eleven_multilingual_v2", seed: 42,
      previous_text: "Antes", next_text: "Después", apply_text_normalization: "on",
      pronunciation_dictionary_locators: [{ pronunciation_dictionary_id: "dict", version_id: "version" }],
      voice_settings: { speed: 1.2, stability: 0.43, similarity_boost: 0.8, style: 0.6, use_speaker_boost: false } });
    expect(result).toMatchObject({ model: "eleven_multilingual_v2", requestId: "req-1", cached: false, audio: { mimeType: "audio/mpeg", data: new Uint8Array([1, 2, 3]) },
      usage: { unit: "character", units: 4, estimatedCents: null, pricingSource: "elevenlabs character count; plan-dependent credits", requestId: "req-1" } });
  });

  it.each(["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_v3"])("sends a base language_code for %s", async model => {
    const { ctx, calls } = fake([audio()]);
    await synthesize(ctx, { text: "Hola", voice, model, language: "es-MX", format: { container: "pcm", sampleRate: 16000 }, settings: { speed: 0.1 } });
    expect(calls[0].body.language_code).toBe("es");
    expect(calls[0].body.voice_settings).toMatchObject({ speed: 0.7 });
    expect(calls[0].url.searchParams.get("output_format")).toBe("pcm_16000");
  });

  it.each([[0.1, 0], [0.3, 0.5], [0.73, 0.5], [0.8, 1]])("snaps v3 stability %s to %s and prefixes emotion", async (stability, expected) => {
    const { ctx, calls } = fake([audio()]);
    const result = await synthesize(ctx, { text: "Hello", voice, model: "eleven_v3", settings: { stability, emotion: "excited" } });
    expect(calls[0].body).toMatchObject({ text: "[excited] Hello", voice_settings: { stability: expected } });
    expect(result.usage.units).toBe(5);
  });

  it("validates the actual selected model and tagged input before network I/O", async () => {
    const { ctx, calls } = fake([]);
    await expect(synthesize(ctx, { text: "x".repeat(5000), voice, model: "eleven_v3", settings: { emotion: "whisper" } })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(synthesize(ctx, { text: "x".repeat(10001), voice })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(synthesize(ctx, { text: "x", voice, model: "eleven_multilingual_sts_v2" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(synthesize(ctx, { text: "x", voice, providerOptions: { model_id: "eleven_v3", text: "x".repeat(5001) } })).rejects.toMatchObject({ code: "invalid_request" });
    expect(calls).toHaveLength(0);
  });

  it("parses character alignment into words including punctuation", async () => {
    expect(alignmentToWords(alignment(" Hi,  world!\n"))).toEqual([
      { text: "Hi,", startMs: 100, endMs: 400 }, { text: "world!", startMs: 600, endMs: 1200 },
    ]);
    const { ctx, calls } = fake([json({ audio_base64: "AQID", alignment: alignment("Hi there") }, 200, { "request-id": "timed" })]);
    const result = await synthesize(ctx, { text: "Hi there", voice, timestamps: true });
    expect(calls[0].url.pathname).toMatch(/\/with-timestamps$/);
    expect(result.timestamps).toEqual([{ text: "Hi", startMs: 0, endMs: 200 }, { text: "there", startMs: 300, endMs: 800 }]);
    expect(result.requestId).toBe("timed");
  });

  it("uses normalized alignment and rejects malformed base64 or timing arrays", async () => {
    const { ctx } = fake([json({ audio_base64: "AQID", alignment: alignment("2"), normalized_alignment: alignment("two") }), json({ audio_base64: "@" })]);
    expect((await synthesize(ctx, { text: "2", voice, timestamps: true })).timestamps?.[0].text).toBe("two");
    await expect(synthesize(ctx, { text: "bad", voice, timestamps: true })).rejects.toMatchObject({ code: "provider_unavailable", retryable: false });
    expect(() => alignmentToWords({ characters: ["x"], character_start_times_seconds: [], character_end_times_seconds: [] })).toThrow();
  });

  it("exposes accurate provider capabilities and returns independent model lists", async () => {
    const { ctx } = fake([]);
    const provider = createElevenLabsProvider(ctx);
    expect(provider.capabilities).toMatchObject({ maxInputChars: 40000, ssml: false, streaming: true, professionalClone: true });
    expect(provider.capabilities.languages).toContain("sw");
    const models = await provider.listModels();
    models[0].languages.push("invented");
    expect((await provider.listModels())[0].languages).not.toContain("invented");
  });
});

describe("ElevenLabs streaming", () => {
  it("yields chunked audio without buffering the full response", async () => {
    const { ctx, calls } = fake([stream([new Uint8Array([1, 2]), new Uint8Array([3])])]);
    const chunks = await collect(synthesizeStream(ctx, { text: "Hello", voice }));
    expect(chunks).toEqual([{ audio: new Uint8Array([1, 2]) }, { audio: new Uint8Array([3]) }]);
    expect(calls[0].url.pathname).toMatch(/\/stream$/);
  });

  it("handles arbitrary NDJSON and UTF-8 splits, CRLF, final lines and cross-frame words", async () => {
    const lines = JSON.stringify({ audio_base64: "AQI=", alignment: alignment("Hé") }) + "\r\n\n"
      + JSON.stringify({ audio_base64: "Aw==", alignment: alignment("llo world") });
    const encoded = new TextEncoder().encode(lines);
    const { ctx, calls } = fake([stream(Array.from(encoded, byte => new Uint8Array([byte])))]);
    const chunks = await collect(synthesizeStream(ctx, { text: "Héllo world", voice, timestamps: true }));
    expect(chunks.flatMap(chunk => Array.from(chunk.audio))).toEqual([1, 2, 3]);
    expect(chunks.flatMap(chunk => chunk.timestamps ?? [])).toEqual([
      { text: "Héllo", startMs: 0, endMs: 500 }, { text: "world", startMs: 600, endMs: 1100 },
    ]);
    expect(chunks.map(chunk => chunk.text ?? "").join("")).toBe("Héllo world");
    expect(calls[0].url.pathname).toMatch(/\/stream\/with-timestamps$/);
  });

  it("cancels the response reader when the consumer stops early", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } }));
    const { ctx } = fake([response]);
    for await (const _ of synthesizeStream(ctx, { text: "hello", voice })) break;
    expect(cancelled).toBe(true);
  });

  it("maps error frames and malformed NDJSON", async () => {
    for (const line of ['{"detail":{"status":"quota_exceeded","message":"No credits"}}\n', "not json\n"]) {
      const { ctx } = fake([stream([new TextEncoder().encode(line)])]);
      await expect(collect(synthesizeStream(ctx, { text: "hello", voice, timestamps: true }))).rejects.toMatchObject({ provider: "elevenlabs" });
    }
  });
});
