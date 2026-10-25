import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_FORMAT } from "./audio.js";
import { normalizeLanguageTag } from "./languages.js";
import { normalizeText } from "./text.js";
import type { CacheStore, CachedSynthesis, ProviderId, SynthesisRequest } from "./types.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/** Hash normalized synthesis inputs; an idempotency key overrides inputs within a provider. */
export function synthesisCacheKey(request: SynthesisRequest, provider: ProviderId, model: string): string {
  if (request.idempotencyKey !== undefined) return digest(JSON.stringify([provider, "idempotency", request.idempotencyKey]));
  const voice = typeof request.voice === "string" ? request.voice : `${request.voice.provider}:${request.voice.voiceId}`;
  return digest(JSON.stringify(canonical({
    provider, text: normalizeText(request.text), voice, model, language: request.language ? normalizeLanguageTag(request.language) : undefined,
    format: { ...(request.format ?? DEFAULT_FORMAT), channels: request.format?.channels ?? 1, bitDepth: request.format?.bitDepth ?? 16 },
    settings: request.settings ?? {}, pronunciation: request.pronunciation ?? [], ssml: request.ssml ?? false,
    timestamps: request.timestamps ?? false, context: request.context ?? {}, providerOptions: request.providerOptions ?? {},
  })));
}

type CacheOptions = { maxBytes?: number; ttlMs?: number };
type Entry = { value: CachedSynthesis; expiresAt: number; bytes: number };

/** In-memory LRU cache bounded by audio bytes, with independent entry expiration. */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  constructor(options: CacheOptions | number = {}) {
    this.maxBytes = typeof options === "number" ? options : options.maxBytes ?? 64 * 1024 * 1024;
    this.ttlMs = typeof options === "number" ? 3_600_000 : options.ttlMs ?? 3_600_000;
    if (!Number.isFinite(this.maxBytes) || this.maxBytes < 0 || !Number.isFinite(this.ttlMs) || this.ttlMs < 0) throw new RangeError("Cache limits must be nonnegative finite numbers");
  }
  async get(key: string): Promise<CachedSynthesis | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.remove(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, entry);
    return structuredClone(entry.value);
  }
  async set(key: string, value: CachedSynthesis, ttlMs = this.ttlMs): Promise<void> {
    this.remove(key);
    if (ttlMs <= 0 || value.audio.data.byteLength > this.maxBytes) return;
    for (const [existingKey, entry] of this.entries) if (entry.expiresAt <= Date.now()) this.remove(existingKey);
    const bytes = value.audio.data.byteLength;
    while (this.bytes + bytes > this.maxBytes && this.entries.size) this.remove(this.entries.keys().next().value!);
    this.entries.set(key, { value: structuredClone(value), bytes, expiresAt: Date.now() + ttlMs });
    this.bytes += bytes;
  }
  async delete(key: string): Promise<void> {
    this.remove(key);
  }
  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) { this.bytes -= entry.bytes; this.entries.delete(key); }
  }
}

type Sidecar = { version: 1; expiresAt: number; audioHash: string; value: Omit<CachedSynthesis, "audio"> & { audio: Omit<CachedSynthesis["audio"], "data"> } };

/** File cache with content-addressed audio and atomically replaced JSON sidecars. */
export class FileCacheStore implements CacheStore {
  constructor(private readonly dir: string, private readonly ttlMs = 3_600_000) {}
  async get(key: string): Promise<CachedSynthesis | undefined> {
    try {
      const record = JSON.parse(await readFile(join(this.dir, `${digest(key)}.json`), "utf8")) as Sidecar;
      if (record.version !== 1 || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now() || !/^[a-f0-9]{64}$/.test(record.audioHash)) return undefined;
      const bytes = new Uint8Array(await readFile(join(this.dir, `${record.audioHash}.bin`)));
      if (digest(bytes) !== record.audioHash) return undefined;
      return { ...record.value, audio: { ...record.value.audio, data: bytes } };
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async set(key: string, value: CachedSynthesis, ttlMs = this.ttlMs): Promise<void> {
    if (ttlMs <= 0) { await this.delete(key); return; }
    await mkdir(this.dir, { recursive: true });
    const { data, ...audio } = value.audio;
    const audioHash = digest(data);
    const record: Sidecar = { version: 1, expiresAt: Date.now() + ttlMs, audioHash, value: { ...value, audio } };
    await this.atomicWrite(join(this.dir, `${audioHash}.bin`), data);
    await this.atomicWrite(join(this.dir, `${digest(key)}.json`), JSON.stringify(record));
  }
  async delete(key: string): Promise<void> {
    await unlink(join(this.dir, `${digest(key)}.json`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
  private async atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, data, { flag: "wx", mode: 0o600 }); await rename(temporary, path); }
    finally { await unlink(temporary).catch(() => undefined); }
  }
}

/** Create the default memory cache. */
export function createMemoryCache(options: CacheOptions | number = {}): MemoryCacheStore { return new MemoryCacheStore(options); }
/** Create a persistent file cache. */
export function createFileCache(dir: string): FileCacheStore { return new FileCacheStore(dir); }
