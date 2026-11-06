import { option, positional, type ParsedArgs } from "../args.js";
import { output, type CliContext } from "../context.js";
import { readAudio, voiceId } from "../inputs.js";
import { reportUsage, saveAudio } from "../files.js";
export const help = "sts --voice provider:voiceId --input file.wav [--out file.mp3]";

/** Convert speech and persist the returned audio. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const voice = voiceId(option(args, "voice", true)!);
  const result = await ctx.engine.speechToSpeech({ voice, audio: await readAudio(option(args, "input", true)!, ctx.io) });
  const path = await saveAudio(ctx, result.audio, option(args, "out"));
  reportUsage(ctx, result.usage, result.latencyMs);
  output(ctx, { path, provider: result.provider, model: result.model, usage: result.usage, latencyMs: result.latencyMs }, `${path}\n`);
}
