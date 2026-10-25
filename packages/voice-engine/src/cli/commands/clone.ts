import { choice, flag, option, positional, repeated, UsageError, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { readAudio } from "../inputs.js";
export const help = "clone --provider ID --name NAME --sample a.wav [--sample b.wav] [--mode instant|professional] [--language TAG] [--description TEXT] [--denoise] --consent\nOnly clone with the voice owner's informed permission.";

/** Clone a voice only after explicit consent attestation. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  if (!flag(args, "consent")) throw new UsageError("Cloning requires --consent to attest the voice owner's permission.");
  const provider = option(args, "provider", true)!;
  const name = option(args, "name", true)!;
  const samples = repeated(args, "sample");
  if (!samples?.length) throw new UsageError("Provide at least one --sample audio file.");
  const mode = choice(args, "mode", ["instant", "professional"]);
  const result = await ctx.engine.cloneVoice(provider, {
    name, samples: await Promise.all(samples.map(file => readAudio(file, ctx.io))), mode,
    language: option(args, "language"), description: option(args, "description"), denoise: flag(args, "denoise"),
    consent: { attested: true },
  });
  output(ctx, result, table(["ID", "NAME", "STATUS", "JOB"], [[result.voice.id, result.voice.name, result.status, result.jobId]]));
}
