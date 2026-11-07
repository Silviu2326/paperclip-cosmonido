import { describe, expect, it } from "vitest";
import { createVoiceEngine } from "../../src/core/engine.js";
import { StaticCredentialResolver } from "../../src/core/credentials.js";
import { allProviders } from "../../src/providers/index.js";
import type { EngineEvent, ProviderDefinition } from "../../src/core/types.js";

interface Call { url: URL; method: string; headers: Headers; body: unknown }

/** Fake fetch that answers any provider call with either JSON (GET) or mp3 bytes (POST). */
function fakeFetch(calls: Call[]) {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, method, headers: new Headers(init.headers), body });
    if (method === "GET") {
      return new Response(JSON.stringify({ voices: [], data: [], items: [], total: 0 }), { headers: { "content-type": "application/json" } });
    }
    return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]), { headers: { "content-type": "audio/mpeg", "request-id": "req-1" } });
  }) as typeof fetch;
}

const allCredentials = Object.fromEntries(
  allProviders.map((def) => [def.id, { apiKey: "k", region: "westeurope", groupId: "g", userId: "u" }]),
);

describe("engine + bundled providers (fake network)", () => {
  it("bundles ten providers with unique ids and complete definitions", () => {
    const ids = allProviders.map((p) => p.id);
    expect(new Set(ids).size).toBe(10);
    for (const def of allProviders) {
      expect(def.docsUrl).toMatch(/^https:\/\//);
      expect(Object.keys(def.credentialEnv).length).toBeGreaterThan(0);
      expect(typeof def.create).toBe("function");
    }
  });

  it("instantiates every provider and reports coherent capabilities and models", async () => {
    const engine = createVoiceEngine({
      providers: allProviders,
      credentials: new StaticCredentialResolver(allCredentials),
      fetch: fakeFetch([]),
      cache: false,
    });
    expect((await engine.availableProviders()).sort()).toEqual(allProviders.map((p) => p.id).sort());
    for (const def of allProviders) {
      const provider = await engine.provider(def.id);
      expect(provider.id).toBe(def.id);
      const models = await provider.listModels();
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) expect(model.provider).toBe(def.id);
      const picked = provider.defaultModel({ language: "es-ES" });
      expect(models.some((m) => m.id === picked)).toBe(true);
      if (provider.capabilities.streaming) expect(typeof provider.synthesizeStream).toBe("function");
      if (provider.capabilities.instantClone || provider.capabilities.professionalClone) expect(typeof provider.cloneVoice).toBe("function");
      if (provider.capabilities.voiceDesign) expect(typeof provider.designVoice).toBe("function");
      if (provider.capabilities.speechToSpeech) expect(typeof provider.speechToSpeech).toBe("function");
    }
  });

  it("reproduces the existing server ElevenLabs call through the engine", async () => {
    const calls: Call[] = [];
    const events: EngineEvent[] = [];
    const engine = createVoiceEngine({
      providers: allProviders,
      credentials: new StaticCredentialResolver({ elevenlabs: { apiKey: "xi-test" } }),
      fetch: fakeFetch(calls),
      cache: false,
    });
    engine.on((event) => events.push(event));
    const result = await engine.synthesize({
      text: "Hola mundo",
      voice: "elevenlabs:abc123",
      model: "eleven_multilingual_v2",
      language: "es-ES",
    });
    const call = calls.find((c) => c.url.pathname.includes("/v1/text-to-speech/abc123"));
    expect(call).toBeDefined();
    expect(call!.headers.get("xi-api-key")).toBe("xi-test");
    expect(call!.url.searchParams.get("output_format")).toBe("mp3_44100_128");
    expect((call!.body as Record<string, unknown>).model_id).toBe("eleven_multilingual_v2");
    // multilingual_v2 rejects language_code; the adapter must not send it.
    expect((call!.body as Record<string, unknown>).language_code).toBeUndefined();
    expect(result.provider).toBe("elevenlabs");
    expect(result.audio.data.byteLength).toBeGreaterThan(0);
    expect(result.audio.mimeType).toBe("audio/mpeg");
    expect(result.usage.unit).toBe("character");
    expect(result.usage.units).toBe("Hola mundo".length);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["synthesis.start", "synthesis.complete", "usage"]));
  });

  it("fails with an actionable auth error naming env vars when credentials are missing", async () => {
    const engine = createVoiceEngine({ providers: allProviders, credentials: new StaticCredentialResolver({}), fetch: fakeFetch([]), cache: false });
    await expect(engine.synthesize({ text: "x", voice: "fish-audio:v1" })).rejects.toMatchObject({ code: "auth" });
    await expect(engine.synthesize({ text: "x", voice: "fish-audio:v1" })).rejects.toThrow(/FISH_AUDIO_API_KEY/);
  });

  it("lists voices across providers without failing when a provider returns nothing", async () => {
    const engine = createVoiceEngine({ providers: allProviders, credentials: new StaticCredentialResolver(allCredentials), fetch: fakeFetch([]), cache: false });
    const voices = await engine.listVoices({ language: "es" });
    // Static catalogs (OpenAI, Deepgram, Azure/Google fallbacks…) guarantee some results.
    expect(voices.length).toBeGreaterThan(0);
    for (const voice of voices) expect(voice.id).toBe(`${voice.provider}:${voice.providerVoiceId}`);
    const recommended = await engine.recommendVoice({ language: "es-ES" });
    expect(recommended).toBeDefined();
  });

  it("estimates cost for a priced model and returns null for plan-dependent ones", async () => {
    const engine = createVoiceEngine({ providers: allProviders, credentials: new StaticCredentialResolver(allCredentials), fetch: fakeFetch([]), cache: false });
    const openai = await engine.estimateCost({ text: "a".repeat(1000), voice: "openai:alloy", model: "tts-1-hd" });
    expect(openai.estimatedCents).toBeGreaterThan(0);
    const eleven = await engine.estimateCost({ text: "a".repeat(1000), voice: "elevenlabs:abc", model: "eleven_multilingual_v2" });
    expect(eleven.estimatedCents).toBeNull();
  });
});

export type { ProviderDefinition };
