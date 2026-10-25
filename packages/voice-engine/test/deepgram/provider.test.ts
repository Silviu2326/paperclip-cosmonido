import { describe, expect, it } from "vitest";
import { createDeepgramProvider, DEEPGRAM_VOICES } from "../../src/providers/deepgram/index.js";
import { chunks, collect, fake, json } from "./fixtures.js";

const input = { text: "Hello", voice: { provider: "deepgram", voiceId: "aura-2-thalia-en" } };

describe("Deepgram Aura", () => {
  it("uses the voice as model, ignores unsupported settings and estimates usage", async () => {
    const { ctx, fetch } = fake(new Response(new Uint8Array([1, 2]), { headers: { "dg-request-id": "dg1" } }));
    const provider = createDeepgramProvider(ctx);
    const result = await provider.synthesize({ ...input, model: "aura-2", settings: { speed: 2, emotion: "happy", pitch: 3 }, format: { container: "pcm", sampleRate: 16000 } });
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v1/speak");
    expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual({ model: "aura-2-thalia-en", encoding: "linear16", sample_rate: "16000", container: "none" });
    expect(new Headers(init!.headers).get("Authorization")).toBe("Token test-key");
    expect(JSON.parse(init!.body as string)).toEqual({ text: "Hello" });
    expect(result).toMatchObject({ model: "aura-2-thalia-en", requestId: "dg1", audio: { mimeType: "audio/pcm" }, usage: { units: 5, estimatedCents: 0.015 } });
    expect((await provider.listModels()).map(model => model.id)).toEqual(["aura-2", "aura-1"]);
    expect(provider.capabilities).toMatchObject({ maxInputChars: 2000, instantClone: false, timestamps: false, voiceDesign: false });
  });

  it.each([
    ["wav", "linear16", "wav", "audio/wav"], ["pcm", "linear16", "none", "audio/pcm"],
    ["mulaw", "mulaw", "none", "audio/mulaw"], ["alaw", "alaw", "none", "audio/alaw"],
    ["mp3", "mp3", null, "audio/mpeg"], ["opus", "opus", "ogg", "audio/ogg;codecs=opus"],
    ["ogg", "opus", "ogg", "audio/ogg;codecs=opus"], ["flac", "flac", null, "audio/flac"], ["aac", "aac", null, "audio/aac"],
  ] as const)("maps %s into native encoding/container", async (container, encoding, nativeContainer, mimeType) => {
    const { ctx, fetch } = fake(new Response("audio"));
    const result = await createDeepgramProvider(ctx).synthesize({ ...input, format: { container } });
    const params = new URL(String(fetch.mock.calls[0][0])).searchParams;
    expect(params.get("encoding")).toBe(encoding);
    expect(params.get("container")).toBe(nativeContainer);
    expect(result.audio.mimeType).toBe(mimeType);
    if (["mp3", "opus", "aac"].includes(encoding)) expect(params.has("sample_rate")).toBe(false);
  });

  it("converts kbps to bps and rejects unsupported format combinations", async () => {
    const { ctx, fetch } = fake(new Response("audio"));
    const provider = createDeepgramProvider(ctx);
    await provider.synthesize({ ...input, format: { container: "mp3", bitrate: 48 } });
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("bit_rate")).toBe("48000");
    await expect(provider.synthesize({ ...input, format: { container: "mp3", sampleRate: 48000 } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.synthesize({ ...input, format: { container: "wav", bitDepth: 32 } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.synthesize({ ...input, text: "x".repeat(2001) })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(provider.synthesize({ ...input, model: "aura-1" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(provider.synthesize({ ...input, model: "unrelated-model" })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("yields each chunk from the HTTP response body", async () => {
    const { ctx } = fake(chunks(new Uint8Array([1]), new Uint8Array([2, 3])));
    expect(await collect(createDeepgramProvider(ctx).synthesizeStream!(input))).toEqual([{ audio: new Uint8Array([1]) }, { audio: new Uint8Array([2, 3]) }]);
  });

  it("enriches static voices from the tts discovery section", async () => {
    const { ctx } = fake(json({ tts: [{ canonical_name: "aura-2-thalia-en", languages: ["en-US"], metadata: { gender: "feminine", age: "young adult", tags: ["warm"], description: "Clear" } }] }));
    const voices = await createDeepgramProvider(ctx).listVoices({ search: "Thalia" });
    expect(voices).toHaveLength(1);
    expect(voices[0]).toMatchObject({ id: "deepgram:aura-2-thalia-en", gender: "female", age: "young", tags: ["warm"], models: ["aura-2"], languages: ["en-US"] });
  });

  it("falls back to all 50 Aura 2 and 12 legacy voices if discovery is unavailable", async () => {
    const { ctx } = fake(json({ err_msg: "not available" }, 404));
    const voices = await createDeepgramProvider(ctx).listVoices({ language: "es", gender: "male" });
    expect(DEEPGRAM_VOICES).toHaveLength(62);
    expect(voices.map(voice => voice.providerVoiceId)).toContain("aura-2-nestor-es");
    expect(voices.every(voice => voice.languages.includes("es") && voice.gender === "male")).toBe(true);
  });

  it("does not hide authentication errors behind the static catalog", async () => {
    const { ctx } = fake(json({ err_code: "INVALID_AUTH", err_msg: "Bad token" }, 401));
    await expect(createDeepgramProvider(ctx).listVoices()).rejects.toMatchObject({ code: "auth", message: "Bad token", retryable: false });
  });
});
