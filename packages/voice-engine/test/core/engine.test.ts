import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceEngine } from "../../src/core/engine.js";
import { MemoryCacheStore } from "../../src/core/cache.js";
import { StaticCredentialResolver } from "../../src/core/credentials.js";
import { VoiceEngineError } from "../../src/core/errors.js";
import { chunkText } from "../../src/core/text.js";
import type { EngineEvent, SynthesisRequest } from "../../src/core/types.js";
import { fakeProvider, fakeVoice } from "./fakes.js";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const request: SynthesisRequest = { text: "Hola mundo.", voice: "fake:voice", language: "es-ES" };

describe("engine synthesis", () => {
  it("caches the second call, emits ordered events and isolates listener errors", async () => {
    const fake = fakeProvider(), engine = createVoiceEngine({ providers: [fake.definition], scope: { companyId: "company", agentId: "agent" } });
    const events: EngineEvent[] = [];
    engine.on(() => { throw new Error("observer failure"); });
    engine.on(async () => { throw new Error("async observer failure"); });
    const unsubscribe = engine.on((event) => events.push(event));
    const first = await engine.synthesize(request), second = await engine.synthesize(request);
    expect(first.cached).toBe(false); expect(first.latencyMs).toBeGreaterThanOrEqual(0);
    expect(second.cached).toBe(true); expect(second.audio).toEqual(first.audio);
    expect(second.usage).toMatchObject({ units: 0, estimatedCents: 0 });
    expect(fake.calls).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual(["cache.miss", "synthesis.start", "synthesis.complete", "usage", "cache.hit"]);
    expect(events[3]).toMatchObject({ type: "usage", usage: first.usage, scope: { companyId: "company", agentId: "agent" } });
    unsubscribe(); await engine.synthesize(request); expect(events).toHaveLength(5);
  });
  it("reports missing credentials with environment names and propagates company scope", async () => {
    const fake = fakeProvider({ requiredCredentials: ["apiKey"] });
    const resolve = vi.fn().mockResolvedValue(undefined);
    const engine = createVoiceEngine({ providers: [fake.definition], credentials: { resolve }, scope: { companyId: "tenant" } });
    await expect(engine.provider("fake")).rejects.toMatchObject({ code: "auth", message: expect.stringContaining("VOICE_TEST_PRIMARY or VOICE_TEST_SECONDARY") });
    expect(await engine.availableProviders()).toEqual([]);
    expect(resolve).toHaveBeenCalledWith("fake", { companyId: "tenant" });
    expect(fake.contexts).toHaveLength(0);
  });
  it("uses environment credentials by default and injects fetch and timeout", async () => {
    vi.stubEnv("VOICE_TEST_PRIMARY", "test-key");
    const fake = fakeProvider({ requiredCredentials: ["apiKey"] }), fetch = vi.fn();
    const engine = createVoiceEngine({ providers: [fake.definition], fetch, timeoutMs: 1234 });
    expect(await engine.availableProviders()).toEqual(["fake"]);
    expect(await engine.provider("fake")).toBe(await engine.provider("fake"));
    expect(fake.contexts[0]).toMatchObject({ credentials: { apiKey: "test-key" }, fetch, timeoutMs: 1234 });
    expect(createVoiceEngine().providers()).toEqual([]);
  });
  it("separates shared-cache entries by company and credential account", async () => {
    const fake = fakeProvider(), cache = new MemoryCacheStore();
    const make = (companyId: string, apiKey: string) => createVoiceEngine({ providers: [fake.definition], cache, scope: { companyId }, credentials: new StaticCredentialResolver({ fake: { apiKey } }) });
    await make("a", "first").synthesize(request);
    expect((await make("b", "first").synthesize(request)).cached).toBe(false);
    expect((await make("a", "second").synthesize(request)).cached).toBe(false);
    expect((await make("a", "first").synthesize(request)).cached).toBe(true);
    expect(fake.calls).toHaveLength(3);
  });
  it("retries transient errors without changing a bound voice", async () => {
    const fake = fakeProvider({ synthesize: async () => { throw new VoiceEngineError("busy", { code: "provider_unavailable" }); } });
    const other = fakeProvider({ id: "other" });
    const engine = createVoiceEngine({ providers: [fake.definition, other.definition], retry: { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 } });
    const events: EngineEvent[] = []; engine.on((event) => events.push(event));
    await expect(engine.synthesize({ ...request, voice: { provider: "fake", voiceId: "voice" } })).rejects.toThrow("busy");
    expect(fake.calls).toHaveLength(2); expect(other.calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: "synthesis.error", willFallback: false });
  });
  it("opts into a compatible fallback voice after retryable failure", async () => {
    const fake = fakeProvider({ synthesize: async () => { throw new VoiceEngineError("busy", { code: "rate_limit" }); } });
    const other = fakeProvider({ id: "other" });
    const engine = createVoiceEngine({ providers: [fake.definition, other.definition], retry: { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, routing: { fallback: true, preferred: ["other"] } });
    const events: EngineEvent[] = []; engine.on((event) => events.push(event));
    const result = await engine.synthesize({ ...request, model: "source-only", providerOptions: { allowFallbackVoice: true } });
    expect(result.provider).toBe("other"); expect(result.voice.provider).toBe("other");
    expect(other.calls[0].model).toBe("test-model");
    expect(other.calls[0].providerOptions?.allowFallbackVoice).toBeUndefined();
    expect(events.find((event) => event.type === "synthesis.error")).toMatchObject({ willFallback: true });
  });
  it("validates input limits and capabilities and strips unsupported SSML", async () => {
    const fake = fakeProvider({ capabilities: { maxInputChars: 10 } }), engine = createVoiceEngine({ providers: [fake.definition] });
    await expect(engine.synthesize(request)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(engine.synthesize({ ...request, text: "hi", format: { container: "flac" } })).rejects.toMatchObject({ code: "unsupported" });
    await engine.synthesize({ ...request, text: "<speak>Hola</speak>", ssml: true });
    expect(fake.calls[0].text).toBe("Hola"); expect(fake.calls[0].ssml).toBe(false);
  });
  it("returns timeout for providers that ignore AbortSignal", async () => {
    const fake = fakeProvider({ synthesize: async () => new Promise(() => undefined) });
    const engine = createVoiceEngine({ providers: [fake.definition], timeoutMs: 10, retry: { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 } });
    await expect(engine.synthesize(request)).rejects.toMatchObject({ code: "timeout" });
  });
  it("aborts before synthesis without hitting the provider", async () => {
    const fake = fakeProvider(), engine = createVoiceEngine({ providers: [fake.definition] });
    const controller = new AbortController(); controller.abort();
    await expect(engine.synthesize({ ...request, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("long and streaming synthesis", () => {
  it("chunks, concatenates in order, passes context and merges timestamps and usage", async () => {
    const text = "Hola mundo. Otra frase. Fin del texto.";
    const chunks = chunkText(text, 14, { preferParagraphs: true });
    const fake = fakeProvider({ capabilities: { maxInputChars: 14 } }), engine = createVoiceEngine({ providers: [fake.definition] });
    const result = await engine.synthesizeLong({ ...request, text, timestamps: true, idempotencyKey: "long", context: { previousText: "Before", nextText: "After" } }, { concurrency: 2 });
    expect(fake.calls).toHaveLength(chunks.length);
    expect(new TextDecoder().decode(result.audio.data)).toBe(chunks.join(""));
    expect(fake.calls[0].context).toEqual({ previousText: "Before", nextText: chunks[1] });
    expect(fake.calls[1].context?.previousText).toBe(chunks[0]);
    expect(fake.calls.at(-1)?.context?.nextText).toBe("After");
    expect(new Set(fake.calls.map((call) => call.idempotencyKey)).size).toBe(chunks.length);
    expect(result.timestamps?.[1].startMs).toBe(chunks[0].length * 100);
    expect(result.usage.units).toBe(chunks.join("").length);
    expect(result.usage.estimatedCents).toBeCloseTo(chunks.join("").length * 0.002);
    expect((await engine.synthesizeLong({ ...request, text, timestamps: true, idempotencyKey: "long", context: { previousText: "Before", nextText: "After" } }, { concurrency: 2 })).cached).toBe(true);
  });
  it("bounds concurrency and preserves order when calls finish out of order", async () => {
    vi.useFakeTimers();
    let active = 0, maximum = 0;
    const fake = fakeProvider({ synthesize: async (call, index) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, index === 1 ? 30 : 5)); active--;
      return fake.result(call);
    } });
    const engine = createVoiceEngine({ providers: [fake.definition], cache: false });
    const pending = engine.synthesizeLong({ ...request, text: "One. Two. Three. Four." }, { maxChunkChars: 6, concurrency: 2 });
    await vi.runAllTimersAsync();
    expect(new TextDecoder().decode((await pending).audio.data)).toBe("One.Two.Three.Four.");
    expect(maximum).toBe(2); expect(active).toBe(0);
  });
  it("uses one streamed chunk when the provider lacks native streaming", async () => {
    const fake = fakeProvider(), engine = createVoiceEngine({ providers: [fake.definition] });
    const chunks = [];
    for await (const chunk of engine.synthesizeStream(request)) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(new TextDecoder().decode(chunks[0].audio)).toBe(request.text);
    expect(fake.calls).toHaveLength(1);
  });
  it("passes native chunks through and cancels upstream when a consumer stops", async () => {
    const fake = fakeProvider({ capabilities: { streaming: true } });
    let signal: AbortSignal | undefined, closed = false;
    fake.provider.synthesizeStream = async function* (call) {
      signal = call.signal;
      try { yield { audio: Uint8Array.of(1) }; yield { audio: Uint8Array.of(2) }; }
      finally { closed = true; }
    };
    const engine = createVoiceEngine({ providers: [fake.definition] });
    for await (const chunk of engine.synthesizeStream(request)) { expect(chunk.audio).toEqual(Uint8Array.of(1)); break; }
    await Promise.resolve();
    expect(signal?.aborted).toBe(true); expect(closed).toBe(true); expect(fake.calls).toHaveLength(0);
  });
});

describe("catalog, pricing and optional operations", () => {
  it("recommends the best regional voice and estimates cents from model pricing", async () => {
    const fake = fakeProvider({ voices: [fakeVoice("fake", { providerVoiceId: "general", id: "fake:general", languages: [] }), fakeVoice("fake", { languages: ["es-MX"] })] });
    const engine = createVoiceEngine({ providers: [fake.definition] });
    expect((await engine.recommendVoice({ language: "es-MX" }))?.id).toBe("fake:voice");
    expect((await engine.getVoice("fake:voice"))?.languages).toEqual(["es-MX"]);
    expect(await engine.estimateCost({ ...request, text: "a".repeat(1000) })).toMatchObject({ units: 1000, estimatedCents: 2 });
    expect((await engine.estimateCost({ ...request, model: "unknown" })).estimatedCents).toBeNull();
  });
  it("delegates optional operations, invalidates catalog and emits clone events", async () => {
    const fake = fakeProvider(), voice = fakeVoice();
    const clone = vi.fn().mockResolvedValue({ voice, status: "ready" });
    fake.provider.cloneVoice = clone;
    fake.provider.updateVoice = vi.fn().mockResolvedValue({ ...voice, name: "Updated" });
    fake.provider.deleteVoice = vi.fn().mockResolvedValue(undefined);
    fake.provider.designVoice = vi.fn().mockResolvedValue({ candidates: [] });
    fake.provider.saveDesignedVoice = vi.fn().mockResolvedValue(voice);
    fake.provider.speechToSpeech = vi.fn().mockResolvedValue(fake.result({ ...request, voice: { provider: "fake", voiceId: "voice" } }));
    const engine = createVoiceEngine({ providers: [fake.definition] }), events: EngineEvent[] = [];
    engine.on((event) => events.push(event)); await engine.listVoices();
    await engine.cloneVoice("fake", { name: "Clone", samples: [] });
    expect(clone).toHaveBeenCalledWith(expect.objectContaining({ name: "Clone", signal: expect.any(AbortSignal) }));
    expect(events[0]).toMatchObject({ type: "clone.complete", voice });
    await engine.listVoices(); expect(fake.voiceLists).toBe(2);
    expect((await engine.updateVoice("fake:voice", { name: "Updated" })).name).toBe("Updated");
    await engine.deleteVoice("fake:voice");
    expect(await engine.designVoice("fake", { prompt: "warm" })).toEqual({ candidates: [] });
    expect(await engine.saveDesignedVoice("fake", "candidate", "new")).toEqual(voice);
    await engine.speechToSpeech({ voice: "fake:voice", audio: { data: Uint8Array.of(1), mimeType: "audio/wav" } });
    expect(events.at(-1)?.type).toBe("usage");
  });
  it("fails clearly for missing optional provider methods", async () => {
    const fake = fakeProvider(), engine = createVoiceEngine({ providers: [fake.definition] });
    await expect(engine.cloneVoice("fake", { name: "test", samples: [] })).rejects.toMatchObject({ code: "unsupported" });
    await expect(engine.updateVoice("fake:voice", {})).rejects.toMatchObject({ code: "unsupported" });
    await expect(engine.deleteVoice("fake:voice")).rejects.toMatchObject({ code: "unsupported" });
    await expect(engine.designVoice("fake", { prompt: "warm" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(engine.saveDesignedVoice("fake", "id", "name")).rejects.toMatchObject({ code: "unsupported" });
    await expect(engine.speechToSpeech({ voice: "fake:voice", audio: { data: new Uint8Array(), mimeType: "audio/wav" } })).rejects.toMatchObject({ code: "unsupported" });
  });
});
