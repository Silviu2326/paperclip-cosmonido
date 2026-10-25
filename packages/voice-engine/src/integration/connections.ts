import { allProviders } from "../providers/index.js";
import { VoiceEngineError } from "../core/errors.js";
import type { CredentialResolver, ProviderDefinition, ProviderId } from "../core/types.js";
import { allSttProviders } from "../stt/index.js";
import { allLlmProviders } from "../llm/index.js";
import { allRealtimeProviders } from "../realtime/index.js";
import type { SttProviderDefinition } from "../stt/types.js";
import type { LlmProviderDefinition } from "../llm/types.js";
import type { RealtimeProviderDefinition } from "../realtime/types.js";

export interface ConnectionField {
  key: string;
  label: string;
  secret: boolean;
  placeholder: string;
  helpUrl: string;
  required: boolean;
  envNames: string[];
}
export interface ConnectionSpec {
  provider: ProviderId;
  kind: "tts" | "stt" | "llm" | "realtime" | "multiple";
  name: string;
  helpUrl: string;
  fields: ConnectionField[];
}

/** Derive UI collection fields from definitions without instantiating a provider. */
export function connectionSpecs(definitions: ProviderDefinition[]): Record<ProviderId, ConnectionSpec> {
  const labels: Record<string, string> = { apiKey: "API key", region: "Region", groupId: "Group ID", userId: "User ID", projectId: "Project ID", accessToken: "Access token" };
  const publicFields = new Set(["region", "groupId", "userId", "project", "projectId", "organization", "location", "endpoint", "baseUrl"]);
  return Object.fromEntries(definitions.map(definition => [definition.id, {
    provider: definition.id, kind: "tts" as const, name: definition.name, helpUrl: definition.docsUrl,
    fields: [...new Set([...Object.keys(definition.credentialEnv), ...definition.requiredCredentials])].map(key => ({
      key, label: labels[key] ?? key, secret: !publicFields.has(key),
      placeholder: definition.credentialEnv[key]?.[0] ?? key,
      helpUrl: definition.docsUrl, required: definition.requiredCredentials.includes(key),
      envNames: [...(definition.credentialEnv[key] ?? [])],
    })),
  }])) as Record<ProviderId, ConnectionSpec>;
}

type AnyDefinition = ProviderDefinition | SttProviderDefinition | LlmProviderDefinition | RealtimeProviderDefinition;
function definitionSpec(definition: AnyDefinition, kind: ConnectionSpec["kind"]): ConnectionSpec {
  const base = connectionSpecs([definition as ProviderDefinition])[definition.id];
  return { ...base, kind };
}
/** Merge connection requirements across capability kinds while sharing providers by id. */
export function combinedConnectionSpecs(): Record<ProviderId, ConnectionSpec> {
  const specs: Record<string, ConnectionSpec> = {};
  const groups: Array<[AnyDefinition[], ConnectionSpec["kind"]]> = [[allProviders, "tts"], [allSttProviders, "stt"], [allLlmProviders, "llm"], [allRealtimeProviders, "realtime"]];
  for (const [definitions, kind] of groups) for (const definition of definitions) {
    const incoming = definitionSpec(definition, kind); const old = specs[definition.id];
    if (!old) specs[definition.id] = incoming;
    else {
      const fields = new Map(old.fields.map(field => [field.key, field]));
      for (const field of incoming.fields) {
        const previous = fields.get(field.key);
        fields.set(field.key, previous ? { ...previous, required: previous.required || field.required, envNames: [...new Set([...previous.envNames, ...field.envNames])], placeholder: previous.placeholder || field.placeholder } : field);
      }
      specs[definition.id] = { ...old, kind: old.kind === kind ? kind : "multiple", fields: [...fields.values()] };
    }
  }
  return specs as Record<ProviderId, ConnectionSpec>;
}

export const VOICE_CONNECTION_SPECS: Record<ProviderId, ConnectionSpec> = combinedConnectionSpecs();

/** Adapt a company-scoped store; never fall back to environment or another company. */
export function connectionCredentialResolver(
  lookup: (providerId: ProviderId, companyId: string) => Promise<Record<string, string> | undefined>,
): CredentialResolver {
  return {
    async resolve(provider, scope) {
      if (!scope?.companyId?.trim()) throw new VoiceEngineError("A companyId is required to resolve voice connection credentials.", { code: "auth", provider });
      const credentials = await lookup(provider, scope.companyId);
      return credentials ? { ...credentials } : undefined;
    },
  };
}
