import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { AudioInput, EngineVoiceId, VoiceQuery, VoiceSettings } from "../core/types.js";
import { VoiceEngineError } from "../core/errors.js";
import { choice, numeric, option, repeated, UsageError, type ParsedArgs } from "./args.js";
import type { CliContext, CliIO } from "./context.js";

export const queryFlags = ["language", "gender", "age", "tag", "origin", "search", "limit"];
export const settingsFlags = ["speed", "stability", "similarity", "style", "pitch", "volume", "emotion", "seed"];
export const genders = ["male", "female", "neutral", "unknown"] as const;
export const ages = ["child", "young", "middle_aged", "old", "unknown"] as const;

/** Convert catalog CLI filters to the public query contract. */
export function voiceQuery(args: ParsedArgs): VoiceQuery {
  return {
    provider: repeated(args, "provider"), language: option(args, "language"),
    gender: choice(args, "gender", genders), age: choice(args, "age", ages),
    tags: repeated(args, "tag"), search: option(args, "search"),
    origin: choice(args, "origin", ["premade", "cloned", "designed", "professional_clone", "community", "custom"] as const),
    limit: numeric(args, "limit", 1, Infinity, true),
  };
}

/** Validate an engine-wide voice identifier. */
export function voiceId(value: string): EngineVoiceId {
  if (!/^[^:\s]+:.+$/s.test(value) || !value.slice(value.indexOf(":") + 1).trim()) {
    throw new UsageError("Use an engine voice id such as elevenlabs:VOICE_ID.");
  }
  return value as EngineVoiceId;
}

/** Resolve --voice auto using the same filters as the catalog. */
export async function selectedVoice(ctx: CliContext, args: ParsedArgs): Promise<EngineVoiceId> {
  const value = option(args, "voice", true)!;
  if (value !== "auto") return voiceId(value);
  const found = await ctx.engine.recommendVoice(voiceQuery(args));
  if (!found) throw new VoiceEngineError("No voice matched --voice auto; choose a voice with the voices command.", { code: "not_found" });
  return found.id;
}

/** Read literal text, @file, or stdin without changing whitespace. */
export async function readText(value: string, io: CliIO): Promise<string> {
  let text = value;
  if (value.startsWith("@")) text = await readFile(resolve(io.cwd, value.slice(1)), "utf8");
  else if (value === "-") {
    if (typeof io.stdin === "string") text = io.stdin;
    else {
      const chunks: Buffer[] = [];
      for await (const chunk of io.stdin ?? process.stdin) chunks.push(Buffer.from(chunk));
      text = Buffer.concat(chunks).toString("utf8");
    }
  }
  if (!text.trim()) throw new UsageError("Text must not be empty.");
  return text;
}

/** Infer a conventional audio MIME type from a local filename. */
export function mimeType(file: string): string {
  const types: Record<string, string> = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".ogg": "audio/ogg", ".opus": "audio/opus", ".aac": "audio/aac", ".m4a": "audio/mp4", ".pcm": "audio/pcm" };
  return types[extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Load a local audio sample for cloning or speech conversion. */
export async function readAudio(file: string, io: CliIO): Promise<AudioInput> {
  return { data: await readFile(resolve(io.cwd, file)), mimeType: mimeType(file), fileName: basename(file) };
}

/** Map supported CLI settings to normalized engine settings. */
export function voiceSettings(args: ParsedArgs): VoiceSettings {
  return {
    speed: numeric(args, "speed", 0.25, 4), stability: numeric(args, "stability", 0, 1),
    similarity: numeric(args, "similarity", 0, 1), style: numeric(args, "style", 0, 1),
    pitch: numeric(args, "pitch", -12, 12), volume: numeric(args, "volume", -20, 20),
    emotion: option(args, "emotion"), seed: numeric(args, "seed", 0, Number.MAX_SAFE_INTEGER, true),
  };
}
