import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { VoiceEngineError } from "./errors.js";
import type { AudioOutput, AudioStorage } from "./types.js";

type SaveOptions = { fileName?: string; metadata?: Record<string, unknown> };

function fileName(audio: AudioOutput, options: SaveOptions): string {
  const name = options.fileName ?? `${randomUUID()}.${audio.format.container}`;
  if (!name || name === "." || name === ".." || /[\\/:<>"|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new VoiceEngineError("fileName must be a plain portable file name", { code: "invalid_request" });
  }
  return name;
}

/** Persist audio under a configured directory and return an absolute file URI. */
export class FileAudioStorage implements AudioStorage {
  private readonly dir: string;
  constructor(dir: string) { this.dir = resolve(dir); }
  async save(audio: AudioOutput, options: SaveOptions = {}): Promise<{ uri: string; path: string }> {
    const name = fileName(audio, options);
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, name);
    // Exclusive creation prevents accidental overwrites or following an existing symlink.
    await writeFile(path, audio.data, { flag: "wx", mode: 0o600 });
    return { uri: pathToFileURL(path).href, path };
  }
}

/** Store inspectable copies of audio in memory under unique memory:// URIs. */
export class MemoryAudioStorage implements AudioStorage {
  private readonly entries = new Map<string, { audio: AudioOutput; metadata?: Record<string, unknown> }>();
  async save(audio: AudioOutput, options: SaveOptions = {}): Promise<{ uri: string }> {
    const uri = `memory://${randomUUID()}/${encodeURIComponent(fileName(audio, options))}`;
    this.entries.set(uri, structuredClone({ audio, metadata: options.metadata }));
    return { uri };
  }
  /** Retrieve a defensive copy of stored audio. */
  get(uri: string): AudioOutput | undefined { const entry = this.entries.get(uri); return entry ? structuredClone(entry.audio) : undefined; }
}

/** Construct file-backed audio storage. */
export function createFileStorage(dir: string): FileAudioStorage { return new FileAudioStorage(dir); }
