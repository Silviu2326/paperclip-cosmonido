import { VoiceEngineError } from "../../core/errors.js";
import { positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { voiceQuery } from "../inputs.js";
export const help = "recommend [--language TAG] [--gender female] [--tag narration] [--provider ID]";

/** Recommend a catalog voice using normalized filters. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const voice = await ctx.engine.recommendVoice(voiceQuery(args));
  if (!voice) throw new VoiceEngineError("No voice matches these filters.", { code: "not_found" });
  output(ctx, voice, table(["ID", "NAME", "LANGUAGES", "TAGS"], [[voice.id, voice.name, voice.languages.join(", "), voice.tags.join(", ")]]));
}
