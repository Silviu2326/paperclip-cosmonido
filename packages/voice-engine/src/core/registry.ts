import { createHash } from "node:crypto";
import { VoiceEngineError } from "./errors.js";
import type { ProviderContext, ProviderDefinition, ProviderId, VoiceProvider } from "./types.js";

/** Registry of provider definitions and instances, refreshed when credentials change. */
export class ProviderRegistry {
  private readonly definitions = new Map<ProviderId, ProviderDefinition>();
  private readonly instances = new Map<ProviderId, { hash: string; provider: VoiceProvider }>();
  constructor(defs: ProviderDefinition[] = []) { for (const def of defs) this.register(def); }
  register(def: ProviderDefinition): void { this.definitions.set(def.id, def); this.instances.delete(def.id); }
  get(id: ProviderId): ProviderDefinition | undefined { return this.definitions.get(id); }
  list(): ProviderDefinition[] { return [...this.definitions.values()]; }
  instantiate(id: ProviderId, ctx: ProviderContext): VoiceProvider {
    const definition = this.get(id);
    if (!definition) throw new VoiceEngineError(`Unknown voice provider: ${id}`, { code: "not_found", provider: id });
    const hash = createHash("sha256").update(JSON.stringify(Object.entries(ctx.credentials).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
    const existing = this.instances.get(id);
    if (existing?.hash === hash) return existing.provider;
    const provider = definition.create(ctx);
    this.instances.set(id, { hash, provider });
    return provider;
  }
}

/** Create a provider registry from definitions. */
export function createProviderRegistry(defs: ProviderDefinition[] = []): ProviderRegistry { return new ProviderRegistry(defs); }
