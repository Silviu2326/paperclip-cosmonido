import { positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { voiceQuery } from "../inputs.js";
export const help = "voices [--provider ID] [--language es-ES] [--gender female] [--age young] [--tag narration --tag calm] [--origin premade] [--search TEXT] [--limit N]";

/** Query the unified catalog. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const voices = await ctx.engine.listVoices(voiceQuery(args));
  output(ctx, voices, table(["ID", "NAME", "LANGUAGES", "GENDER", "AGE", "ORIGIN", "TAGS"], voices.map(voice => [voice.id, voice.name, voice.languages.join(", "), voice.gender, voice.age, voice.origin, voice.tags.join(", ")])));
}
