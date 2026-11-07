import { option, positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { availableProviderIds, staticProvider } from "../credentials.js";
import type { ProviderCapabilities, ProviderDefinition } from "../../core/types.js";

export const help = "providers [--provider ID]\nList bundled TTS providers, credential environment names and capabilities; see stt-providers and llm-providers for other kinds.";

/** List definitions without requiring unavailable providers to initialize. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const filter = option(args, "provider");
  const available = await availableProviderIds(ctx);
  const rows = await Promise.all(ctx.engine.providers().filter(def => !filter || def.id === filter).map(async def => {
    // Capabilities are static per adapter, so they are readable without credentials.
    const capabilities = available.has(def.id) ? (await ctx.engine.provider(def.id)).capabilities : staticCapabilities(def);
    return { id: def.id, name: def.name, docsUrl: def.docsUrl, credentialEnv: def.credentialEnv, requiredCredentials: def.requiredCredentials, available: available.has(def.id), capabilities };
  }));
  const yes = (value: boolean | undefined) => value === undefined ? "?" : value ? "yes" : "no";
  const overview = table(["ID", "NAME", "AVAILABLE", "ENV VARS", "DOCS"], rows.map(row => [row.id, row.name, row.available, Object.values(row.credentialEnv).flat().join(", "), row.docsUrl]));
  const capabilities = table(["ID", "TTS", "STREAM", "TIMES", "SSML", "EMOTION", "CLONE", "PRO CLONE", "DESIGN", "STS", "LANGUAGES"], rows.map(row => {
    const c = row.capabilities;
    return [row.id, yes(c?.synthesize), yes(c?.streaming), yes(c?.timestamps), yes(c?.ssml), yes(c?.emotionTags), yes(c?.instantClone), yes(c?.professionalClone), yes(c?.voiceDesign), yes(c?.speechToSpeech), c?.languages.length ?? "?"];
  }));
  output(ctx, rows, overview + "\n" + capabilities);
}

/** Static capabilities for a definition whose credentials are missing; null when the adapter cannot be built offline. */
function staticCapabilities(def: ProviderDefinition): ProviderCapabilities | null {
  try { return staticProvider(def).capabilities; } catch { return null; }
}
