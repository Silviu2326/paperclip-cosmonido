import { describe, expect, it, vi } from "vitest";
import { azureProvider, createAzureProvider } from "../../src/providers/azure/index.js";
import type { ProviderContext, SynthesisRequest, VoiceRef } from "../../src/core/types.js";

const request: SynthesisRequest & { voice: VoiceRef } = { text: 'Hello & <world> API', voice: { provider: "azure", voiceId: "en-US-JennyNeural" } };
function setup(responses: Response[], extra: Partial<ProviderContext> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => responses.shift()!);
  return { fetch, provider: createAzureProvider({ credentials: { apiKey: "test" }, fetch, ...extra }) };
}

describe("Azure Speech REST", () => {
  it("escapes text and maps expression, prosody, pronunciation and headers", async () => {
    const { fetch, provider } = setup([new Response("audio")]);
    const result = await provider.synthesize({ ...request, language: "en-US", settings: { speed: 1.2, pitch: 2, volume: 3, emotion: "happy", style: 0.75 }, pronunciation: [{ grapheme: "API", alias: "A P I" }] });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init?.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "test", "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3" });
    expect(init?.body).toContain('<mstts:express-as style="cheerful" styledegree="1.5"><prosody rate="+20%" pitch="+2st" volume="+3dB">Hello &amp; &lt;world&gt; <sub alias="A P I">API</sub>');
    expect(result.audio.mimeType).toBe("audio/mpeg");
    expect(result.model).toBe("neural");
    expect(result.timestamps).toBeUndefined();
    expect(provider.capabilities.timestamps).toBe(false);
  });

  it.each([
    [{ container: "mp3", sampleRate: 16000 }, "audio-16khz-128kbitrate-mono-mp3"],
    [{ container: "mp3", sampleRate: 48000 }, "audio-48khz-192kbitrate-mono-mp3"],
    [{ container: "wav" }, "riff-24khz-16bit-mono-pcm"], [{ container: "pcm" }, "raw-24khz-16bit-mono-pcm"],
    [{ container: "opus" }, "ogg-48khz-16bit-mono-opus"], [{ container: "mulaw" }, "raw-8khz-8bit-mono-mulaw"],
  ] as const)("maps format %o", async (format, native) => {
    const { fetch, provider } = setup([new Response("audio")]);
    await provider.synthesize({ ...request, format });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("X-Microsoft-OutputFormat")).toBe(native);
  });

  it("preserves caller SSML and injects a voice only when missing", async () => {
    const { fetch, provider } = setup([new Response("one"), new Response("two")]);
    const xml = '<speak xml:lang="es-ES"><voice name="es-ES-ElviraNeural"><break time="1s"/>Hola</voice></speak>';
    await provider.synthesize({ ...request, text: xml, ssml: true });
    expect(fetch.mock.calls[0][1]?.body).toBe(xml);
    await provider.synthesize({ ...request, text: '<speak xml:lang="en-US">Hi</speak>', ssml: true });
    expect(fetch.mock.calls[1][1]?.body).toBe('<speak xml:lang="en-US"><voice name="en-US-JennyNeural">Hi</voice></speak>');
  });

  it("maps IPA and personal speaker profile SSML", async () => {
    const { fetch, provider } = setup([new Response("audio")]);
    await provider.synthesize({ ...request, voice: { provider: "azure", voiceId: "personal:profile-123" }, text: "read", pronunciation: [{ grapheme: "read", phoneme: "riːd" }] });
    expect(fetch.mock.calls[0][1]?.body).toContain('<mstts:ttsembedding speakerProfileId="profile-123"><phoneme alphabet="ipa" ph="riːd">read</phoneme>');
  });

  it("normalizes voices and preserves secondary locales, styles and raw metadata", async () => {
    const { provider } = setup([Response.json([{ ShortName: "en-US-AvaMultilingualNeural", DisplayName: "Ava", Gender: "Female", Locale: "en-US", SecondaryLocaleList: ["es-ES"], StyleList: ["cheerful"], WordsPerMinute: 150 }])]);
    expect(await provider.listVoices({ language: "es-ES" })).toEqual([expect.objectContaining({ id: "azure:en-US-AvaMultilingualNeural", languages: ["en-US", "es-ES"], models: ["multilingual"], gender: "female", tags: ["cheerful"], raw: expect.objectContaining({ styles: ["cheerful"], WordsPerMinute: 150 }) })]);
  });

  it("has 30 fallback voices and language-aware defaults", async () => {
    const { provider } = setup([], { credentials: {} });
    expect(await provider.listVoices()).toHaveLength(30);
    expect(provider.defaultModel({ language: "en-US" })).toBe("neural-hd");
    expect(provider.defaultModel({ language: "sw-KE" })).toBe("neural");
    expect(azureProvider.requiredCredentials).toEqual(["apiKey"]);
  });

  it.each([[401, "auth", false], [429, "rate_limit", true], [400, "invalid_request", false], [415, "unsupported", false]])("maps %s errors", async (status, code, retryable) => {
    const { provider } = setup([new Response("invalid SSML", { status: Number(status), headers: { "retry-after": "3" } })]);
    await expect(provider.synthesize(request)).rejects.toMatchObject({ status, code, retryable, retryAfterMs: 3000 });
  });

  it("streams sequential HTTP chunks", async () => {
    const { provider } = setup([new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.enqueue(new Uint8Array([2])); c.close(); } }))]);
    const data = [];
    for await (const chunk of provider.synthesizeStream!(request)) data.push(...chunk.audio);
    expect(data).toEqual([1, 2]);
  });

  it("requires consent before making cloning calls", async () => {
    const { fetch, provider } = setup([]);
    await expect(provider.cloneVoice!({ name: "Person", samples: [] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads separate consent and samples, polls consent, then resolves the personal job", async () => {
    const { fetch, provider } = setup([Response.json({ id: "project" }), Response.json({ status: "Running" }), Response.json({ status: "Succeeded" }), Response.json({ id: "job", status: "Running" }), Response.json({ id: "job", status: "Succeeded", speakerProfileId: "profile" })]);
    const sample = { data: new Uint8Array([1, 2]), mimeType: "audio/wav" };
    const result = await provider.cloneVoice!({ name: "Person", language: "en-US", samples: [sample], consent: { attested: true }, providerOptions: { projectId: "project", consentId: "consent", personalVoiceId: "job", companyName: "Example", consentAudio: sample, pollIntervalMs: 0 } });
    expect(result).toMatchObject({ status: "training", jobId: "job", voice: { providerVoiceId: "personal-job:job" } });
    expect(fetch.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ kind: "PersonalVoice" });
    expect(fetch.mock.calls[1][1]?.method).toBe("POST");
    const form = fetch.mock.calls[1][1]?.body as FormData;
    expect(form.get("companyName")).toBe("Example");
    expect(form.get("audiodata")).toBeInstanceOf(Blob);
    expect((fetch.mock.calls[3][1]?.body as FormData).get("consentId")).toBe("consent");
    expect(await provider.getVoice!(result.voice.providerVoiceId)).toMatchObject({ providerVoiceId: "personal:profile", raw: { status: "Succeeded" } });
  });

  it("uses PUT for hosted consent and reference audio assets", async () => {
    const { fetch, provider } = setup([Response.json({}), Response.json({ status: "Succeeded" }), Response.json({ id: "voice", speakerProfileId: "profile", status: "Succeeded" })], { credentials: { apiKey: "key", endpoint: "https://custom.test" } });
    const result = await provider.cloneVoice!({ name: "Person", language: "es-ES", samples: [], consent: { attested: true }, providerOptions: {
      companyName: "Company", projectId: "project", consentId: "consent", personalVoiceId: "voice", consentAudioUrl: "https://blob.test/consent.wav",
      audios: { containerUrl: "https://blob.test/references", extensions: [".wav"] },
    } });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["PUT", "PUT", "PUT"]);
    expect(fetch.mock.calls[0][0]).toBe("https://custom.test/customvoice/projects/project?api-version=2024-02-01-preview");
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string).audioUrl).toBe("https://blob.test/consent.wav");
    expect(result).toMatchObject({ status: "ready", voice: { providerVoiceId: "personal:profile" } });
  });

  it("does not train when recorded consent verification fails", async () => {
    const { fetch, provider } = setup([Response.json({}), Response.json({ status: "Failed" })]);
    const sample = { data: new Uint8Array([1]), mimeType: "audio/wav" };
    await expect(provider.cloneVoice!({ name: "Person", language: "en-US", samples: [sample], consent: { attested: true }, providerOptions: { companyName: "Company", consentAudio: sample, pollIntervalMs: 0 } })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("embeds personal profiles in caller SSML and refuses pending job IDs", async () => {
    const { fetch, provider } = setup([new Response("audio")]);
    await provider.synthesize({ ...request, ssml: true, text: '<speak><voice name="old">Hi</voice></speak>', voice: { provider: "azure", voiceId: "personal:profile" } });
    expect(fetch.mock.calls[0][1]?.body).toContain('xmlns:mstts="https://www.w3.org/2001/mstts"');
    expect(fetch.mock.calls[0][1]?.body).toContain('<mstts:ttsembedding speakerProfileId="profile">Hi</mstts:ttsembedding>');
    await expect(provider.synthesize({ ...request, voice: { provider: "azure", voiceId: "personal-job:job" } })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves catalog auth failures and exposes transient fallback", async () => {
    const { provider } = setup([new Response("offline", { status: 503 }), new Response("bad key", { status: 401 })]);
    expect(await provider.listVoices()).toHaveLength(30);
    await expect(provider.listVoices()).rejects.toMatchObject({ code: "auth" });
  });

  it("rejects unsupported containers and honors body deadlines", async () => {
    const { fetch, provider } = setup([new Response(new ReadableStream())], { timeoutMs: 10 });
    await expect(provider.synthesize({ ...request, format: { container: "flac" } })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "timeout" });
  });
});
