import { describe, expect, it } from "vitest";
import { cartesiaProvider, createCartesiaProvider, createPronunciationDict, infillAudio, localizeVoice, mixVoices } from "../../src/providers/cartesia/index.js";
import { collect, fake, json, split } from "./fixtures.js";

const input = { text: "Hola", voice: { provider: "cartesia", voiceId: "voice-1" } };
const sample = { data: new Uint8Array([1, 2, 3]), mimeType: "audio/wav", fileName: "owner.wav" };
const sse = ': keepalive\r\nevent: chunk\r\ndata: {"data":"AQI="}\r\n\r\nevent: timestamps\ndata: {"word_timestamps":{"words":["Hóla"],"start":[0.1],"end":[0.4]}}\n\nevent: done\ndata: {"done":true}\n\n';

describe("Cartesia", () => {
  it("registers models and maps Sonic 3 controls, credentials, format and usage", async () => {
    const { ctx, fetch } = fake(new Response(new Uint8Array([1]), { headers: { "x-request-id": "r1" } }));
    const provider = createCartesiaProvider(ctx);
    const result = await provider.synthesize({ ...input, language: "es-ES", format: { container: "mp3", bitrate: 128 }, settings: { speed: 4, volume: 20, emotion: "happy" }, providerOptions: { pronunciation_dict_id: "dict", generation_config: { speed: 1.2 } } });
    const [url, init] = fetch.mock.calls[0], body = JSON.parse(init!.body as string), headers = new Headers(init!.headers);
    expect(url).toBe("https://api.cartesia.ai/tts/bytes");
    expect(headers.get("X-API-Key")).toBe("test-key");
    expect(headers.get("Cartesia-Version")).toBe("2025-04-16");
    expect(body).toMatchObject({ model_id: "sonic-3", transcript: "Hola", language: "es", voice: { mode: "id", id: "voice-1" }, generation_config: { speed: 1.2, volume: 2, emotion: "happy" }, output_format: { container: "mp3", bit_rate: 128000 }, pronunciation_dict_id: "dict" });
    expect(result.audio.mimeType).toBe("audio/mpeg");
    expect(result.usage).toMatchObject({ units: 4, estimatedCents: 0.02, requestId: "r1" });
    expect((await provider.listModels()).map(model => model.id)).toContain("sonic-turbo");
    expect(cartesiaProvider.requiredCredentials).toEqual(["apiKey"]);
  });

  it("maps legacy speed to -1..1 and raw telephony encodings", async () => {
    const { ctx, fetch } = fake(new Response("audio"));
    await createCartesiaProvider(ctx).synthesize({ ...input, model: "sonic-2", settings: { speed: 0.25 }, format: { container: "alaw", sampleRate: 8000 } });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ speed: -0.75, output_format: { container: "raw", encoding: "pcm_alaw", sample_rate: 8000 } });
  });

  it.each(["wav", "pcm", "mulaw", "alaw"] as const)("maps %s output bytes", async container => {
    const { ctx, fetch } = fake(new Response("audio"));
    const result = await createCartesiaProvider(ctx).synthesize({ ...input, format: { container } });
    expect(result.audio.format.container).toBe(container);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).output_format.container).toBe(container === "wav" ? "wav" : "raw");
  });

  it("parses fragmented UTF-8 SSE audio and seconds-based word alignment", async () => {
    const { ctx } = fake(split(sse));
    expect(await collect(createCartesiaProvider(ctx).synthesizeStream!({ ...input, timestamps: true }))).toEqual([
      { audio: new Uint8Array([1, 2]), timestamps: undefined },
      { audio: new Uint8Array(), timestamps: [{ text: "Hóla", startMs: 100, endMs: 400 }] },
    ]);
  });

  it("buffers timestamp SSE into one valid WAV header", async () => {
    const { ctx, fetch } = fake(split(sse));
    const result = await createCartesiaProvider(ctx).synthesize({ ...input, timestamps: true });
    expect(String(fetch.mock.calls[0][0])).toContain("/tts/sse");
    expect(new TextDecoder().decode(result.audio.data.slice(0, 4))).toBe("RIFF");
    expect(new DataView(result.audio.data.buffer).getUint32(40, true)).toBe(2);
    expect([...result.audio.data.slice(44)]).toEqual([1, 2]);
    expect(result.timestamps).toEqual([{ text: "Hóla", startMs: 100, endMs: 400 }]);
  });

  it("handles unterminated SSE events and rejects stream errors", async () => {
    const { ctx } = fake(split('data: {"type":"chunk","data":"AQ=="}'), split('data: {"type":"error","status_code":429,"error":"busy"}\n\n'));
    const provider = createCartesiaProvider(ctx);
    expect((await collect(provider.synthesizeStream!(input)))[0].audio).toEqual(new Uint8Array([1]));
    await expect(collect(provider.synthesizeStream!(input))).rejects.toMatchObject({ code: "rate_limit", retryable: true, status: 429 });
  });

  it("rejects impossible formats before sending a request", async () => {
    const { ctx, fetch } = fake();
    await expect(createCartesiaProvider(ctx).synthesize({ ...input, format: { container: "flac" } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(collect(createCartesiaProvider(ctx).synthesizeStream!({ ...input, timestamps: true, format: { container: "mp3" } }))).rejects.toMatchObject({ code: "unsupported" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("streams MP3 bytes without alignment and supplies the required bitrate", async () => {
    const { ctx, fetch } = fake(new Response(new Uint8Array([1, 2])));
    expect((await collect(createCartesiaProvider(ctx).synthesizeStream!({ ...input, format: { container: "mp3" } })))[0].audio).toEqual(new Uint8Array([1, 2]));
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/tts\/bytes$/);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).output_format.bit_rate).toBe(128000);
  });

  it("paginates and normalizes voices before applying local filters", async () => {
    const { ctx, fetch } = fake(json({ data: [{ id: "a", name: "A", language: "es", is_public: true }], has_more: true, next_page: "a" }), json({ data: [{ id: "b", name: "B", description: "Warm", language: "es", gender: "female", is_public: false }], has_more: false }));
    const voices = await createCartesiaProvider(ctx).listVoices({ language: "ES-es", search: "warm", limit: 1 });
    expect(voices[0]).toMatchObject({ id: "cartesia:b", gender: "female", origin: "cloned", languages: ["es"] });
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("starting_after")).toBe("a");
  });

  it("requires consent, submits clone multipart, and preserves attestation", async () => {
    const { ctx, fetch } = fake(json({ id: "clone", name: "Owner", is_public: false }));
    const provider = createCartesiaProvider(ctx);
    await expect(provider.cloneVoice!({ name: "Owner", samples: [sample] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
    const result = await provider.cloneVoice!({ name: "Owner", samples: [sample], language: "es-ES", denoise: true, consent: { attested: true }, providerOptions: { mode: "stability", base_voice_id: "base" } });
    const form = fetch.mock.calls[0][1]!.body as FormData;
    expect(form.get("clip")).toBeInstanceOf(Blob);
    expect(new Uint8Array(await (form.get("clip") as Blob).arrayBuffer())).toEqual(sample.data);
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== "clip"))).toMatchObject({ name: "Owner", language: "es", mode: "stability", enhance: "true", base_voice_id: "base" });
    expect(new Headers(fetch.mock.calls[0][1]!.headers).has("Content-Type")).toBe(false);
    expect(result.voice.raw?.consent).toEqual({ attested: true });
  });

  it("supports update, delete and not-found lookup", async () => {
    const { ctx, fetch } = fake(json({ id: "v", name: "New" }), new Response(null, { status: 204 }), json({ error: "missing" }, 404));
    const provider = createCartesiaProvider(ctx);
    expect((await provider.updateVoice!("v", { name: "New" })).name).toBe("New");
    await provider.deleteVoice!("v");
    expect(await provider.getVoice!("missing")).toBeUndefined();
    expect(fetch.mock.calls.map(call => call[1]!.method)).toEqual(["PATCH", "DELETE", "GET"]);
  });

  it("maps localization, mixing, dictionaries, infill and voice conversion", async () => {
    const { ctx, fetch } = fake(json({ id: "l" }), json({ id: "m" }), json({ id: "d" }), new Response("audio"), new Response("audio"));
    await localizeVoice(ctx, { voiceId: "v", name: "Spanish", language: "es", dialect: "es-ES" });
    await mixVoices(ctx, [{ id: "v", weight: 1 }]);
    await createPronunciationDict(ctx, { name: "Names", items: [{ text: "Ada", pronunciation: "a da" }] });
    await infillAudio(ctx, { text: "bridge", voiceId: "v", leftAudio: sample });
    await createCartesiaProvider(ctx).speechToSpeech!({ audio: sample, voice: input.voice, format: { container: "mulaw" } });
    expect(fetch.mock.calls.map(call => new URL(String(call[0])).pathname)).toEqual(["/voices/localize", "/voices/mix", "/pronunciation-dicts", "/infill/bytes", "/voice-changer/bytes"]);
    expect((fetch.mock.calls[3][1]!.body as FormData).get("left_audio")).toBeInstanceOf(Blob);
    expect((fetch.mock.calls[4][1]!.body as FormData).get("voice[id]")).toBe("voice-1");
  });
});
