import { describe, expect, it } from "vitest";
import { allLlmProviders, allRealtimeProviders, allSttProviders, createLlmEngine, createSttEngine, createDefinitionCredentialResolver } from "../../src/index.js";

const creds = (defs: Array<{ id: string; requiredCredentials: string[] }>) =>
  Object.fromEntries(defs.map((d) => [d.id, Object.fromEntries(d.requiredCredentials.map((f) => [f, "test"]))]));

describe("STT / LLM / realtime bundles", () => {
  it("has unique ids and complete definitions", () => {
    for (const defs of [allSttProviders, allLlmProviders, allRealtimeProviders]) {
      const ids = defs.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of defs) {
        expect(d.docsUrl).toMatch(/^https:\/\//);
        expect(typeof d.create).toBe("function");
        expect(Array.isArray(d.requiredCredentials)).toBe(true);
      }
    }
    expect(allSttProviders.length).toBe(13);
    expect(allLlmProviders.map((d) => d.id)).toEqual(expect.arrayContaining(["anthropic", "openai", "gemini", "cerebras", "groq", "openrouter", "ollama"]));
    expect(allRealtimeProviders.map((d) => d.id).sort()).toEqual(["gemini", "openai"]);
  });

  it("instantiates every STT provider with coherent models and defaults", async () => {
    const never = (async () => { throw new Error("no network"); }) as unknown as typeof fetch;
    for (const def of allSttProviders) {
      const p = def.create({ credentials: Object.fromEntries(Object.keys(def.credentialEnv).map((f) => [f, f === "baseUrl" ? "http://localhost:1" : "k"])), fetch: never });
      expect(p.id).toBe(def.id);
      const models = await p.listModels();
      expect(models.length, def.id).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === def.id), def.id).toBe(true);
      expect(models.some((m) => m.id === p.defaultModel({ language: "es" })), `${def.id} default`).toBe(true);
      if (p.capabilities.streaming) expect(typeof p.openStream, def.id).toBe("function");
    }
  });

  it("instantiates every LLM provider with coherent models and defaults", async () => {
    const never = (async () => { throw new Error("no network"); }) as unknown as typeof fetch;
    for (const def of allLlmProviders) {
      const p = def.create({ credentials: Object.fromEntries(Object.keys(def.credentialEnv).map((f) => [f, f === "baseUrl" ? "http://localhost:1" : "k"])), fetch: never });
      expect(p.id).toBe(def.id);
      const models = await p.listModels();
      expect(models.length, def.id).toBeGreaterThan(0);
      for (const tier of ["fast", "balanced", "flagship"] as const) {
        const id = p.defaultModel({ tier });
        expect(typeof id, `${def.id} ${tier}`).toBe("string");
      }
      expect(p.capabilities.streaming, def.id).toBe(true);
    }
  });

  it("engines see providers only when credentials exist", async () => {
    const stt = createSttEngine({ providers: allSttProviders, credentials: createDefinitionCredentialResolver([]) });
    expect(await stt.availableProviders()).toEqual([]);
    const llm = createLlmEngine({ providers: allLlmProviders, credentials: createDefinitionCredentialResolver(allLlmProviders, { GROQ_API_KEY: "x" }) });
    const available = await llm.availableProviders();
    expect(available).toContain("groq");
    expect(available).not.toContain("anthropic");
    await expect(llm.complete({ provider: "anthropic", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ code: "auth" });
    void creds;
  });
});
