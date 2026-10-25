import { resolve } from "node:path";
import { createVoiceEngine } from "../core/engine.js";
import { allProviders } from "../providers/index.js";
import { createFileStorage } from "../core/storage.js";
import { createFileCache } from "../core/cache.js";
import { createSttEngine } from "../stt/engine.js";
import { allSttProviders } from "../stt/index.js";
import { createLlmEngine } from "../llm/engine.js";
import { allLlmProviders } from "../llm/index.js";
import { allRealtimeProviders } from "../realtime/index.js";
import type { VoiceEngine, VoiceEngineOptions } from "../core/types.js";
import type { CliIO } from "./context.js";

/** Construct the real runtime lazily; injected test engines never import it. */
export function createRuntime(io: CliIO, options: VoiceEngineOptions, cacheDir: string | undefined, outDir: string): VoiceEngine {
  return createVoiceEngine({
    ...options, providers: allProviders,
    credentials: {
      async resolve(id) {
        const definition = allProviders.find(provider => provider.id === id);
        if (!definition) return undefined;
        const credentials: Record<string, string> = {};
        for (const [field, names] of Object.entries(definition.credentialEnv)) {
          const value = names.map(name => io.env[name]).find(value => value?.trim());
          if (value !== undefined) credentials[field] = value;
        }
        return credentials;
      },
    },
    cache: cacheDir ? createFileCache(resolve(io.cwd, cacheDir)) : false,
    storage: createFileStorage(outDir),
  });
}

/** Create a separate STT runtime using the CLI environment credential resolver. */
export function createSttRuntime(io: CliIO) {
  return createSttEngine({ providers: allSttProviders, credentials: { async resolve(id) {
    const def = allSttProviders.find(item => item.id === id); if (!def) return undefined;
    const result: Record<string, string> = {};
    for (const [field, names] of Object.entries(def.credentialEnv)) { const value = names.map(name => io.env[name]).find(item => item?.trim()); if (value) result[field] = value; }
    return result;
  } } });
}

/** Create a separate LLM runtime using the CLI environment credential resolver. */
export function createLlmRuntime(io: CliIO) {
  return createLlmEngine({ providers: allLlmProviders, credentials: { async resolve(id) {
    const def = allLlmProviders.find(item => item.id === id); if (!def) return undefined;
    const result: Record<string, string> = {};
    for (const [field, names] of Object.entries(def.credentialEnv)) { const value = names.map(name => io.env[name]).find(item => item?.trim()); if (value) result[field] = value; }
    return result;
  } } });
}

export { allRealtimeProviders };
