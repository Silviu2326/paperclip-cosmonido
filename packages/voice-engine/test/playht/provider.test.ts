import { describe, expect, it } from "vitest";
import { createPlayHtProvider, playHtProvider, synthesizeDialog, synthesizeJob } from "../../src/providers/playht/index.js";
import { chunks, collect, fake, json } from "./fixtures.js";

const input = { text: "Hola", voice: { provider: "playht", voiceId: "s3://voice/manifest.json" } };
const sample = { data: new Uint8Array([1, 2]), mimeType: "audio/wav", fileName: "voice.wav" };

describe("PlayHT", () => {
  it("maps controls, named language, format and both authentication headers", async () => {
    const { ctx, fetch } = fake(new Response("audio"));
    const result = await createPlayHtProvider(ctx).synthesize({ ...input, language: "es-ES", format: { container: "wav", sampleRate: 24000 }, settings: { speed: 1.5, stability: 0.75, similarity: 0.8, style: 1, seed: 7, emotion: "female_happy" }, providerOptions: { quality: "premium", text_guidance: 1.2 } });
    const [url, init] = fetch.mock.calls[0], headers = new Headers(init!.headers);
    expect(url).toBe("https://api.play.ht/api/v2/tts/stream");
    expect(headers.get("Authorization")).toBe("Bearer test-key");
    expect(headers.get("X-USER-ID")).toBe("test-user");
    expect(JSON.parse(init!.body as string)).toMatchObject({ text: "Hola", voice: input.voice.voiceId, voice_engine: "Play3.0-mini", language: "spanish", output_format: "wav", speed: 1.5, temperature: 0.5, voice_guidance: 5, style_guidance: 30, seed: 7, emotion: "female_happy", quality: "premium", text_guidance: 1.2 });
    expect(result.usage.estimatedCents).toBeNull();
    expect(playHtProvider.requiredCredentials).toEqual(["apiKey", "userId"]);
    expect(playHtProvider.credentialEnv.apiKey).toEqual(["PLAYHT_API_KEY", "PLAY_HT_API_KEY"]);
  });

  it.each(["mp3", "wav", "ogg", "flac", "mulaw", "pcm"] as const)("maps %s format", async container => {
    const { ctx, fetch } = fake(new Response("audio"));
    const result = await createPlayHtProvider(ctx).synthesize({ ...input, format: { container } });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).output_format).toBe(container === "pcm" ? "raw" : container);
    expect(result.audio.mimeType).toBe(container === "mp3" ? "audio/mpeg" : `audio/${container}`);
  });

  it("streams body chunks and maps dialog aliases", async () => {
    const { ctx, fetch } = fake(chunks("a", "b"));
    expect(await collect(createPlayHtProvider(ctx).synthesizeStream!({ ...input, model: "PlayDialog", providerOptions: { turnPrefix: "A:", turnPrefix2: "B:", voice2: "v2" } }))).toHaveLength(2);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ voice_engine: "PlayDialog", turn_prefix: "A:", turn_prefix_2: "B:", voice_2: "v2" });
  });

  it("normalizes premade and cloned voice metadata", async () => {
    const { ctx } = fake(json([{ id: "p", name: "Ada", language: "English", gender: "Female", age: "adult", style: "narration", sample: "https://example.com/p.mp3", voice_engine: "Play3.0-mini" }]), json([{ id: "c", name: "Owner", language_code: "es_ES" }]));
    const voices = await createPlayHtProvider(ctx).listVoices();
    expect(voices[0]).toMatchObject({ id: "playht:p", gender: "female", age: "middle_aged", languages: ["en"], origin: "premade", models: ["Play3.0-mini"] });
    expect(voices[1]).toMatchObject({ id: "playht:c", languages: ["es-ES"], origin: "cloned" });
  });

  it("requires attestation and sends native clone fields without setting a multipart boundary", async () => {
    const { ctx, fetch } = fake(json({ id: "c", name: "Owner" }), new Response(null, { status: 204 }));
    const provider = createPlayHtProvider(ctx);
    await expect(provider.cloneVoice!({ name: "Owner", samples: [sample] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
    expect((await provider.cloneVoice!({ name: "Owner", samples: [sample], consent: { attested: true } })).voice.origin).toBe("cloned");
    const form = fetch.mock.calls[0][1]!.body as FormData;
    expect(form.get("voice_name")).toBe("Owner");
    expect(form.get("mime_type")).toBe("audio/wav");
    expect(new Uint8Array(await (form.get("sample_file") as Blob).arrayBuffer())).toEqual(sample.data);
    expect(new Headers(fetch.mock.calls[0][1]!.headers).has("Content-Type")).toBe(false);
    await provider.deleteVoice!("c");
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({ voice_id: "c" });
  });

  it("supports URL-based cloning", async () => {
    const { ctx, fetch } = fake(json({ id: "c" }));
    await createPlayHtProvider(ctx).cloneVoice!({ name: "URL voice", samples: [], consent: { attested: true }, providerOptions: { sample_file_url: "https://example.com/owner.wav" } });
    expect((fetch.mock.calls[0][1]!.body as FormData).get("sample_file_url")).toBe("https://example.com/owner.wav");
  });

  it("polls jobs and downloads audio without leaking provider credentials", async () => {
    const { ctx, fetch } = fake(json({ id: "job1", status: "queued" }), json({ id: "job1", status: "complete", output: { url: "https://cdn.example.com/audio.mp3" } }), new Response(new Uint8Array([7])));
    const result = await synthesizeJob(ctx, input, { pollIntervalMs: 1 });
    expect(result.audio.data).toEqual(new Uint8Array([7]));
    expect(String(fetch.mock.calls[1][0])).toMatch(/\/tts\/job1$/);
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get("Accept")).toBe("application/json");
    const downloadHeaders = new Headers(fetch.mock.calls[2][1]!.headers);
    expect(downloadHeaders.has("Authorization")).toBe(false);
    expect(downloadHeaders.has("X-USER-ID")).toBe(false);
  });

  it("reports job failures and respects a total polling deadline", async () => {
    const failure = fake(json({ id: "j", status: "failed", error: "generation failed" }));
    await expect(synthesizeJob(failure.ctx, input)).rejects.toMatchObject({ code: "provider_unavailable", message: "generation failed" });
    const pending = fake(json({ id: "j", status: "pending" }));
    await expect(synthesizeJob(pending.ctx, input, { timeoutMs: 5, pollIntervalMs: 1000 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("builds two-speaker dialogue and rejects a third voice", async () => {
    const { ctx, fetch } = fake(new Response("audio"));
    await synthesizeDialog(ctx, [{ voiceId: "a", text: "Hi" }, { voiceId: "b", text: "Hello" }, { voiceId: "a", text: "Again" }]);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ voice: "a", voice_2: "b", voice_engine: "PlayDialog", text: "Speaker 1: Hi\nSpeaker 2: Hello\nSpeaker 1: Again" });
    await expect(synthesizeDialog(ctx, ["a", "b", "c"].map(voiceId => ({ voiceId, text: "Hi" })))).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects missing user ID and unsupported formats", async () => {
    const { ctx, fetch } = fake();
    ctx.credentials.userId = undefined;
    await expect(createPlayHtProvider(ctx).synthesize(input)).rejects.toMatchObject({ code: "auth" });
    await expect(createPlayHtProvider(ctx).synthesize({ ...input, format: { container: "alaw" } })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
