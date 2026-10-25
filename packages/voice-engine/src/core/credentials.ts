import type { CredentialResolver, ProviderCredentials, ProviderDefinition, ProviderId } from "./types.js";

/** Resolve each credential from the first nonempty configured environment variable. */
export class EnvCredentialResolver implements CredentialResolver {
  constructor(private readonly definitions: ProviderDefinition[], private readonly env: NodeJS.ProcessEnv = process.env) {}
  async resolve(provider: ProviderId): Promise<ProviderCredentials | undefined> {
    const definition = this.definitions.find((item) => item.id === provider);
    if (!definition) return undefined;
    const credentials: ProviderCredentials = {};
    for (const [field, names] of Object.entries(definition.credentialEnv)) {
      const value = names.map((name) => this.env[name]).find((item) => item?.trim());
      if (value !== undefined) credentials[field] = value;
    }
    return credentials;
  }
}

/** Resolve credentials from a caller-owned provider map. */
export class StaticCredentialResolver implements CredentialResolver {
  constructor(private readonly map: Record<string, ProviderCredentials>) {}
  async resolve(provider: ProviderId): Promise<ProviderCredentials | undefined> {
    const value = this.map[provider];
    return value ? { ...value } : undefined;
  }
}

/** Merge resolver results in priority order; earlier nonempty fields win. */
export class ChainCredentialResolver implements CredentialResolver {
  constructor(private readonly resolvers: CredentialResolver[]) {}
  async resolve(provider: ProviderId, scope?: { companyId?: string }): Promise<ProviderCredentials | undefined> {
    const result: ProviderCredentials = {};
    let found = false;
    for (const resolver of this.resolvers) {
      const credentials = await resolver.resolve(provider, scope);
      if (!credentials) continue;
      found = true;
      for (const [field, value] of Object.entries(credentials)) if (!result[field]?.trim() && value?.trim()) result[field] = value;
    }
    return found ? result : undefined;
  }
}

/** Test whether every required credential is populated. */
export function hasRequiredCredentials(def: ProviderDefinition, creds?: ProviderCredentials): boolean {
  return def.requiredCredentials.every((field) => Boolean(creds?.[field]?.trim()));
}

/** Construct the default environment credential resolver. */
export function createEnvCredentialResolver(defs: ProviderDefinition[]): EnvCredentialResolver { return new EnvCredentialResolver(defs); }
