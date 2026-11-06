import type { VoiceEngine } from "../core/types.js";
import { VOICE_TOOLS } from "./tool-schemas.js";
import type { SttEngine } from "../stt/types.js";
import type { LlmEngine } from "../llm/types.js";
import { allRealtimeProviders } from "../realtime/index.js";

/** Describe live capabilities only for providers the scoped engine can instantiate. */
export async function describeProviders(engine: VoiceEngine) {
  const available = new Set(await engine.availableProviders());
  return Promise.all(engine.providers().map(async definition => {
    const base = { id: definition.id, name: definition.name, docsUrl: definition.docsUrl, available: available.has(definition.id) };
    if (!base.available) return { ...base, capabilities: null };
    try { return { ...base, capabilities: (await engine.provider(definition.id)).capabilities }; }
    catch (error) { return { ...base, capabilities: null, error: error instanceof Error ? error.message : String(error) }; }
  }));
}

export const voiceEngineManifest = {
  name: "@paperclipai/voice-engine", version: "0.1.0",
  capabilitiesByProvider: describeProviders,
  /** Provider catalogs for the other standalone engine kinds. */
  capabilitiesByKind: {
    async stt(engine: SttEngine) {
      const available = new Set(await engine.availableProviders());
      return Promise.all(engine.providers().map(async definition => ({ id: definition.id, name: definition.name, kind: "stt" as const, docsUrl: definition.docsUrl, available: available.has(definition.id), capabilities: available.has(definition.id) ? (await engine.provider(definition.id)).capabilities : null })));
    },
    async llm(engine: LlmEngine) {
      const available = new Set(await engine.availableProviders());
      return Promise.all(engine.providers().map(async definition => ({ id: definition.id, name: definition.name, kind: "llm" as const, docsUrl: definition.docsUrl, available: available.has(definition.id), capabilities: available.has(definition.id) ? (await engine.provider(definition.id)).capabilities : null })));
    },
    realtime: allRealtimeProviders.map(definition => ({ id: definition.id, name: definition.name, kind: "realtime" as const, docsUrl: definition.docsUrl, credentialEnv: definition.credentialEnv, requiredCredentials: definition.requiredCredentials })),
  },
  tools: VOICE_TOOLS.map(tool => tool.name),
};
