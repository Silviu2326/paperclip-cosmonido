export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, (string | boolean)[]>;
}

export class UsageError extends Error {
  constructor(message: string) { super(message); this.name = "UsageError"; }
}

const booleans = new Set(["json", "help", "timestamps", "stream", "long", "play", "consent", "denoise", "yes", "words", "diarize", "realtime", "tools"]);

/** Parse long options, repeated values, negative numbers and the -- terminator. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const result: ParsedArgs = { positionals: [], flags: Object.create(null) };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") { result.positionals.push(...argv.slice(i + 1)); break; }
    if (arg === "-h") { (result.flags.help ??= []).push(true); continue; }
    if (!arg.startsWith("--")) { result.positionals.push(arg); continue; }
    const equals = arg.indexOf("=");
    const key = arg.slice(2, equals < 0 ? undefined : equals);
    if (!key) throw new UsageError("Expected an option name after --.");
    let value: string | boolean;
    if (booleans.has(key)) {
      const explicit = equals < 0 ? undefined : arg.slice(equals + 1);
      if (explicit !== undefined && explicit !== "true" && explicit !== "false") {
        throw new UsageError(`--${key} expects true or false.`);
      }
      value = explicit !== "false";
    } else if (equals >= 0) {
      value = arg.slice(equals + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`--${key} requires a value.`);
      value = next;
      i++;
    }
    (result.flags[key] ??= []).push(value);
  }
  return result;
}

/** Read one text option, rejecting duplicates and empty values. */
export function option(args: ParsedArgs, key: string, required = false): string | undefined {
  const values = args.flags[key];
  if (!values) {
    if (required) throw new UsageError(`Missing --${key}.`);
    return undefined;
  }
  if (values.length !== 1 || typeof values[0] !== "string" || !values[0].trim()) {
    throw new UsageError(`--${key} expects one nonempty value.`);
  }
  return values[0];
}

/** Read a repeatable text option. */
export function repeated(args: ParsedArgs, key: string): string[] | undefined {
  const values = args.flags[key];
  if (!values) return undefined;
  if (values.some(value => typeof value !== "string" || !value.trim())) throw new UsageError(`Invalid --${key} value.`);
  return values as string[];
}

/** Read a boolean option; --flag=false explicitly disables it. */
export function flag(args: ParsedArgs, key: string): boolean {
  const values = args.flags[key];
  if (!values) return false;
  if (values.length !== 1 || typeof values[0] !== "boolean") throw new UsageError(`--${key} expects one boolean.`);
  return values[0];
}

/** Read and range-check a finite numeric option. */
export function numeric(args: ParsedArgs, key: string, min = -Infinity, max = Infinity, integer = false): number | undefined {
  const raw = option(args, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new UsageError(`--${key} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`);
  }
  return value;
}

/** Read an option restricted to the supplied values. */
export function choice<T extends string>(args: ParsedArgs, key: string, allowed: readonly T[]): T | undefined {
  const value = option(args, key);
  if (value !== undefined && !allowed.includes(value as T)) throw new UsageError(`--${key} must be ${allowed.join(" | ")}.`);
  return value as T | undefined;
}

/** Enforce a command's positional arity. */
export function positional(args: ParsedArgs, count: number): string[] {
  if (args.positionals.length !== count) throw new UsageError(`Expected ${count} positional argument(s); received ${args.positionals.length}. Use --help.`);
  return args.positionals;
}

/** Reject misspelled or inapplicable options before calling the engine. */
export function validateOptions(args: ParsedArgs, allowed: readonly string[]): void {
  const names = new Set(["provider", "json", "company", "cache-dir", "out-dir", "help", ...allowed]);
  for (const key of Object.keys(args.flags)) {
    if (!names.has(key)) throw new UsageError(`Unknown option --${key}. Use --help.`);
    if (booleans.has(key)) flag(args, key);
    else if (!["tag", "sample", "provider", "keyword"].includes(key)) option(args, key);
    else repeated(args, key);
  }
}
