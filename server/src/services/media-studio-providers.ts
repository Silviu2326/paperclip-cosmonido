import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import type { Db } from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import { secretService } from "./secrets.js";

export type MediaStudioProviderKind = "transcribe" | "dub" | "openai_whisper" | "elevenlabs";
export type MediaProviderId = "openai_whisper" | "elevenlabs";
export type MediaCostStatus = "reported" | "estimated" | "unpriced";

export interface MediaCostProvenance extends Record<string, unknown> {
  source: string;
  unit: "audio_second" | "character";
  units: number;
  /** USD cents per unit used for the estimate; null when no rate is asserted. */
  centsPerUnit: number | null;
  /** Estimate in cents when a rate is known but plan-dependent; never an actual charge. */
  estimatedCents: number | null;
  coverage: string;
}

export interface TranscribeWord { text: string; start: number; end: number }
export interface TranscribeResult {
  words: TranscribeWord[];
  text: string;
  duration: number;
  language?: string;
  costCents: number;
  provider: "openai_whisper";
  costStatus: MediaCostStatus;
  pricingProvenance?: MediaCostProvenance;
}
export interface DubSegment { start: number; end: number; text: string }
export interface DubResult {
  costCents: number;
  provider: "elevenlabs";
  costStatus: MediaCostStatus;
  pricingProvenance?: MediaCostProvenance;
}

export interface MediaStudioProviderDeps {
  fetch?: typeof fetch;
  /** Overrides FFMPEG_PATH / "ffmpeg". Arguments are always passed as an argv array, never a shell string. */
  ffmpegPath?: string;
  /** Test seam: replaces the ffmpeg subprocess. Must resolve with stderr text. */
  runFfmpeg?: (args: string[], opts: { signal?: AbortSignal; cwd?: string }) => Promise<string>;
  secrets?: Pick<ReturnType<typeof secretService>, "getByName" | "resolveSecretValue">;
}

export const MEDIA_PROVIDER_LIMITS = {
  whisperMaxUploadBytes: 25 * 1024 * 1024,
  whisperTimeoutMs: 10 * 60_000,
  whisperMaxResponseBytes: 16 * 1024 * 1024,
  ttsTimeoutMs: 2 * 60_000,
  ttsMaxAudioBytes: 20 * 1024 * 1024,
  ttsConcurrency: 3,
  ttsMaxSegments: 200,
  ttsMaxSegmentChars: 5000,
  ttsMaxTotalChars: 100_000,
  ttsMaxTempo: 1.3,
  ffmpegTimeoutMs: 5 * 60_000,
  maxSourceBytes: 4 * 1024 * 1024 * 1024,
} as const;

/** whisper-1 list price at time of writing (USD 0.006/min = 0.01 cent/s). Not read from the API. */
const WHISPER_CENTS_PER_SECOND = 0.01;
const WHISPER_MODEL = "whisper-1";
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

const SECRET_NAMES: Record<MediaProviderId, { label: string; names: string[] }> = {
  openai_whisper: { label: "OpenAI", names: ["OpenAI API Key", "OPENAI_API_KEY"] },
  elevenlabs: { label: "ElevenLabs", names: ["ElevenLabs API Key", "ELEVENLABS_API_KEY"] },
};

function providerFor(kind: MediaStudioProviderKind): MediaProviderId {
  return kind === "transcribe" || kind === "openai_whisper" ? "openai_whisper" : "elevenlabs";
}

function redact(text: string, apiKey?: string): string {
  let out = text;
  if (apiKey) out = out.split(apiKey).join("[redacted]");
  return out.replace(/\b(sk|xi)-[A-Za-z0-9_*.-]{6,}/g, "[redacted]").slice(0, 300);
}

function withDeadline(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Media provider operation was cancelled");
}

async function readBounded(response: Response, maxBytes: number, what: string): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${what} is larger than the ${maxBytes} byte limit`);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`${what} is larger than the ${maxBytes} byte limit`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function defaultRunFfmpeg(ffmpegPath?: string) {
  return (args: string[], opts: { signal?: AbortSignal; cwd?: string }): Promise<string> =>
    new Promise((resolvePromise, reject) => {
      const binary = ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
      const signal = withDeadline(opts.signal, MEDIA_PROVIDER_LIMITS.ffmpegTimeoutMs);
      if (signal.aborted) return reject(new Error("ffmpeg cancelled before start"));
      const child = spawn(binary, args, { windowsHide: true, cwd: opts.cwd, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      let settled = false;
      const onAbort = () => {
        child.kill("SIGKILL");
        if (!settled) { settled = true; reject(new Error("ffmpeg was cancelled or timed out")); }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-64_000); });
      child.on("error", (error) => {
        signal.removeEventListener("abort", onAbort);
        if (!settled) { settled = true; reject(new Error(`Unable to start ffmpeg: ${error.message}`)); }
      });
      child.on("close", (code) => {
        signal.removeEventListener("abort", onAbort);
        if (settled) return;
        settled = true;
        if (code === 0) resolvePromise(stderr);
        else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-2000)}`));
      });
    });
}

async function mapLimit<T, R>(items: T[], limit: number, signal: AbortSignal | undefined, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: unknown;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      throwIfAborted(signal);
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await fn(items[index]!, index); }
      catch (error) { if (!failed) { failed = true; failure = error; } return; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
  return results;
}

function parseDuration(stderr: string): number | null {
  const match = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

export function mediaStudioProviders(db: Db, deps: MediaStudioProviderDeps = {}) {
  const secrets = deps.secrets ?? secretService(db);
  const runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg(deps.ffmpegPath);
  const doFetch = (...args: Parameters<typeof fetch>) => (deps.fetch ?? globalThis.fetch)(...args);

  async function loadApiKey(companyId: string, provider: MediaProviderId): Promise<string> {
    const { label, names } = SECRET_NAMES[provider];
    let secret: { id: string } | null | undefined;
    for (const name of names) {
      secret = await secrets.getByName(companyId, name);
      if (secret) break;
    }
    if (!secret) throw unprocessable(`Add a ${label} API key in Company settings → Secrets (name "${names[0]}") before using this media operation`);
    let value: string;
    try { value = await secrets.resolveSecretValue(companyId, secret.id, "latest"); }
    catch { throw unprocessable(`The ${label} media API key could not be resolved; check Company settings → Secrets`); }
    value = typeof value === "string" ? value.trim() : "";
    if (!value) throw unprocessable(`The ${label} media API key is empty; check Company settings → Secrets`);
    return value;
  }

  return {
    /** Throws HttpError 422 with an actionable message when the company key is missing/unresolvable. Never returns the key. */
    async ensureConfigured(companyId: string, kind: MediaStudioProviderKind): Promise<void> {
      await loadApiKey(companyId, providerFor(kind));
    },

    async transcribe(input: { companyId: string; sourcePath: string; signal?: AbortSignal }): Promise<TranscribeResult> {
      const { companyId, signal } = input;
      const sourcePath = resolve(input.sourcePath);
      const info = await stat(sourcePath).catch(() => null);
      if (!info?.isFile()) throw new Error("Source media file is not available for transcription");
      if (info.size > MEDIA_PROVIDER_LIMITS.maxSourceBytes) throw new Error("Source media file is too large to transcribe");
      const apiKey = await loadApiKey(companyId, "openai_whisper");
      const folder = await mkdtemp(join(tmpdir(), "paperclip-whisper-"));
      try {
        const audioPath = join(folder, "audio.mp3");
        await runFfmpeg(["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath], { signal });
        const audio = await readFile(audioPath);
        if (audio.byteLength === 0) throw new Error("The source media has no audio track to transcribe");
        if (audio.byteLength > MEDIA_PROVIDER_LIMITS.whisperMaxUploadBytes) throw new Error("Extracted audio exceeds OpenAI's 25 MiB transcription upload limit; use a shorter clip");
        const form = new FormData();
        form.set("file", new File([audio], "audio.mp3", { type: "audio/mpeg" }));
        form.set("model", WHISPER_MODEL);
        form.set("response_format", "verbose_json");
        form.append("timestamp_granularities[]", "word");
        throwIfAborted(signal);
        const response = await doFetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: withDeadline(signal, MEDIA_PROVIDER_LIMITS.whisperTimeoutMs),
        });
        const raw = await readBounded(response, MEDIA_PROVIDER_LIMITS.whisperMaxResponseBytes, "OpenAI transcription response");
        let result: {
          text?: unknown; language?: unknown; duration?: unknown;
          words?: unknown; usage?: { seconds?: unknown }; error?: { message?: unknown };
        };
        try { result = JSON.parse(raw.toString("utf8")); }
        catch { throw new Error(`OpenAI transcription returned an unreadable response (${response.status})`); }
        if (!response.ok) {
          const message = typeof result.error?.message === "string" ? redact(result.error.message, apiKey) : "request failed";
          throw new Error(`OpenAI transcription failed (${response.status}): ${message}`);
        }
        if (!Array.isArray(result.words)) throw new Error("Whisper returned no word timestamps; try a shorter clip or retry");
        const words: TranscribeWord[] = [];
        for (const entry of result.words as Array<{ word?: unknown; start?: unknown; end?: unknown }>) {
          if (typeof entry?.word !== "string" || typeof entry.start !== "number" || typeof entry.end !== "number"
            || !Number.isFinite(entry.start) || !Number.isFinite(entry.end) || entry.start < 0 || entry.end < entry.start) {
            throw new Error("Whisper returned malformed word timestamps");
          }
          const text = entry.word.trim();
          if (text) words.push({ text, start: entry.start, end: entry.end });
        }
        const reportedDuration = typeof result.duration === "number" && Number.isFinite(result.duration) && result.duration >= 0 ? result.duration : null;
        const duration = reportedDuration ?? (words.length ? words[words.length - 1]!.end : 0);
        const usageSeconds = typeof result.usage?.seconds === "number" && Number.isFinite(result.usage.seconds) && result.usage.seconds >= 0 ? result.usage.seconds : null;
        const billedSeconds = usageSeconds ?? reportedDuration;
        const out: TranscribeResult = {
          words,
          text: typeof result.text === "string" ? result.text : words.map((w) => w.text).join(" "),
          duration,
          costCents: 0,
          provider: "openai_whisper",
          costStatus: "unpriced",
        };
        if (typeof result.language === "string" && result.language) out.language = result.language;
        if (billedSeconds !== null) {
          const estimatedCents = billedSeconds * WHISPER_CENTS_PER_SECOND;
          out.costCents = estimatedCents;
          out.costStatus = "estimated";
          out.pricingProvenance = {
            source: usageSeconds !== null ? "openai usage.seconds x configured whisper-1 list rate" : "openai verbose_json duration x configured whisper-1 list rate",
            unit: "audio_second", units: billedSeconds, centsPerUnit: WHISPER_CENTS_PER_SECOND, estimatedCents,
            coverage: "Rate is a code constant (USD 0.006/min), not returned by the API; invoice may differ.",
          };
        } else {
          out.pricingProvenance = {
            source: "openai response without usage or duration", unit: "audio_second", units: 0, centsPerUnit: WHISPER_CENTS_PER_SECOND, estimatedCents: null,
            coverage: "Provider reported no billable duration; cost not established.",
          };
        }
        return out;
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },

    async dub(input: {
      companyId: string; segments: DubSegment[]; language: string; voiceId: string; outputPath: string; signal?: AbortSignal;
    }): Promise<DubResult> {
      const { companyId, segments, signal } = input;
      const L = MEDIA_PROVIDER_LIMITS;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.voiceId ?? "")) throw unprocessable("Provide a valid ElevenLabs voice ID");
      if (typeof input.language !== "string" || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(input.language)) throw unprocessable("Provide a valid target language code");
      if (!Array.isArray(segments) || segments.length === 0) throw new Error("Provide translated segments before dubbing");
      if (segments.length > L.ttsMaxSegments) throw new Error(`Dubbing supports at most ${L.ttsMaxSegments} segments per job`);
      let totalChars = 0;
      const clean = segments.map((s) => {
        const text = typeof s?.text === "string" ? s.text.trim() : "";
        if (!text || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start) throw new Error("Translated dubbing segments must have text and valid timestamps");
        if (text.length > L.ttsMaxSegmentChars) throw new Error(`A dubbing segment exceeds ${L.ttsMaxSegmentChars} characters`);
        totalChars += text.length;
        return { start: s.start, end: s.end, text };
      }).sort((a, b) => a.start - b.start);
      if (totalChars > L.ttsMaxTotalChars) throw new Error(`Dubbing text exceeds ${L.ttsMaxTotalChars} characters`);
      if (!input.outputPath) throw new Error("Dub output path is required");
      const apiKey = await loadApiKey(companyId, "elevenlabs");
      const outputPath = resolve(input.outputPath);
      const folder = await mkdtemp(join(tmpdir(), "paperclip-dub-"));
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`;
        // eleven_multilingual_v2 infers the language from text; language_code is unsupported for it, so it is not sent.
        const clips = await mapLimit(clean, L.ttsConcurrency, signal, async (segment, index) => {
          const response = await doFetch(url, {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
            body: JSON.stringify({ text: segment.text, model_id: ELEVENLABS_MODEL }),
            signal: withDeadline(signal, L.ttsTimeoutMs),
          });
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            throw new Error(`ElevenLabs text-to-speech failed (${response.status})${response.status === 401 ? ": check the ElevenLabs API key" : ""}`);
          }
          const bytes = await readBounded(response, L.ttsMaxAudioBytes, "ElevenLabs audio");
          if (bytes.byteLength === 0) throw new Error("ElevenLabs returned empty audio");
          const name = `s${index}.mp3`;
          await writeFile(join(folder, name), bytes);
          const probe = await runFfmpeg(["-hide_banner", "-i", name, "-f", "null", "-"], { signal, cwd: folder });
          const duration = parseDuration(probe);
          if (duration === null || duration <= 0) throw new Error("Could not read generated dubbing audio duration");
          return { name, duration };
        });
        // Fit each clip: speed up (bounded) when longer than its slot, never run past the next segment's start.
        const args = ["-y"];
        const filters: string[] = [];
        clips.forEach((clip, i) => {
          const segment = clean[i]!;
          const slot = segment.end - segment.start;
          const nextStart = clean[i + 1]?.start;
          const room = nextStart !== undefined ? Math.max(slot, nextStart - segment.start) : Number.POSITIVE_INFINITY;
          const tempo = clip.duration > slot ? Math.min(clip.duration / slot, L.ttsMaxTempo) : 1;
          const fitted = clip.duration / tempo;
          const chain = [tempo > 1.001 ? `atempo=${tempo.toFixed(4)}` : "anull"];
          if (fitted > room) chain.push(`atrim=duration=${room.toFixed(3)}`, `afade=t=out:st=${Math.max(0, room - 0.05).toFixed(3)}:d=0.05`);
          const delay = Math.round(segment.start * 1000);
          chain.push(`adelay=${delay}|${delay}`);
          args.push("-i", clip.name);
          filters.push(`[${i}:a]${chain.join(",")}[a${i}]`);
        });
        const mixInputs = clips.map((_, i) => `[a${i}]`).join("");
        const ext = extname(outputPath).toLowerCase();
        const codec = ext === ".mp3" ? ["-c:a", "libmp3lame", "-q:a", "3"] : [];
        const mixed = join(folder, `mix${ext || ".mp3"}`);
        args.push("-filter_complex", `${filters.join(";")};${mixInputs}amix=inputs=${clips.length}:duration=longest:normalize=0[out]`, "-map", "[out]", ...codec, `mix${ext || ".mp3"}`);
        await runFfmpeg(args, { signal, cwd: folder });
        throwIfAborted(signal);
        await mkdir(dirname(outputPath), { recursive: true });
        const partial = `${outputPath}.partial`;
        await copyFile(mixed, partial);
        await rename(partial, outputPath).catch(async (error) => { await rm(partial, { force: true }); throw error; });
        return {
          costCents: 0,
          provider: "elevenlabs",
          costStatus: "unpriced",
          pricingProvenance: {
            source: "elevenlabs character count; plan-dependent credits, no billed amount returned",
            unit: "character", units: totalChars, centsPerUnit: null, estimatedCents: null,
            coverage: "Credits and unit prices depend on the subscription plan; no monetary rate or billed amount is available. This usage remains unpriced.",
          },
        };
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
}
