import { describe, expect, it, vi } from "vitest";
import { createGoogleProvider, googleProvider } from "../../src/providers/google/index.js";
import type { ProviderContext, SynthesisRequest, VoiceRef } from "../../src/core/types.js";

const request: SynthesisRequest & { voice: VoiceRef } = { text: "Hello world", voice: { provider: "google", voiceId: "en-US-Neural2-F" } };
const audio = () => Response.json({ audioContent: "AQID" });
function setup(responses: Response[], extra: Partial<ProviderContext> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => responses.shift()!);
  return { fetch, provider: createGoogleProvider({ credentials: { apiKey: "test" }, fetch, ...extra }) };
}

describe("Google Cloud TTS", () => {
  it("maps settings and effects and decodes base64 audio", async () => {
    const { fetch, provider } = setup([audio()]);
    const result = await provider.synthesize({ ...request, settings: { speed: 1.25, pitch: 2, volume: 3 }, format: { container: "wav", sampleRate: 24000 }, providerOptions: { effectsProfileId: ["handset-class-device"] } });
    expect(fetch.mock.calls[0][0]).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ "X-Goog-Api-Key": "test" });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ input: { text: "Hello world" }, voice: { name: "en-US-Neural2-F", languageCode: "en-US" }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000, speakingRate: 1.25, pitch: 2, volumeGainDb: 3, effectsProfileId: ["handset-class-device"] } });
    expect(result.audio).toMatchObject({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });
    expect(result.model).toBe("neural2");
    expect(result.usage).toMatchObject({ units: 11, unit: "character", estimatedCents: 11 * 16 / 10000 });
  });

  it("uses OAuth over apiKey and supports configured base origins", async () => {
    const { fetch, provider } = setup([audio()], { credentials: { apiKey: "key", accessToken: "token", project: "project" }, baseUrl: "https://regional.test/v1/" });
    await provider.synthesize(request);
    expect(fetch.mock.calls[0][0]).toBe("https://regional.test/v1/text:synthesize");
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer token", "Content-Type": "application/json", "X-Goog-User-Project": "project" });
  });

  it("requires one of two credentials at call time", async () => {
    const { fetch, provider } = setup([], { credentials: {} });
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "auth" });
    await expect(provider.listVoices()).rejects.toMatchObject({ code: "auth" });
    expect(fetch).not.toHaveBeenCalled();
    expect(googleProvider.requiredCredentials).toEqual([]);
  });

  it("builds Gemini modelName and style prompt without unsupported audio knobs", async () => {
    const { fetch, provider } = setup([audio()]);
    const result = await provider.synthesize({ ...request, voice: { provider: "google", voiceId: "Kore" }, model: "gemini-2.5-pro-tts", settings: { emotion: "happy", style: 0.8, speed: 1.2 }, providerOptions: { prompt: "Tell a story." } });
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(body.voice).toEqual({ languageCode: "en-US", name: "Kore", modelName: "gemini-2.5-pro-tts" });
    expect(body.input.prompt).toContain("happy");
    expect(body.input.prompt).toContain("0.8");
    expect(body.input.prompt).toContain("Tell a story.");
    expect(body.input.prompt).toContain("1.2 times");
    expect(body.audioConfig).toEqual({ audioEncoding: "MP3" });
    expect(result.usage.estimatedCents).toBeNull();
  });

  it("inserts marks, requests beta timepoints, and uses the terminal mark for the last end", async () => {
    const { fetch, provider } = setup([Response.json({ audioContent: "AQID", timepoints: [{ markName: "w0", timeSeconds: 0.1 }, { markName: "w1", timeSeconds: 0.5 }, { markName: "end", timeSeconds: 0.9 }] })]);
    const result = await provider.synthesize({ ...request, timestamps: true });
    expect(fetch.mock.calls[0][0]).toBe("https://texttospeech.googleapis.com/v1beta1/text:synthesize");
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ input: { ssml: '<speak><mark name="w0"/>Hello <mark name="w1"/>world<mark name="end"/></speak>' }, enableTimePointing: ["SSML_MARK"] });
    expect(result.timestamps).toEqual([{ text: "Hello", startMs: 100, endMs: 500 }, { text: "world", startMs: 500, endMs: 900 }]);
  });

  it("preserves caller SSML and labels caller marks without guessing spoken words", async () => {
    const { fetch, provider } = setup([Response.json({ audioContent: "AQID", timepoints: [{ markName: "section", timeSeconds: 0.2 }] })]);
    const text = '<speak><mark name="section"/><say-as interpret-as="digits">12</say-as></speak>';
    const result = await provider.synthesize({ ...request, text, ssml: true, timestamps: true });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).input).toEqual({ ssml: text });
    expect(result.timestamps).toEqual([{ text: "section", startMs: 200, endMs: 200 }]);
  });

  it("renders escaped pronunciation, say-as and explicit prosody", async () => {
    const { fetch, provider } = setup([audio()]);
    await provider.synthesize({ ...request, text: "API read &", pronunciation: [{ grapheme: "API", alias: "A P I" }, { grapheme: "read", phoneme: "riːd" }], providerOptions: { sayAs: "characters", prosody: { rate: "slow", pitch: "+1st" } } });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).input.ssml).toBe('<speak><prosody rate="slow" pitch="+1st"><say-as interpret-as="characters"><sub alias="A P I">API</sub> <phoneme alphabet="ipa" ph="riːd">read</phoneme> &amp;</say-as></prosody></speak>');
  });

  it.each([["mp3", "MP3"], ["wav", "LINEAR16"], ["pcm", "PCM"], ["opus", "OGG_OPUS"], ["ogg", "OGG_OPUS"], ["mulaw", "MULAW"], ["alaw", "ALAW"]] as const)("maps %s encoding", async (container, audioEncoding) => {
    const { fetch, provider } = setup([audio()]);
    await provider.synthesize({ ...request, format: { container } });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).audioConfig.audioEncoding).toBe(audioEncoding);
  });

  it("normalizes voice families and sends the locale filter", async () => {
    const { fetch, provider } = setup([Response.json({ voices: [{ name: "es-ES-Chirp3-HD-Aoede", languageCodes: ["es-ES"], ssmlGender: "FEMALE", naturalSampleRateHertz: 24000 }] })]);
    const voices = await provider.listVoices({ language: "es-ES", tags: ["chirp3-hd"] });
    expect(fetch.mock.calls[0][0]).toContain("/voices?languageCode=es-ES");
    expect(voices).toEqual([expect.objectContaining({ id: "google:es-ES-Chirp3-HD-Aoede", languages: ["es-ES"], gender: "female", models: ["chirp3-hd"], raw: expect.objectContaining({ naturalSampleRateHertz: 24000 }) })]);
  });

  it("uses fallback only for transient catalog errors", async () => {
    const { provider } = setup([new Response("offline", { status: 503 }), new Response("bad key", { status: 401 })]);
    expect((await provider.listVoices()).length).toBeGreaterThanOrEqual(20);
    await expect(provider.listVoices()).rejects.toMatchObject({ code: "auth" });
  });

  it.each([
    [403, "PERMISSION_DENIED", "permission denied", "auth", false], [401, "UNAUTHENTICATED", "invalid token", "auth", false],
    [429, "RESOURCE_EXHAUSTED", "rate limit", "rate_limit", true], [429, "RESOURCE_EXHAUSTED", "daily quota exhausted", "quota_exceeded", false],
    [400, "INVALID_ARGUMENT", "bad input", "invalid_request", false],
  ])("maps Google %s %s", async (status, apiStatus, message, code, retryable) => {
    const { provider } = setup([Response.json({ error: { code: status, status: apiStatus, message } }, { status: Number(status), headers: { "retry-after": "2" } })]);
    await expect(provider.synthesize(request)).rejects.toMatchObject({ status, code, retryable, retryAfterMs: 2000 });
  });

  it("emulates streaming with sequential complete sentence audio", async () => {
    const { fetch, provider } = setup([audio(), audio()]);
    const stream = provider.synthesizeStream!({ ...request, text: "Hello world. Next sentence!" })[Symbol.asyncIterator]();
    expect(fetch).not.toHaveBeenCalled();
    expect((await stream.next()).value).toMatchObject({ text: "Hello world. ", audio: new Uint8Array([1, 2, 3]) });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await stream.next()).value).toMatchObject({ text: "Next sentence!" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await stream.next()).done).toBe(true);
  });

  it("requires consent, encodes separate recordings and routes clone synthesis", async () => {
    const { fetch, provider } = setup([Response.json({ voiceCloningKey: "secret-key" }), audio()]);
    await expect(provider.cloneVoice!({ name: "Person", samples: [] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
    const sample = { data: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" };
    const result = await provider.cloneVoice!({ name: "Person", language: "en-US", samples: [sample], consent: { attested: true, text: "Provider consent statement" }, providerOptions: { consentAudio: sample } });
    expect(fetch.mock.calls[0][0]).toBe("https://texttospeech.googleapis.com/v1beta1/voices:generateVoiceCloningKey");
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ referenceAudio: { audioConfig: { audioEncoding: "LINEAR16" }, content: "AQID" }, voiceTalentConsent: { audioConfig: { audioEncoding: "LINEAR16" }, content: "AQID" }, consentScript: "Provider consent statement", languageCode: "en-US" });
    expect(result).toMatchObject({ status: "ready", voice: { providerVoiceId: "clone:secret-key" } });
    await provider.synthesize({ ...request, voice: { provider: "google", voiceId: result.voice.providerVoiceId } });
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string).voice).toEqual({ languageCode: "en-US", voiceClone: { voiceCloningKey: "secret-key" } });
    expect(await provider.getVoice!(result.voice.providerVoiceId)).toEqual(result.voice);
  });

  it("rejects malformed audio and unsupported Gemini timestamps", async () => {
    const { provider } = setup([Response.json({ audioContent: "!!!" })]);
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(provider.synthesize({ ...request, model: "gemini-2.5-pro-tts", timestamps: true })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("honors deadlines during a stalled JSON response body", async () => {
    const { provider } = setup([new Response(new ReadableStream())], { timeoutMs: 10 });
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "timeout" });
  });

  it("treats per-minute quota as a retryable rate limit", async () => {
    const { provider } = setup([Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota requests per minute exceeded" } }, { status: 429 })]);
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "rate_limit", retryable: true });
  });

  it("does not split SSML streams or send more requests after cancellation", async () => {
    const { fetch, provider } = setup([audio(), audio()]);
    const ssml = '<speak>Hello. Next.</speak>';
    const chunks = [];
    for await (const chunk of provider.synthesizeStream!({ ...request, text: ssml, ssml: true })) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).input).toEqual({ ssml });
    const controller = new AbortController();
    const stream = provider.synthesizeStream!({ ...request, text: "Hello. Next.", signal: controller.signal })[Symbol.asyncIterator]();
    await stream.next();
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ code: "aborted" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves nested audio config options and reports their sample rate", async () => {
    const { fetch, provider } = setup([audio()]);
    const result = await provider.synthesize({ ...request, providerOptions: { audioConfig: { speakingRate: 0.9, sampleRateHertz: 16000 } } });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).audioConfig).toEqual({ audioEncoding: "MP3", speakingRate: 0.9, sampleRateHertz: 16000 });
    expect(result.audio.format.sampleRate).toBe(16000);
  });

  it("normalizes malformed JSON, audio and timepoints as provider failures", async () => {
    const { provider } = setup([new Response("bad JSON"), Response.json({ audioContent: "A=" }), Response.json({ audioContent: "AQID", timepoints: "bad" })]);
    for (let i = 0; i < 3; i++) await expect(provider.synthesize(request)).rejects.toMatchObject({ name: "VoiceEngineError", code: "provider_unavailable" });
  });

  it("does not silently drop a multi-word pronunciation when word alignment is requested", async () => {
    const { fetch, provider } = setup([]);
    await expect(provider.synthesize({ ...request, timestamps: true, pronunciation: [{ grapheme: "Hello world", alias: "Hi" }] })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
