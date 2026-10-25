import { describe, expect, it } from "vitest";
import { createHumeProvider, HUME_MODELS } from "../../src/providers/hume/index.js";
import { collect, fake, json, split } from "./fixtures.js";

const input = { text: "Hello", voice: { provider: "hume", voiceId: "v1" } };
const generation = { generation_id: "g1", audio: "AQI=", duration: 1.25, encoding: { format: "mp3", sample_rate: 48000 }, snippets: [[{ text: "Hello", timestamps: [{ type: "word", text: "Hello", time: { begin: 10, end: 450 } }, { type: "phoneme", text: "h", time: { begin: 10, end: 25 } }] }]] };

describe("Hume Octave", () => {
  it("maps acting instructions, speed, voice identity, context and timestamps", async () => {
    const { ctx, fetch } = fake(json({ generations: [generation], request_id: "req1" }));
    const result = await createHumeProvider(ctx).synthesize({ ...input, timestamps: true, settings: { emotion: "happy", style: 0.5, speed: 1.4 }, context: { previousText: "Earlier" }, providerOptions: { voiceProvider: "CUSTOM_VOICE", trailing_silence: 0.2 } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.hume.ai/v0/tts");
    expect(new Headers(init!.headers).get("X-Hume-Api-Key")).toBe("test-key");
    expect(JSON.parse(init!.body as string)).toMatchObject({ version: "2", format: { type: "mp3" }, include_timestamp_types: ["word"], context: { utterances: [{ text: "Earlier" }] }, utterances: [{ text: "Hello", voice: { id: "v1", provider: "CUSTOM_VOICE" }, description: "happy Expressiveness: 50%.", speed: 1.4, trailing_silence: 0.2 }] });
    expect(result.audio).toMatchObject({ data: new Uint8Array([1, 2]), durationMs: 1250, mimeType: "audio/mpeg" });
    expect(result.timestamps).toEqual([{ text: "Hello", startMs: 10, endMs: 450 }]);
    expect(result.usage).toMatchObject({ units: 5, estimatedCents: null, requestId: "req1" });
  });

  it.each(["mp3", "wav", "pcm"] as const)("maps %s output", async container => {
    const { ctx, fetch } = fake(json({ generations: [{ ...generation, encoding: { format: container, sample_rate: 48000 } }] }));
    const result = await createHumeProvider(ctx).synthesize({ ...input, format: { container } });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).format).toEqual({ type: container });
    expect(result.audio.mimeType).toBe(container === "mp3" ? "audio/mpeg" : `audio/${container}`);
  });

  it("parses byte-fragmented NDJSON with interleaved timestamps and no final newline", async () => {
    const payload = [
      { type: "audio", audio: "AQI=", text: "Héllo" },
      { type: "timestamp", timestamp: { type: "word", text: "Héllo", time: { begin: 20, end: 500 } } },
      { type: "timestamp", timestamp: { type: "phoneme", text: "h", time: { begin: 20, end: 40 } } },
      { audio: "Aw==", timestamps: [{ word: "world", start: 0.5, end: 0.8 }] },
    ].map(value => JSON.stringify(value)).join("\r\n");
    const { ctx, fetch } = fake(split(payload));
    const output = await collect(createHumeProvider(ctx).synthesizeStream!({ ...input, timestamps: true }));
    expect(output).toEqual([
      { audio: new Uint8Array([1, 2]), text: "Héllo", timestamps: undefined },
      { audio: new Uint8Array(), text: undefined, timestamps: [{ text: "Héllo", startMs: 20, endMs: 500 }] },
      { audio: new Uint8Array([3]), text: undefined, timestamps: [{ text: "world", startMs: 500, endMs: 800 }] },
    ]);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).strip_headers).toBe(true);
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/tts\/stream\/json$/);
  });

  it("rejects malformed NDJSON, stream errors and missing generation audio", async () => {
    const { ctx } = fake(split('{invalid}\n'), split('{"type":"error","status":429,"message":"busy"}\n'), json({ generations: [] }));
    const provider = createHumeProvider(ctx);
    await expect(collect(provider.synthesizeStream!(input))).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(collect(provider.synthesizeStream!(input))).rejects.toMatchObject({ code: "rate_limit", status: 429 });
    await expect(provider.synthesize(input)).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("reports malformed design responses as provider failures", async () => {
    const { ctx } = fake(json({ generations: [] }), json({ generations: [{ audio: "AQI=" }] }));
    const provider = createHumeProvider(ctx);
    await expect(provider.designVoice!({ prompt: "Warm" })).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(provider.designVoice!({ prompt: "Warm" })).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("paginates both voice providers and remembers custom provider selection", async () => {
    const { ctx, fetch } = fake(
      json({ voices_page: [{ id: "p1", name: "Preset", provider: "HUME_AI" }], total_pages: 2 }),
      json({ voices_page: [{ id: "p2", name: "Preset Two", provider: "HUME_AI" }], total_pages: 2 }),
      json({ voices_page: [{ id: "c1", name: "Custom", provider: "CUSTOM_VOICE" }], total_pages: 1 }),
      json({ generations: [generation] }),
    );
    const provider = createHumeProvider(ctx), voices = await provider.listVoices();
    expect(voices.map(voice => voice.origin)).toEqual(["premade", "premade", "designed"]);
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("page_number")).toBe("1");
    expect(new URL(String(fetch.mock.calls[2][0])).searchParams.get("provider")).toBe("CUSTOM_VOICE");
    await provider.synthesize({ ...input, voice: { provider: "hume", voiceId: "c1" } });
    expect(JSON.parse(fetch.mock.calls[3][1]!.body as string).utterances[0].voice.provider).toBe("CUSTOM_VOICE");
  });

  it("designs candidate previews, saves their token and resolves IDs for deletion", async () => {
    const { ctx, fetch } = fake(
      json({ generations: [generation, { ...generation, generation_id: "g2" }] }),
      json({ id: "saved", name: "My Voice", provider: "CUSTOM_VOICE" }),
      json({ voices_page: [{ id: "saved", name: "My Voice", provider: "CUSTOM_VOICE" }], total_pages: 1 }),
      new Response(null, { status: 204 }),
    );
    const provider = createHumeProvider(ctx);
    const designed = await provider.designVoice!({ prompt: "Warm narrator", text: "Hello", candidates: 2 });
    expect(designed.candidates.map(candidate => candidate.candidateId)).toEqual(["g1", "g2"]);
    const designBody = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(designBody.utterances).toEqual([{ text: "Hello", description: "Warm narrator" }]);
    expect(designBody.num_generations).toBe(2);
    expect(designBody.version).toBeUndefined();
    expect((await provider.saveDesignedVoice!("g2", "My Voice")).origin).toBe("designed");
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({ generation_id: "g2", name: "My Voice" });
    await provider.deleteVoice!("saved");
    expect(new URL(String(fetch.mock.calls[3][0])).searchParams.get("name")).toBe("My Voice");
  });

  it("supports named voices and rejects impossible output, candidate and legacy timestamp requests", async () => {
    const { ctx, fetch } = fake(json({ generations: [generation] }));
    const provider = createHumeProvider(ctx);
    await provider.synthesize({ ...input, model: "octave", providerOptions: { voiceName: "Actor" } });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ version: "1", utterances: [{ voice: { name: "Actor", provider: "HUME_AI" } }] });
    await expect(provider.synthesize({ ...input, model: "octave", timestamps: true })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.synthesize({ ...input, format: { container: "ogg" } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.designVoice!({ prompt: "A voice", candidates: 6 })).rejects.toMatchObject({ code: "invalid_request" });
    expect(provider.cloneVoice).toBeUndefined();
    expect(provider.capabilities.instantClone).toBe(false);
    expect(HUME_MODELS[0].languages.length).toBeGreaterThanOrEqual(11);
  });
});
