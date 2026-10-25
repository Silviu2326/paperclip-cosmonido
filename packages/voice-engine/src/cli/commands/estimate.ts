import { option, positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { readText, voiceId } from "../inputs.js";
export const help = "estimate <text|@file> --voice provider:voiceId [--model ID]";

/** Estimate usage without submitting synthesis. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  const [text] = positional(args, 1);
  const voice = voiceId(option(args, "voice", true)!);
  const usage = await ctx.engine.estimateCost({ text: await readText(text, ctx.io), voice, model: option(args, "model") });
  output(ctx, usage, table(["PROVIDER", "UNITS", "UNIT", "ESTIMATED CENTS", "SOURCE"], [[usage.provider, usage.units, usage.unit, usage.estimatedCents ?? "unpriced", usage.pricingSource]]));
}
