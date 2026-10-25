import { describe, expect, it, vi } from "vitest";
import type { ProviderContext, SynthesisRequest, VoiceRef } from "../../src/core/types.js";
import { createMinimaxProvider, MINIMAX_MODELS, minimaxProvider } from "../../src/providers/minimax/index.js";

const request: SynthesisRequest & { voice: VoiceRef } = { text: "Hola mundo", voice: { provider: "minimax", voiceId: "Spanish_SereneWoman" } };
const sample = { data: new Uint8Array([0, 128, 255]), mimeType: "audio/wav", fileName: "voice.wav" };
const ok = { base_resp: { status_code: 0, status_msg: "success" } };
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const audioResponse = () => response({ ...ok, data: { audio: "00aAFF", status: 2 }, extra_info: { audio_length: 1234, audio_sample_rate: 24000, usage_characters: 11 }, trace_id: "trace-1" });
function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>, extras: Partial<ProviderContext> = {}) {
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => responder(String(url), init ?? {}));
  const ctx: ProviderContext = { credentials: { apiKey: "test-key", groupId: "group +1" }, fetch: fetch as typeof globalThis.fetch, ...extras };
  return { fetch, ctx, provider: createMinimaxProvider(ctx) };
}
function sse(text: string, size = 3) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size)); controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
}
async function collect(provider: ReturnType<typeof createMinimaxProvider>, overrides: Partial<typeof request> = {}) {
  const results = [];
  for await (const chunk of provider.synthesizeStream!({ ...request, ...overrides })) results.push(chunk);
  return results;
}

describe("MiniMax", () => {
  it("registers credentials and the six requested model ids", async () => {
    const { provider } = setup(() => response(ok));
    expect(minimaxProvider.requiredCredentials).toEqual(["apiKey"]);
    expect(minimaxProvider.credentialEnv.groupId).toEqual(["MINIMAX_GROUP_ID"]);
    expect(MINIMAX_MODELS.map(model => model.id)).toEqual(["speech-2.5-hd-preview", "speech-2.5-turbo-preview", "speech-02-hd", "speech-02-turbo", "speech-01-hd", "speech-01-turbo"]);
    expect(provider.defaultModel()).toBe("speech-02-hd");
    expect(provider.defaultModel({ tier: "fast" })).toBe("speech-02-turbo");
    expect((await provider.listModels())[2].languages.length).toBeGreaterThan(30);
  });

  it("maps settings, language, pronunciation, format, group id, hex, and usage", async () => {
    const { provider, fetch } = setup(audioResponse, { baseUrl: "https://api.minimaxi.com" });
    const result = await provider.synthesize({ ...request, model: "speech-02-hd", language: "es-ES",
      format: { container: "mp3", bitrate: 128, sampleRate: 24000, channels: 2 },
      settings: { speed: 4, pitch: -15, volume: 20, emotion: "excited", stability: 0.9, seed: 1 },
      pronunciation: [{ grapheme: "word", phoneme: "wɜːd" }, { grapheme: "Dr.", alias: "Doctor" }] });
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).origin).toBe("https://api.minimaxi.com");
    expect(new URL(String(url)).searchParams.get("GroupId")).toBe("group +1");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key");
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ model: "speech-02-hd", text: "Hola mundo", stream: false, output_format: "hex",
      voice_setting: { voice_id: "Spanish_SereneWoman", speed: 2, pitch: -12, vol: 10, emotion: "happy" },
      audio_setting: { format: "mp3", bitrate: 128000, sample_rate: 24000, channel: 2 },
      pronunciation_dict: { tone: ["word/(wɜːd)", "Dr./(Doctor)"] }, language_boost: "Spanish", subtitle_enable: false });
    expect(body.voice_setting.seed).toBeUndefined();
    expect(result.audio).toMatchObject({ data: new Uint8Array([0, 170, 255]), durationMs: 1234, mimeType: "audio/mpeg", format: { sampleRate: 24000 } });
    expect(result.usage).toMatchObject({ unit: "character", units: 11, estimatedCents: 0.11, requestId: "trace-1" });
  });

  it.each([["wav", "audio/wav"], ["pcm", "audio/pcm"], ["flac", "audio/flac"]] as const)("maps %s and preserves neutral volume", async (container, mime) => {
    const { provider, fetch } = setup(audioResponse);
    const result = await provider.synthesize({ ...request, language: "yue-HK", format: { container, sampleRate: 8000 }, settings: { volume: 0, emotion: "whisper", speed: 0.25 } });
    expect(result.audio.mimeType).toBe(mime);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ audio_setting: { format: container, sample_rate: 8000 },
      voice_setting: { vol: 1, speed: 0.5, emotion: "neutral" }, language_boost: "Chinese,Yue" });
  });

  it("passes native options while preserving mapped fields and optional GroupId", async () => {
    const { provider, fetch } = setup(audioResponse, { credentials: { apiKey: "test" } });
    await provider.synthesize({ ...request, settings: { volume: -20 }, providerOptions: { voice_setting: { text_normalization: true }, language_boost: "Japanese" } });
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.has("GroupId")).toBe(false);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ voice_setting: { vol: 0.1, text_normalization: true }, language_boost: "Japanese" });
  });

  it("fetches signed subtitle JSON without forwarding credentials", async () => {
    const { provider, fetch } = setup(url => url.startsWith("https://cdn.test/")
      ? response([{ text: "Hola mundo", time_begin: 0, time_end: 1000, timestamped_words: [{ word: "Hola", start: 0, end: 400 }, { word: "mundo", start: 400, end: 1000 }] }])
      : response({ ...ok, data: { audio: "00" }, subtitle_file: "https://cdn.test/subtitles?signature=abc" }));
    const result = await provider.synthesize({ ...request, timestamps: true });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ subtitle_enable: true, subtitle_type: "word" });
    expect(result.timestamps).toEqual([{ text: "Hola", startMs: 0, endMs: 400 }, { text: "mundo", startMs: 400, endMs: 1000 }]);
    expect(fetch.mock.calls[1][0]).toBe("https://cdn.test/subtitles?signature=abc");
    expect(new Headers(fetch.mock.calls[1][1]?.headers).has("Authorization")).toBe(false);
  });

  it("parses arbitrarily split SSE lines, unicode, CRLF, final lines and DONE", async () => {
    const wire = `: ping\r\nevent: message\r\ndata: ${JSON.stringify({ ...ok, data: { audio: "00ff", status: 1, subtitle: [{ text: "世界", time_begin: 0, time_end: 100 }] } })}\r\n\r\ndata: ${JSON.stringify({ ...ok, data: { audio: "aabb", status: 2 } })}\n\ndata: [DONE]\n\n`;
    const { provider, fetch } = setup(() => sse(wire, 1));
    const result = await collect(provider, { timestamps: true });
    expect(result.map(chunk => [...chunk.audio])).toEqual([[0, 255], [170, 187]]);
    expect(result[0].timestamps).toEqual([{ text: "世界", startMs: 0, endMs: 100 }]);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ stream: true, stream_options: { exclude_aggregated_audio: true } });
    const final = setup(() => sse(`data: ${JSON.stringify({ ...ok, data: { audio: "ab" } })}`));
    expect((await collect(final.provider))[0].audio).toEqual(new Uint8Array([171]));
  });

  it("normalizes system, cloned, and designed voices and filters languages", async () => {
    const { provider, fetch } = setup(() => response({ ...ok,
      system_voice: [{ voice_id: "English_expressive_narrator", voice_name: "Narrator", description: ["male", "young", "narration"] }],
      voice_cloning: [{ voice_id: "Spanish_custom", voice_name: "Ana", description: "mature female" }],
      voice_generation: [{ voice_id: "my-design", voice_name: "Robot", description: "neutral" }] }));
    const voices = await provider.listVoices();
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ voice_type: "all" });
    expect(voices[0]).toMatchObject({ id: "minimax:English_expressive_narrator", languages: ["en"], gender: "male", age: "young", origin: "premade", tags: ["male", "young", "narration"] });
    expect(voices[1]).toMatchObject({ languages: ["es"], gender: "female", age: "middle_aged", origin: "cloned" });
    expect(voices[2].origin).toBe("designed");
    expect((await provider.listVoices({ language: "es-ES", gender: "female" }))).toHaveLength(1);
  });

  it("falls back to system voices when catalog fails but keeps health errors visible", async () => {
    const warn = vi.fn();
    const { provider } = setup(() => response({ message: "unavailable" }, 503), { logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() } });
    expect((await provider.listVoices({ language: "en" })).map(voice => voice.providerVoiceId)).toContain("English_expressive_narrator");
    expect(warn).toHaveBeenCalledOnce();
    await expect(provider.healthcheck!()).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("enforces consent and caller ids before multipart upload, then clones", async () => {
    const { provider, fetch } = setup(url => response(url.includes("files/upload") ? { ...ok, file: { file_id: 42 } } : ok));
    const clone = { name: "Ana", samples: [sample] };
    await expect(provider.cloneVoice!(clone)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(provider.cloneVoice!({ ...clone, consent: { attested: true }, providerOptions: { voice_id: "bad" } })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
    const result = await provider.cloneVoice!({ ...clone, consent: { attested: true }, denoise: true, language: "es", providerOptions: {
      voice_id: "Ana-voice1", text: "Hola", model: "speech-02-turbo", accuracy: 0.9, need_volume_normalization: false } });
    const form = fetch.mock.calls[0][1]?.body as FormData;
    expect(form.get("purpose")).toBe("voice_clone");
    const file = form.get("file") as File;
    expect(file.name).toBe("voice.wav");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(sample.data);
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toMatchObject({ file_id: 42, voice_id: "Ana-voice1", text: "Hola",
      model: "speech-02-turbo", need_noise_reduction: true, need_volume_normalization: false, accuracy: 0.9 });
    expect(result).toMatchObject({ status: "ready", voice: { providerVoiceId: "Ana-voice1", name: "Ana", origin: "cloned", languages: ["es"] } });
    fetch.mock.calls.forEach(([url]) => expect(new URL(String(url)).searchParams.get("GroupId")).toBe("group +1"));
  });

  it("generates a valid clone id and deletes the clone", async () => {
    const { provider, fetch } = setup(url => response(url.includes("files/upload") ? { ...ok, file: { file_id: "42" } } : ok));
    const result = await provider.cloneVoice!({ name: "123 日本語!", samples: [sample], consent: { attested: true } });
    expect(result.voice.providerVoiceId).toMatch(/^[A-Za-z][A-Za-z0-9-]{7,}$/);
    await provider.deleteVoice!(result.voice.providerVoiceId);
    expect(JSON.parse(fetch.mock.calls[2][1]?.body as string)).toEqual({ voice_type: "voice_cloning", voice_id: result.voice.providerVoiceId });
  });

  it("designs one already-persisted candidate and saves without another API call", async () => {
    const { provider, fetch } = setup(() => response({ ...ok, voice_id: "designed-voice", trial_audio: "00fF" }));
    const result = await provider.designVoice!({ prompt: "A warm narrator", text: "Welcome", candidates: 3 });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ prompt: "A warm narrator", preview_text: "Welcome" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ candidateId: "designed-voice", preview: { data: new Uint8Array([0, 255]), mimeType: "audio/mpeg" } });
    expect(await provider.saveDesignedVoice!("designed-voice", "Narrator")).toMatchObject({ name: "Narrator", origin: "designed", raw: { already_persisted: true } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([[1002, "rate_limit", true], [1004, "auth", false], [1008, "quota_exceeded", false], [2013, "invalid_request", false],
    [1039, "invalid_request", false], [2037, "content_policy", false], [2038, "content_policy", false]] as const)("maps HTTP-200 base_resp error %s", async (statusCode, code, retryable) => {
    const { provider } = setup(() => response({ base_resp: { status_code: statusCode, status_msg: "API failure" } }, 200, { "Retry-After": "3" }));
    await expect(provider.synthesize(request)).rejects.toMatchObject({ name: "VoiceEngineError", provider: "minimax", status: 200, message: "API failure", code, retryable, retryAfterMs: 3000 });
  });

  it.each([[401, "auth"], [402, "quota_exceeded"], [429, "rate_limit"], [503, "provider_unavailable"]] as const)("maps HTTP %s", async (status, code) => {
    const { provider } = setup(() => response({ message: "failure" }, status));
    await expect(provider.synthesize(request)).rejects.toMatchObject({ status, code });
  });

  it("surfaces streaming provider errors and rejects invalid hex and malformed SSE", async () => {
    const failed = setup(() => sse(`data: ${JSON.stringify({ base_resp: { status_code: 1008, status_msg: "No credits" } })}\n\n`));
    await expect(collect(failed.provider)).rejects.toMatchObject({ code: "quota_exceeded", status: 200 });
    for (const audio of ["a", "zz", null]) {
      const malformed = setup(() => response({ ...ok, data: { audio } }));
      await expect(malformed.provider.synthesize(request)).rejects.toMatchObject({ code: "provider_unavailable" });
    }
    const broken = setup(() => sse("data: {invalid}\n\n"));
    await expect(collect(broken.provider)).rejects.toMatchObject({ code: "provider_unavailable" });
    const plainJson = setup(() => sse(JSON.stringify({ base_resp: { status_code: 1004, status_msg: "bad key" } }, null, 2)));
    await expect(collect(plainJson.provider)).rejects.toMatchObject({ code: "auth", status: 200 });
  });

  it("rejects unsupported formats and sample rates", async () => {
    const { provider, fetch } = setup(audioResponse);
    await expect(provider.synthesize({ ...request, format: { container: "opus" } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(provider.synthesize({ ...request, format: { container: "pcm", sampleRate: 48000 } })).rejects.toMatchObject({ code: "unsupported" });
    await expect(collect(provider, { format: { container: "wav" } })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors aborted requests and midstream timeout and cancels early readers", async () => {
    const controller = new AbortController(); controller.abort();
    const { provider, fetch } = setup(audioResponse);
    await expect(provider.synthesize({ ...request, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
    const stalled = setup(() => new Response(new ReadableStream()), { timeoutMs: 5 });
    await expect(collect(stalled.provider)).rejects.toMatchObject({ code: "timeout" });
    const cancel = vi.fn();
    const early = setup(() => new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('data: {"data":{"audio":"00"}}\n\n')); }, cancel })));
    for await (const _ of early.provider.synthesizeStream!(request)) break;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
