import type { CredentialResolver, ProviderCredentials, ProviderId } from "../core/types.js";
import { StaticCredentialResolver, ChainCredentialResolver } from "../core/credentials.js";

export type Definition = { id: string; credentialEnv: Record<string, string[]>; requiredCredentials: string[] };

/** Resolve credentials for arbitrary provider definitions from the environment. */
export function createDefinitionCredentialResolver(defs: Definition[], env: NodeJS.ProcessEnv = process.env): CredentialResolver {
  const map: Record<string, ProviderCredentials> = {};
  for (const def of defs) {
    const credentials: ProviderCredentials = {};
    for (const [field, names] of Object.entries(def.credentialEnv)) {
      const value = names.map((name) => env[name]).find((candidate) => Boolean(candidate?.trim()));
      if (value !== undefined) credentials[field] = value;
    }
    map[def.id] = credentials;
  }
  return new ChainCredentialResolver([new StaticCredentialResolver(map)]);
}

/** Check that all definition-required credential fields contain nonblank values. */
export function hasRequiredDefinitionCredentials(def: Definition, creds?: ProviderCredentials): boolean {
  return def.requiredCredentials.every((field) => Boolean(creds?.[field]?.trim()));
}
