import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileCacheStore, MemoryCacheStore, synthesisCacheKey } from "../../src/core/cache.js";
import { ChainCredentialResolver, EnvCredentialResolver, hasRequiredCredentials, StaticCredentialResolver } from "../../src/core/credentials.js";
import { ProviderRegistry } from "../../src/core/registry.js";
import { FileAudioStorage, MemoryAudioStorage } from "../../src/core/storage.js";
import type { CachedSynthesis, SynthesisRequest } from "../../src/core/types.js";
import { fakeProvider } from "./fakes.js";

afterEach(() => vi.useRealTimers());
const request: SynthesisRequest = { text: "Hola", voice: "fake:voice", language: "es-ES", settings: { speed: 1, stability: 0.5 } };
function cached(data = Uint8Array.of(1, 2)): CachedSynthesis {
  return { audio: { data, mimeType: "audio/mpeg", format: { container: "mp3" } }, provider: "fake", model: "model", voice: { provider: "fake", voiceId: "voice" }, createdAt: Date.now() };
}

describe("synthesis caching", () => {
  it("uses canonical key order and normalized text, language and voice", () => {
    const key = synthesisCacheKey(request, "fake", "model");
    expect(synthesisCacheKey({ ...request, text: " Hola ", voice: { provider: "fake", voiceId: "voice" }, language: "ES_es", settings: { stability: 0.5, speed: 1 } }, "fake", "model")).toBe(key);
    expect(synthesisCacheKey({ ...request, pronunciation: [{ grapheme: "Hola", alias: "Hello" }] }, "fake", "model")).not.toBe(key);
    expect(synthesisCacheKey({ ...request, context: { previousText: "Earlier" } }, "fake", "model")).not.toBe(key);
    expect(synthesisCacheKey({ ...request, timestamps: true }, "fake", "model")).not.toBe(key);
  });
  it("lets idempotency override content within a provider", () => {
    const key = synthesisCacheKey({ ...request, idempotencyKey: "once" }, "fake", "model");
    expect(synthesisCacheKey({ ...request, text: "different", idempotencyKey: "once" }, "fake", "other")).toBe(key);
    expect(synthesisCacheKey({ ...request, idempotencyKey: "once" }, "another", "model")).not.toBe(key);
  });
  it("enforces byte LRU, TTL and defensive copies", async () => {
    vi.useFakeTimers();
    const cache = new MemoryCacheStore({ maxBytes: 4, ttlMs: 100 });
    await cache.set("a", cached()); await cache.set("b", cached());
    const a = await cache.get("a"); a!.audio.data[0] = 99;
    await cache.set("c", cached());
    expect(await cache.get("b")).toBeUndefined();
    expect((await cache.get("a"))!.audio.data[0]).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(await cache.get("a")).toBeUndefined();
  });
  it("persists bytes and metadata across cache instances, safely hashing keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "voice-core-cache-"));
    try {
      const first = new FileCacheStore(dir), second = new FileCacheStore(dir);
      await first.set("../../unsafe-key", cached());
      expect(await second.get("../../unsafe-key")).toEqual(await first.get("../../unsafe-key"));
      await second.delete("../../unsafe-key");
      expect(await first.get("../../unsafe-key")).toBeUndefined();
      await first.set("expired", cached(), 0);
      expect(await first.get("expired")).toBeUndefined();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("accounts for concurrent replacements of the same key without premature eviction", async () => {
    const cache = new MemoryCacheStore({ maxBytes: 6 });
    await Promise.all(Array.from({ length: 5 }, () => cache.set("same", cached())));
    await cache.set("second", cached()); await cache.set("third", cached());
    expect(await cache.get("same")).toBeDefined();
    expect(await cache.get("second")).toBeDefined();
    expect(await cache.get("third")).toBeDefined();
  });
  it("stores file URLs and inspectable memory audio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "voice-core-storage-"));
    try {
      const storage = new FileAudioStorage(dir), value = cached().audio;
      const saved = await storage.save(value, { fileName: "a space.mp3" });
      expect(fileURLToPath(saved.uri)).toBe(saved.path);
      expect(new Uint8Array(await readFile(saved.path))).toEqual(value.data);
      await expect(storage.save(value, { fileName: "../escape.mp3" })).rejects.toMatchObject({ code: "invalid_request" });
      const memory = new MemoryAudioStorage(), stored = await memory.save(value, {});
      expect(memory.get(stored.uri)).toEqual(value);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe("credentials and registry", () => {
  it("uses the first nonempty env var for each credential field", async () => {
    const { definition } = fakeProvider({ requiredCredentials: ["apiKey", "region"] });
    const resolver = new EnvCredentialResolver([definition], { VOICE_TEST_PRIMARY: "primary", VOICE_TEST_SECONDARY: "secondary", VOICE_TEST_REGION: "west" });
    expect(await resolver.resolve("fake")).toEqual({ apiKey: "primary", region: "west" });
    const fallback = new EnvCredentialResolver([definition], { VOICE_TEST_PRIMARY: " ", VOICE_TEST_SECONDARY: "secondary" });
    expect(await fallback.resolve("fake")).toEqual({ apiKey: "secondary" });
    expect(hasRequiredCredentials(definition, await fallback.resolve("fake"))).toBe(false);
    expect(hasRequiredCredentials(definition, await resolver.resolve("fake"))).toBe(true);
  });
  it("merges chain fields by priority and forwards scope", async () => {
    const resolve = vi.fn().mockResolvedValue({ apiKey: "first" });
    const chain = new ChainCredentialResolver([{ resolve }, new StaticCredentialResolver({ fake: { apiKey: "second", region: "west" } })]);
    expect(await chain.resolve("fake", { companyId: "company" })).toEqual({ apiKey: "first", region: "west" });
    expect(resolve).toHaveBeenCalledWith("fake", { companyId: "company" });
  });
  it("memoizes provider instances by credential hash and recreates on rotation", () => {
    const fake = fakeProvider(), registry = new ProviderRegistry([fake.definition]);
    const ctx = { credentials: { apiKey: "a", region: "b" }, fetch: globalThis.fetch };
    const a = registry.instantiate("fake", ctx);
    expect(registry.instantiate("fake", { ...ctx, credentials: { region: "b", apiKey: "a" } })).toBe(a);
    expect(registry.instantiate("fake", { ...ctx, credentials: { apiKey: "rotated" } })).not.toBe(a);
    expect(fake.contexts).toHaveLength(2);
    expect(() => registry.instantiate("missing", ctx)).toThrow("Unknown");
  });
});
