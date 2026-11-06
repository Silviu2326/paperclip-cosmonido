import type { ProviderDefinition, VoiceProvider } from "../core/types.js";
import type { CliContext } from "./context.js";

/**
 * Instantiate a provider without credentials for static metadata only (capabilities,
 * model catalog). Any network attempt fails loudly instead of leaking a request.
 */
export function staticProvider(definition: ProviderDefinition): VoiceProvider {
  const fetch = (async () => { throw new Error(`${definition.name}: credentials required for network access`); }) as unknown as typeof globalThis.fetch;
  return definition.create({ credentials: {}, fetch });
}

/** Return AND groups of credential environment aliases, including key/token alternatives. */
export function credentialRequirements(definition: ProviderDefinition): string[][] {
  if (definition.requiredCredentials.length) {
    return definition.requiredCredentials.map(field => definition.credentialEnv[field] ?? [field]);
  }
  // Current Google definition uses an empty required list for key OR token auth.
  // The public contract has no explicit disjunctive-credentials field.
  const alternatives = ["apiKey", "accessToken"].flatMap(field => definition.credentialEnv[field] ?? []);
  return alternatives.length ? [alternatives] : [];
}

/** Check CLI environment credentials; injected engines own their credential source. */
export async function availableProviderIds(ctx: CliContext): Promise<Set<string>> {
  if (ctx.io.engineFactory) return new Set(await ctx.engine.availableProviders());
  return new Set(ctx.engine.providers().filter(definition => credentialRequirements(definition)
    .every(names => names.some(name => ctx.io.env[name]?.trim()))).map(definition => definition.id));
}
