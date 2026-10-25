import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flag, numeric, option, positional, UsageError, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { settingsFlags, voiceId } from "../inputs.js";
import { executeSpeak, validateSpeak } from "./speak.js";
import { errorDetails, errorText } from "../errors.js";

export const help = "batch <manifest.json> [--concurrency 3] [--out-dir DIR]\nManifest: array of {text, voice, model?, language?, format?, settings?, timestamps?, out?, long?, stream?}. All rows are validated before synthesis.";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UsageError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function rowArgs(value: unknown, index: number, globals: ParsedArgs): ParsedArgs {
  const row = object(value, `Manifest row ${index + 1}`);
  const allowed = new Set(["text", "voice", "model", "language", "format", "settings", "timestamps", "out", "long", "stream", "provider", "gender", "tag"]);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw new UsageError(`Unknown manifest field ${key} in row ${index + 1}.`);
  if (typeof row.text !== "string" || !row.text.trim() || row.text === "-") throw new UsageError(`Row ${index + 1} requires text (stdin is not supported in batch).`);
  const flags: ParsedArgs["flags"] = Object.create(null);
  if (globals.flags.provider) flags.provider = globals.flags.provider;
  for (const key of ["model", "language", "out", "provider", "gender"]) {
    if (row[key] !== undefined) {
      if (typeof row[key] !== "string" || !row[key].trim()) throw new UsageError(`Row ${index + 1}: ${key} must be a nonempty string.`);
      flags[key] = [row[key]];
    }
  }
  let voice = row.voice;
  if (typeof voice === "object" && voice !== null) {
    const ref = object(voice, "voice");
    if (typeof ref.provider !== "string" || typeof ref.voiceId !== "string") throw new UsageError("voice requires provider and voiceId strings.");
    voice = `${ref.provider}:${ref.voiceId}`;
  }
  if (typeof voice !== "string") throw new UsageError(`Row ${index + 1} requires voice.`);
  flags.voice = [voice === "auto" ? voice : voiceId(voice)];
  if (row.tag !== undefined) {
    const tags = Array.isArray(row.tag) ? row.tag : [row.tag];
    if (!tags.every(tag => typeof tag === "string" && tag.trim())) throw new UsageError("tag must contain nonempty strings.");
    flags.tag = tags as string[];
  }
  for (const key of ["timestamps", "long", "stream"]) {
    if (row[key] !== undefined) {
      if (typeof row[key] !== "boolean") throw new UsageError(`${key} must be boolean.`);
      flags[key] = [row[key]];
    }
  }
  if (row.format !== undefined) {
    const format = typeof row.format === "string" ? { container: row.format } : object(row.format, "format");
    for (const key of Object.keys(format)) if (!["container", "sampleRate"].includes(key)) throw new UsageError(`Unsupported batch format field ${key}.`);
    if (typeof format.container !== "string") throw new UsageError("format requires container.");
    flags.format = [format.container];
    if (format.sampleRate !== undefined) {
      if (typeof format.sampleRate !== "number") throw new UsageError("sampleRate must be a number.");
      flags["sample-rate"] = [String(format.sampleRate)];
    }
  }
  if (row.settings !== undefined) for (const [key, value] of Object.entries(object(row.settings, "settings"))) {
    if (!settingsFlags.includes(key) || typeof value !== (key === "emotion" ? "string" : "number")) throw new UsageError(`Invalid settings.${key}.`);
    flags[key] = [String(value)];
  }
  flags.out ??= [`batch-${String(index + 1).padStart(3, "0")}.${flags.format?.[0] ?? "mp3"}`];
  const parsed = { flags, positionals: [row.text] };
  validateSpeak(parsed);
  return parsed;
}

/** Run a validated manifest with bounded concurrency and a partial-failure summary. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<number> {
  const [manifest] = positional(args, 1);
  const concurrency = numeric(args, "concurrency", 1, 32, true) ?? 3;
  let input: unknown;
  try { input = JSON.parse(await readFile(resolve(ctx.io.cwd, manifest), "utf8")); }
  catch (error) { if (error instanceof SyntaxError) throw new UsageError(`Invalid manifest JSON: ${error.message}`); throw error; }
  if (!Array.isArray(input)) throw new UsageError("Batch manifest must be an array of speak requests.");
  const requests = input.map((row, i) => rowArgs(row, i, args));
  if (concurrency > 1 && requests.some(row => flag(row, "stream"))) throw new UsageError("Batch streaming requires --concurrency 1 so usage events remain attributable.");
  const paths = requests.flatMap(row => {
    const path = resolve(ctx.outDir, option(row, "out", true)!);
    return flag(row, "timestamps") ? [path, `${path}.json`] : [path];
  }).map(path => process.platform === "win32" ? path.toLowerCase() : path);
  if (new Set(paths).size !== paths.length) throw new UsageError("Batch output paths (including timestamp sidecars) must be unique.");
  const results: Record<string, unknown>[] = new Array(requests.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, requests.length) }, async () => {
    while (cursor < requests.length) {
      const index = cursor++;
      try { results[index] = { index: index + 1, ok: true, ...await executeSpeak(ctx, requests[index]) }; }
      catch (error) { results[index] = { index: index + 1, ok: false, error: errorDetails(error) }; }
    }
  }));
  const successes = results.filter(result => result.ok);
  const knownEstimatedCents = successes.reduce((sum, row) => sum + (typeof row.estimatedCents === "number" ? row.estimatedCents : 0), 0);
  const summary = { results, succeeded: successes.length, failed: results.length - successes.length, totalChars: successes.reduce((sum, row) => sum + Number(row.chars), 0), knownEstimatedCents, totalEstimatedCents: successes.every(row => row.estimatedCents !== null) ? knownEstimatedCents : null };
  output(ctx, summary, table(["ROW", "STATUS", "FILE / ERROR"], results.map(row => [row.index, row.ok ? "ok" : "failed", row.path ?? errorText(row.error as ReturnType<typeof errorDetails>)])) + `${summary.succeeded} succeeded, ${summary.failed} failed; ${summary.totalChars} chars; estimated cost ${summary.totalEstimatedCents ?? "partly unpriced"} cents (known: ${knownEstimatedCents}).\n`);
  return summary.failed ? 1 : 0;
}
