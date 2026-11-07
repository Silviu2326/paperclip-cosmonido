import { mkdir, open, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { AudioOutput, UsageRecord } from "../core/types.js";
import { write, type CliContext } from "./context.js";

/** Resolve output relative to --out-dir, defaulting to a unique filename. */
export function outputPath(ctx: CliContext, file: string | undefined, extension: string): string {
  return resolve(ctx.outDir, file ?? `voice-${randomUUID()}.${extension}`);
}

/** Persist audio and return its absolute local path. */
export async function saveAudio(ctx: CliContext, audio: AudioOutput, file?: string): Promise<string> {
  const path = outputPath(ctx, file, audio.format.container);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, audio.data);
  return path;
}

/** Write every byte, including when a filesystem write completes partially. */
export async function writeChunk(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset);
    if (!bytesWritten) throw new Error("Audio output write made no progress.");
    offset += bytesWritten;
  }
}

/** Open an output file before the first streaming chunk arrives. */
export async function openOutput(path: string): Promise<FileHandle> {
  await mkdir(dirname(path), { recursive: true });
  return open(path, "w");
}

/** Report usage separately from machine-readable stdout. */
export function reportUsage(ctx: CliContext, usage: UsageRecord | undefined, latencyMs: number): void {
  const details = usage
    ? `${usage.units} ${usage.unit}(s); cost ${usage.estimatedCents === null ? "unpriced" : `~${usage.estimatedCents.toFixed(4)} cents`}`
    : "usage/cost not reported";
  write(ctx.io.stderr, `${details}; latency ${Math.round(latencyMs)} ms\n`);
}

function launch(command: string, args: string[], ctx: CliContext): Promise<boolean> {
  return new Promise(resolveResult => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: "ignore", env: ctx.io.env });
    child.once("error", () => resolveResult(false));
    child.once("exit", code => resolveResult(code === 0));
  });
}

/** Play a file with an available native player; playback failure is nonfatal. */
export async function playAudio(ctx: CliContext, path: string): Promise<void> {
  if (await launch("ffplay", ["-nodisp", "-autoexit", "-loglevel", "error", path], ctx)) return;
  if (process.platform === "darwin" && await launch("afplay", [path], ctx)) return;
  if (process.platform === "win32" && path.toLowerCase().endsWith(".wav")) {
    // The path is data in an environment variable, never interpolated PowerShell code.
    const playerContext = { ...ctx, io: { ...ctx.io, env: { ...ctx.io.env, VOICE_ENGINE_PLAY_FILE: path } } };
    if (await launch("powershell", ["-NoProfile", "-NonInteractive", "-Command", "$p = New-Object System.Media.SoundPlayer; $p.SoundLocation = $env:VOICE_ENGINE_PLAY_FILE; $p.PlaySync()"], playerContext)) return;
  }
  write(ctx.io.stderr, "Playback unavailable. Install ffplay, or open the saved audio file.\n");
}
