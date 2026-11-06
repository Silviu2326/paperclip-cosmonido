import { choice, option, positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { staticProvider } from "../credentials.js";
export const help = "models [--provider ID] [--language TAG] [--tier flagship|balanced|fast|legacy]";

/** List models, keeping unknown/multilingual language inventories eligible. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const language = option(args, "language")?.toLowerCase().split("-")[0];
  const tier = choice(args, "tier", ["flagship", "balanced", "fast", "legacy"]);
  const providerFilter = option(args, "provider");
  // Model catalogs are static per adapter: read them without credentials unless an injected engine owns them.
  const catalog = ctx.io.engineFactory
    ? await ctx.engine.listModels(providerFilter)
    : (await Promise.all(ctx.engine.providers().filter(def => !providerFilter || def.id === providerFilter).map(def => staticProvider(def).listModels()))).flat();
  const models = catalog.filter(model =>
    (!tier || tier === model.tier) && (!language || !model.languages.length || model.languages.some(tag => tag.toLowerCase().split("-")[0] === language)));
  output(ctx, models, table(["PROVIDER", "MODEL", "TIER", "LANGUAGES", "USD/M CHARS"], models.map(model => [model.provider, model.id, model.tier, summarizeLanguages(model.languages), model.usdPerMillionChars ?? "unpriced"])));
}

/** Keep the table readable: show the first languages and a count for the rest. */
function summarizeLanguages(languages: string[], shown = 8): string {
  if (!languages.length) return "many/unknown";
  if (languages.length <= shown) return languages.join(", ");
  return `${languages.slice(0, shown).join(", ")} … (+${languages.length - shown}, ${languages.length} total)`;
}
