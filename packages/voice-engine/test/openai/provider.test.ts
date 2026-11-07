import { describe, expect, it, vi } from "vitest";
import { createOpenAiProvider, OPENAI_MODELS, openAiProvider } from "../../src/providers/openai/index.js";
import type { ProviderContext, SynthesisRequest, VoiceRef } from "../../src/core/types.js";

const request: SynthesisRequest & { voice: VoiceRef } = { text: "Hola mundo", voice: { provider: "openai", voiceId: "coral" } };
function setup(responses: Response[], extra: Partial<ProviderContext> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => responses.shift()!);
  return { fetch, provider: createOpenAiProvider({ credentials: { apiKey: "test" }, fetch, ...extra }) };
}

describe("OpenAI Speech API", () => {
  it("maps instructions, headers, speed and character usage", async () => {
    const { fetch, provider } = setup([new Response(new Uint8Array([1, 2, 3]), { headers: { "x-request-id": "req1" } })], { credentials: { apiKey: "key", organization: "org", project: "project", baseUrl: "https://gateway.test/v1/" } });
    const result = await provider.synthesize({ ...request, language: "es-ES", settings: { speed: 1.2, emotion: "happy", style: 0.8, pitch: 2 }, providerOptions: { instructions: "Be concise." }, format: { container: "pcm" } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://gateway.test/v1/audio/speech");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer key", "OpenAI-Organization": "org", "OpenAI-Project": "project" });
    expect(JSON.parse(init?.body as string)).toEqual({ model: "gpt-4o-mini-tts", input: "Hola mundo", voice: "coral", response_format: "pcm", speed: 1.2, instructions: "Speak in Castilian Spanish. Use a happy tone. Use an expressiveness level of 0.8 on a 0 to 1 scale. Be concise." });
    expect(result.audio).toMatchObject({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/pcm", format: { container: "pcm", sampleRate: 24000, bitDepth: 16, channels: 1 } });
    expect(result.usage).toMatchObject({ unit: "character", units: 10, estimatedCents: 0.012, requestId: "req1" });
  });

  it.each(["tts-1", "tts-1-hd"])("never sends instructions to %s, and strips SSML", async model => {
    const { fetch, provider } = setup([new Response("audio")]);
    await provider.synthesize({ ...request, model, text: '<speak>A &amp; B</speak>', ssml: true, settings: { emotion: "sad", speed: 9 }, providerOptions: { instructions: "No", stream_format: "sse" } });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ model, input: "A & B", voice: "coral", response_format: "mp3", speed: 4 });
  });

  it("lists the 13 multilingual voices with filters and model restrictions", async () => {
    const { fetch, provider } = setup([]);
    expect(await provider.listVoices()).toHaveLength(13);
    const voices = await provider.listVoices({ language: "es-ES", search: "marin" });
    expect(voices[0]).toMatchObject({ id: "openai:marin", languages: [], models: ["gpt-4o-mini-tts"], origin: "premade" });
    expect(await provider.listVoices({ provider: "azure" })).toEqual([]);
    expect(await provider.listVoices({ limit: 0 })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(OPENAI_MODELS).toHaveLength(3);
    expect(openAiProvider.requiredCredentials).toEqual(["apiKey"]);
    expect(provider.defaultModel({ tier: "fast" })).toBe("tts-1");
  });

  it.each([ ["mp3", "audio/mpeg"], ["opus", "audio/ogg; codecs=opus"], ["aac", "audio/aac"], ["flac", "audio/flac"], ["wav", "audio/wav"] ] as const)("returns %s MIME", async (container, mimeType) => {
    const { provider } = setup([new Response("audio")]);
    expect((await provider.synthesize({ ...request, format: { container } })).audio.mimeType).toBe(mimeType);
  });

  it("rejects impossible PCM settings before fetching", async () => {
    const { fetch, provider } = setup([]);
    await expect(provider.synthesize({ ...request, format: { container: "pcm", sampleRate: 48000 } })).rejects.toMatchObject({ code: "unsupported", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([ [401, "invalid_api_key", "auth", false], [429, "insufficient_quota", "quota_exceeded", false], [429, "rate_limit_exceeded", "rate_limit", true], [503, "server_error", "provider_unavailable", true] ])("maps HTTP %s %s", async (status, errorCode, code, retryable) => {
    const { provider } = setup([Response.json({ error: { code: errorCode, message: "failure" } }, { status: Number(status), headers: { "retry-after": "2" } })]);
    await expect(provider.synthesize(request)).rejects.toMatchObject({ name: "VoiceEngineError", provider: "openai", status, code, retryable, retryAfterMs: 2000 });
  });

  it("streams chunks and cancels the body when the consumer stops", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.enqueue(new Uint8Array([2])); }, cancel }));
    const { provider } = setup([response]);
    const chunks = [];
    for await (const chunk of provider.synthesizeStream!(request)) { chunks.push(chunk); break; }
    expect(chunks).toEqual([{ audio: new Uint8Array([1]) }]);
    expect(cancel).toHaveBeenCalled();
  });

  it("maps network failures and prevents pre-aborted calls", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new TypeError("offline"); });
    const provider = createOpenAiProvider({ fetch, credentials: { apiKey: "key" } });
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    fetch.mockClear();
    await expect(provider.synthesize({ ...request, signal: AbortSignal.abort("stop") })).rejects.toMatchObject({ code: "aborted", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces deadlines while a response body stalls", async () => {
    const { provider } = setup([new Response(new ReadableStream())], { timeoutMs: 10 });
    await expect(provider.synthesize(request)).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("honors caller cancellation after response headers", async () => {
    const controller = new AbortController();
    const { provider } = setup([new Response(new ReadableStream())]);
    const pending = provider.synthesize({ ...request, signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: "aborted" });
    controller.abort();
    await assertion;
  });

  it("preserves gateway API-version query parameters", async () => {
    const { fetch, provider } = setup([new Response("audio")], { baseUrl: "https://gateway.test/deployment?api-version=preview" });
    await provider.synthesize(request);
    expect(fetch.mock.calls[0][0]).toBe("https://gateway.test/deployment/audio/speech?api-version=preview");
  });

  it("parses Retry-After dates and rejects missing credentials", async () => {
    const date = new Date(Date.now() + 30000).toUTCString();
    const { provider } = setup([new Response("slow down", { status: 429, headers: { "retry-after": date } })]);
    const error = await provider.synthesize(request).catch(e => e);
    expect(error.retryAfterMs).toBeGreaterThan(28000);
    expect(error.retryAfterMs).toBeLessThanOrEqual(30000);
    const missing = setup([], { credentials: {} });
    await expect(missing.provider.synthesize(request)).rejects.toMatchObject({ code: "auth" });
    expect(missing.fetch).not.toHaveBeenCalled();
  });

  it("enforces deadlines between streaming chunks", async () => {
    const { provider } = setup([new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); } }))], { timeoutMs: 15 });
    const stream = provider.synthesizeStream!(request)[Symbol.asyncIterator]();
    expect((await stream.next()).value?.audio).toEqual(new Uint8Array([1]));
    await expect(stream.next()).rejects.toMatchObject({ code: "timeout" });
  });
});
