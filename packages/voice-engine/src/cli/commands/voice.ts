import { VoiceEngineError } from "../../core/errors.js";
import { positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { voiceId } from "../inputs.js";
export const help = "voice <provider:voiceId>\nShow full voice details.";

/** Look up a voice by its engine-wide id. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  const [id] = positional(args, 1);
  const voice = await ctx.engine.getVoice(voiceId(id));
  if (!voice) throw new VoiceEngineError(`Voice ${id} was not found.`, { code: "not_found" });
  output(ctx, voice, table(["FIELD", "VALUE"], Object.entries(voice).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : value])));
}
