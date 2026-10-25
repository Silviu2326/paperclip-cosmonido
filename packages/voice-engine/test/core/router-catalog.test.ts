import { afterEach, describe, expect, it, vi } from "vitest";
import { filterVoices, parseEngineVoiceId, rankVoices, toEngineVoiceId, VoiceCatalog } from "../../src/core/catalog.js";
import { VoiceEngineError } from "../../src/core/errors.js";
import { DEFAULT_ROUTING, planRoute, withRetry } from "../../src/core/router.js";
import type { SynthesisRequest } from "../../src/core/types.js";
import { fakeProvider, fakeVoice } from "./fakes.js";

afterEach(() => vi.useRealTimers());
const request: SynthesisRequest = { text: "Hola", voice: "elevenlabs:voice", language: "es-MX", format: { container: "mp3" } };

describe("routing", () => {
  it("orders language overrides before general preferences", () => {
    const candidates = ["openai", "fish-audio", "elevenlabs"].map((id) => fakeProvider({ id }).provider);
    expect(planRoute(request, DEFAULT_ROUTING, candidates).map((route) => route.providerId)).toEqual(["elevenlabs", "openai", "fish-audio"]);
    expect(planRoute({ ...request, language: "ja-JP" }, DEFAULT_ROUTING, candidates).map((route) => route.providerId)).toEqual(["fish-audio", "elevenlabs", "openai"]);
    expect(planRoute(request, { preferred: ["openai"], byLanguage: { "es-MX": ["fish-audio"] } }, candidates)[0].providerId).toBe("fish-audio");
  });
  it("filters synthesis, timestamps, SSML, formats, languages and limits", () => {
    const checks = [
      { synthesize: false }, { timestamps: false }, { ssml: false }, { formats: ["wav"] as const }, { languages: ["ja"] }, { maxInputChars: 2 },
    ];
    for (const capabilities of checks) {
      const candidate = fakeProvider({ capabilities: { timestamps: true, ssml: true, ...capabilities, formats: capabilities.formats ? [...capabilities.formats] : ["mp3"] } });
      expect(planRoute({ ...request, timestamps: true, ssml: true }, {}, [candidate.provider])).toEqual([]);
    }
    expect(planRoute({ ...request, streaming: true }, {}, [fakeProvider().provider])).toEqual([]);
  });
  it("chooses a compatible model in the requested tier", () => {
    const fake = fakeProvider();
    const fast = { ...fake.models[0], id: "fast", tier: "fast" as const };
    expect(planRoute(request, { tier: "fast" }, [{ provider: fake.provider, models: [...fake.models, fast] }])).toEqual([{ providerId: "fake", model: "fast" }]);
    expect(planRoute({ ...request, model: "missing" }, {}, [{ provider: fake.provider, models: fake.models }])).toEqual([]);
  });
  it("honors Retry-After even above the normal delay cap", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new VoiceEngineError("Busy", { code: "rate_limit", retryAfterMs: 2000 })).mockResolvedValue("ok");
    const pending = withRetry(fn, { attempts: 3, baseDelayMs: 10, maxDelayMs: 50 });
    await vi.advanceTimersByTimeAsync(1999); expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(await pending).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("aborts retry waits and pending attempts without invoking another call", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new VoiceEngineError("Busy", { code: "rate_limit" }));
    const promise = withRetry(fn, { attempts: 3, baseDelayMs: 100, maxDelayMs: 100 }, { signal: controller.signal });
    const rejected = expect(promise).rejects.toMatchObject({ code: "aborted" });
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await rejected;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const pendingController = new AbortController();
    const pending = withRetry(() => new Promise(() => undefined), { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, { signal: pendingController.signal });
    const pendingRejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
    pendingController.abort(); await pendingRejected;
  });
  it("does not retry permanent errors and respects attempt limits", async () => {
    const permanent = vi.fn().mockRejectedValue(new VoiceEngineError("bad key", { code: "auth" }));
    await expect(withRetry(permanent, { attempts: 3, baseDelayMs: 0, maxDelayMs: 0 })).rejects.toMatchObject({ code: "auth" });
    expect(permanent).toHaveBeenCalledTimes(1);
    const transient = vi.fn().mockRejectedValue(new VoiceEngineError("busy", { code: "provider_unavailable" }));
    await expect(withRetry(transient, { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 })).rejects.toThrow("busy");
    expect(transient).toHaveBeenCalledTimes(2);
  });
});

describe("voice catalog", () => {
  it("parses voice identifiers and filters all query dimensions", () => {
    expect(parseEngineVoiceId("fake:namespace:voice")).toEqual({ provider: "fake", voiceId: "namespace:voice" });
    expect(toEngineVoiceId({ provider: "fake", voiceId: "voice" })).toBe("fake:voice");
    expect(() => parseEngineVoiceId("voice")).toThrow("provider:voiceId");
    const voices = [fakeVoice("a"), fakeVoice("b", { languages: ["ja-JP"], gender: "male", tags: ["ads"], origin: "cloned" })];
    expect(filterVoices(voices, { provider: "a", language: "es-MX", gender: "female", age: "middle_aged", tags: ["ads", "narration"], origin: ["premade"], search: "TEST", limit: 1 })).toEqual([voices[0]]);
    expect(filterVoices(voices, { limit: 0 })).toEqual([]);
  });
  it("ranks exact regional voices above primary matches and multilingual voices before limiting", () => {
    const voices = [fakeVoice("multi", { languages: [], tags: ["flagship"] }), fakeVoice("primary", { languages: ["es-ES"] }), fakeVoice("exact", { languages: ["es-MX"], origin: "cloned" })];
    expect(rankVoices(voices, { language: "es-MX" }).map((voice) => voice.provider)).toEqual(["exact", "primary", "multi"]);
    expect(rankVoices(voices, { language: "es-MX", limit: 1 })[0].provider).toBe("exact");
  });
  it("caches full provider lists, expires entries and tolerates partial failures", async () => {
    vi.useFakeTimers();
    const good = fakeProvider({ id: "good" }), bad = fakeProvider({ id: "bad" });
    bad.provider.listVoices = async () => { throw new Error("offline"); };
    const warn = vi.fn();
    const catalog = new VoiceCatalog({ availableProviders: async () => ["good", "bad"], provider: async (id) => id === "good" ? good.provider : bad.provider }, { ttlMs: 100, logger: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() } });
    expect(await catalog.list({ language: "ja" })).toEqual([]);
    expect(await catalog.list({ language: "es" })).toHaveLength(1);
    expect(good.voiceLists).toBe(1); expect(warn).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await catalog.list(); expect(good.voiceLists).toBe(2);
  });
});
