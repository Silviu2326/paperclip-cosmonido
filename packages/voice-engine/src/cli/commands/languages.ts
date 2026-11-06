import { option, positional, type ParsedArgs } from "../args.js";
import { output, table, write, type CliContext } from "../context.js";
import { availableProviderIds } from "../credentials.js";
export const help = "languages [--provider ID]\nList TTS language tags from available providers; use stt-models for STT model language metadata.";

/** Aggregate language tags without guessing unavailable provider capabilities. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const filter = option(args, "provider");
  const available = await availableProviderIds(ctx);
  const entries = new Map<string, Set<string>>();
  for (const definition of ctx.engine.providers().filter(def => !filter || def.id === filter)) {
    if (!available.has(definition.id)) {
      write(ctx.io.stderr, `${definition.id}: skipped (credentials unavailable).\n`);
      continue;
    }
    for (const tag of (await ctx.engine.provider(definition.id)).capabilities.languages) {
      const providers = entries.get(tag) ?? new Set<string>();
      providers.add(definition.id); entries.set(tag, providers);
    }
  }
  const display = new Intl.DisplayNames(["en"], { type: "language" });
  const rows = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([tag, providers]) => {
    let name = tag;
    try { name = display.of(tag) ?? tag; } catch { /* Preserve nonstandard provider tags. */ }
    return { tag, name, providers: [...providers] };
  });
  output(ctx, rows, table(["TAG", "LANGUAGE", "PROVIDERS"], rows.map(row => [row.tag, row.name, row.providers.join(", ")])));
}
