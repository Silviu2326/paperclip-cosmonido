import { choice, numeric, option, positional, UsageError, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { ages, genders } from "../inputs.js";
import { saveAudio } from "../files.js";
export const help = "design --provider ID --prompt TEXT [--text TEXT] [--language TAG] [--gender female] [--age young] [--accent TEXT] [--candidates 3] [--save NAME --pick 1] [--out-dir DIR]";

/** Generate preview files and optionally persist one provider candidate. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<void> {
  positional(args, 0);
  const provider = option(args, "provider", true)!;
  const candidates = numeric(args, "candidates", 1, 100, true);
  const pick = numeric(args, "pick", 1, candidates ?? Infinity, true) ?? 1;
  const name = option(args, "save");
  if (args.flags.pick && !name) throw new UsageError("--pick requires --save NAME.");
  const result = await ctx.engine.designVoice(provider, {
    prompt: option(args, "prompt", true)!, text: option(args, "text"), language: option(args, "language"),
    gender: choice(args, "gender", genders), age: choice(args, "age", ages), accent: option(args, "accent"), candidates,
  });
  const previews = await Promise.all(result.candidates.map(async (candidate, i) => ({
    index: i + 1, candidateId: candidate.candidateId, description: candidate.description,
    path: await saveAudio(ctx, candidate.preview),
  })));
  if (name && !result.candidates[pick - 1]) throw new UsageError(`Candidate ${pick} was not returned. ${previews.length} preview(s) were saved.`);
  const voice = name ? await ctx.engine.saveDesignedVoice(provider, result.candidates[pick - 1].candidateId, name) : undefined;
  output(ctx, { candidates: previews, voice, usage: result.usage }, table(["PICK", "CANDIDATE", "PREVIEW"], previews.map(preview => [preview.index, preview.candidateId, preview.path])) + (voice ? `Saved ${voice.id}\n` : ""));
}
