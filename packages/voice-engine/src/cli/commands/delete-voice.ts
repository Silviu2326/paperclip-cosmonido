import { flag, positional, UsageError, type ParsedArgs } from "../args.js";
import { output, type CliContext } from "../context.js";
import { voiceId } from "../inputs.js";
export const help = "delete-voice <provider:voiceId> --yes\nPermanently delete a provider voice.";

/** Require explicit confirmation before deleting a voice. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  const [id] = positional(args, 1);
  if (!flag(args, "yes")) throw new UsageError("Deleting a voice requires --yes.");
  await ctx.engine.deleteVoice(voiceId(id));
  output(ctx, { deleted: id }, `Deleted ${id}\n`);
}
