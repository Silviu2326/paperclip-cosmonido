import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export type MediaOperation =
  | { type: "cut_ranges"; ranges: Array<{ start: number; end: number }> }
  | { type: "remove_silences"; thresholdDb: number; minDurationMs: number }
  | { type: "remove_fillers"; words: string[] }
  | { type: "burn_subtitles"; style: { font?: string; size: number; color: string; highlightColor?: string; position: "top" | "center" | "bottom" }; subtitles?: Array<{ start: number; end: number; text: string }> }
  | { type: "export"; aspect: "9:16" | "16:9"; cropMode: "center" }
  | { type: "replace_audio"; assetId: string }
  // Job-only operations: they run as their own media jobs (stop motion, multivoice dubbing, voiceover) and are rejected by renderMedia.
  | { type: "stop_motion"; frameDurationSeconds: number; cameraMotion: CameraMotion }
  | { type: "voiceover"; assetId: string; duckingDb: number }
  | { type: "dub_multivoice"; language: string };

export type CameraMotion = "pan" | "zoom" | "none";

export interface MediaProject { sourcePath: string; operations: MediaOperation[] }
export interface RenderOptions {
  ffmpegPath?: string;
  resolveAsset?: (assetId: string) => Promise<string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_FFMPEG_STDERR_BYTES = 16 * 1024;
type RunOptions = Pick<RenderOptions, "signal" | "timeoutMs">;

function binary(explicit?: string): string {
  return explicit ?? process.env.FFMPEG_PATH ?? "ffmpeg";
}

async function run(args: string[], ffmpegPath?: string, cwd?: string, options: RunOptions = {}): Promise<string> {
  const executable = binary(ffmpegPath);
  const timeoutMs = options.timeoutMs ?? DEFAULT_FFMPEG_TIMEOUT_MS;
  if (options.signal?.aborted) throw new Error("ffmpeg cancelled before start");
  return await new Promise((resolve, reject) => {
    const controller = new AbortController();
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromCaller);
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (options.signal?.aborted) {
      finish(new Error("ffmpeg cancelled before start"));
      return;
    }
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("deadline exceeded"));
    }, timeoutMs);
    const child = spawn(executable, args, { windowsHide: true, cwd, signal: controller.signal });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_FFMPEG_STDERR_BYTES);
    });
    child.on("error", error => {
      if (timedOut) finish(new Error(`ffmpeg timed out after ${timeoutMs} ms${stderr ? `: ${stderr}` : ""}`));
      else if (options.signal?.aborted) finish(new Error(`ffmpeg cancelled${stderr ? `: ${stderr}` : ""}`));
      else finish(new Error(`Unable to start ffmpeg (${executable}): ${error.message}`));
    });
    child.on("close", code => {
      if (timedOut) finish(new Error(`ffmpeg timed out after ${timeoutMs} ms${stderr ? `: ${stderr}` : ""}`));
      else if (options.signal?.aborted) finish(new Error(`ffmpeg cancelled${stderr ? `: ${stderr}` : ""}`));
      else if (code === 0) finish(undefined, stderr);
      else finish(new Error(`ffmpeg exited with ${code}: ${stderr}`));
    });
  });
}

export async function probeDuration(path: string, ffmpegPath?: string, options: RunOptions = {}): Promise<number> {
  const err = await run(["-hide_banner", "-i", path, "-t", "0", "-f", "null", "-"], ffmpegPath, undefined, options).catch(e => {
    const message = String(e);
    if (/timed out|cancelled/i.test(message)) throw e;
    const match = message.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) throw e;
    return message;
  });
  const m = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("Could not read media duration");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function extractAudioTrack(inputPath: string, outputPath: string, ffmpegPath?: string, options: RunOptions = {}): Promise<void> {
  await run(["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", outputPath], ffmpegPath, undefined, options);
}

export async function mixTimedAudioTracks(tracks: Array<{ path: string; startSeconds: number }>, outputPath: string, ffmpegPath?: string, options: RunOptions = {}): Promise<void> {
  if (!tracks.length || tracks.some(track => !Number.isFinite(track.startSeconds) || track.startSeconds < 0)) throw new Error("Timed dubbing requires audio tracks with non-negative start times");
  const args: string[] = ["-y"];
  for (const track of tracks) args.push("-i", track.path);
  const filters = tracks.map((track, index) => `[${index}:a]adelay=${Math.round(track.startSeconds * 1000)}|${Math.round(track.startSeconds * 1000)}[a${index}]`).join(";");
  const inputs = tracks.map((_, index) => `[a${index}]`).join("");
  await run([...args, "-filter_complex", `${filters};${inputs}amix=inputs=${tracks.length}:duration=longest:normalize=0[out]`, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "3", outputPath], ffmpegPath, undefined, options);
}

export async function detectSilences(path: string, opts: { thresholdDb?: number; minDurationMs?: number; ffmpegPath?: string; signal?: AbortSignal; timeoutMs?: number } = {}) {
  const thresholdDb = opts.thresholdDb ?? -35, minDuration = (opts.minDurationMs ?? 800) / 1000;
  if (thresholdDb < -90 || thresholdDb > 0 || minDuration <= 0) throw new Error("Invalid silence detection parameters");
  let stderr = "";
  try { stderr = await run(["-hide_banner", "-i", path, "-af", `silencedetect=noise=${thresholdDb}dB:d=${minDuration}`, "-f", "null", "-"], opts.ffmpegPath, undefined, opts); }
  catch (error) { stderr = String(error); if (/timed out|cancelled/i.test(stderr) || !stderr.includes("silence_")) throw error; }
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map(m => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]));
  return starts.map((start, i) => ({ start, end: ends[i] ?? start }));
}

export type FillerSegment = { start: number; end: number; text: string };
export type FillerRange = { start: number; end: number; text: string };

type FillerToken = { word: string; text: string; start: number; end: number; segmentIndex: number };
type FillerMatch = FillerRange & { startToken: number; endToken: number };

function normalizedWords(text: string): string[] {
  return text.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function fillerMatches(segments: FillerSegment[], phrases: string[]): { tokens: FillerToken[]; matches: FillerMatch[] } {
  const tokens = segments.flatMap((segment, segmentIndex) => normalizedWords(segment.text).map(word => ({
    word,
    text: segment.text,
    start: segment.start,
    end: segment.end,
    segmentIndex,
  })));
  const phraseWords = [...new Map(phrases.map(phrase => {
    const words = normalizedWords(phrase);
    return [words.join(" "), words] as const;
  })).values()].filter(words => words.length > 0);
  const matches: FillerMatch[] = [];

  for (const words of phraseWords) {
    for (let startToken = 0; startToken <= tokens.length - words.length; startToken++) {
      let matchesPhrase = true;
      for (let phraseIndex = 0; phraseIndex < words.length; phraseIndex++) {
        const token = tokens[startToken + phraseIndex]!;
        if (token.word !== words[phraseIndex] || (phraseIndex > 0 && token.start - tokens[startToken + phraseIndex - 1]!.end > 1)) {
          matchesPhrase = false;
          break;
        }
      }
      if (!matchesPhrase) continue;
      const endToken = startToken + words.length - 1;
      matches.push({
        start: tokens[startToken]!.start,
        end: tokens[endToken]!.end,
        text: segments.slice(tokens[startToken]!.segmentIndex, tokens[endToken]!.segmentIndex + 1).map(segment => segment.text).join(" "),
        startToken,
        endToken,
      });
    }
  }

  matches.sort((a, b) => a.startToken - b.startToken || a.endToken - b.endToken);
  const merged: FillerMatch[] = [];
  for (const match of matches) {
    const previous = merged.at(-1);
    if (previous && match.startToken <= previous.endToken) {
      if (match.endToken > previous.endToken) {
        previous.endToken = match.endToken;
        previous.end = match.end;
        previous.text = segments.slice(tokens[previous.startToken]!.segmentIndex, tokens[match.endToken]!.segmentIndex + 1).map(segment => segment.text).join(" ");
      }
      continue;
    }
    merged.push({ ...match });
  }
  return { tokens, matches: merged };
}

export function findFillerRanges(segments: FillerSegment[], phrases: string[]): FillerRange[] {
  return fillerMatches(segments, phrases).matches.map(({ start, end, text }) => ({ start, end, text }));
}

export function removeFillers<T extends FillerSegment>(segments: T[], phrases: string[]): T[] {
  const { tokens, matches } = fillerMatches(segments, phrases);
  const removedTokens = new Set<number>();
  for (const match of matches) {
    for (let tokenIndex = match.startToken; tokenIndex <= match.endToken; tokenIndex++) removedTokens.add(tokenIndex);
  }
  const tokensBySegment = new Map<number, number[]>();
  tokens.forEach((token, tokenIndex) => {
    const indices = tokensBySegment.get(token.segmentIndex) ?? [];
    indices.push(tokenIndex);
    tokensBySegment.set(token.segmentIndex, indices);
  });

  return segments.flatMap((segment, segmentIndex) => {
    const indices = tokensBySegment.get(segmentIndex) ?? [];
    if (indices.length === 0) return [segment];
    const remaining = indices.filter(index => !removedTokens.has(index));
    if (remaining.length === 0) return [];
    if (remaining.length === indices.length) return [segment];
    return [{ ...segment, text: remaining.map(index => tokens[index]!.word).join(" ") }];
  });
}

export type SubtitleCue = { start: number; end: number; text: string };
export type KeptSegment = { start: number; end: number; timelineStart: number };

export function retimeSubtitles(subtitles: SubtitleCue[], keptSegments: KeptSegment[]): SubtitleCue[] {
  return subtitles.flatMap(subtitle => keptSegments.flatMap(segment => {
    const start = Math.max(subtitle.start, segment.start);
    const end = Math.min(subtitle.end, segment.end);
    if (end <= start) return [];
    return [{
      ...subtitle,
      start: segment.timelineStart + start - segment.start,
      end: segment.timelineStart + end - segment.start,
    }];
  }));
}

function validateOps(ops: MediaOperation[]) {
  for (const op of ops) {
    if (op.type === "stop_motion" || op.type === "voiceover" || op.type === "dub_multivoice") throw new Error(`Operation ${op.type} runs as its own media job and cannot be part of a render`);
    if (op.type === "cut_ranges") for (const range of op.ranges) if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) throw new Error("Cut ranges must have non-negative start and end after start");
    if (op.type === "remove_silences" && (op.thresholdDb < -90 || op.thresholdDb > 0 || op.minDurationMs <= 0)) throw new Error("Invalid silence operation");
    if (op.type === "export" && op.cropMode !== "center") throw new Error("Unsupported crop mode");
  }
}

function assColor(value: string): string {
  const match=/^#?([0-9a-f]{6})$/i.exec(value.trim());
  if(!match) throw new Error("Subtitle colors must be six-digit hex values");
  const rgb=match[1]!;return `&H00${rgb.slice(4,6)}${rgb.slice(2,4)}${rgb.slice(0,2)}&`;
}

export async function renderMedia(project: MediaProject, outputPath: string, options: RenderOptions = {}): Promise<void> {
  validateOps(project.operations);
  await access(project.sourcePath);
  const work = await mkdtemp(join(tmpdir(), "paperclip-media-"));
  let input = project.sourcePath;
  const runOptions: RunOptions = { signal: options.signal, timeoutMs: options.timeoutMs };
  try {
    let originalDuration: number | null = null;
    for (const [index, op] of project.operations.entries()) {
      if (op.type !== "replace_audio") continue;
      if (!options.resolveAsset) throw new Error("Audio asset resolver is required");
      originalDuration ??= await probeDuration(project.sourcePath, options.ffmpegPath, runOptions);
      const audio = await options.resolveAsset(op.assetId);
      const out = join(work, `operation-${index}-replace-audio.mp4`);
      await run([
        "-y", "-i", input, "-i", audio,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-af", `apad,atrim=duration=${originalDuration}`,
        "-c:a", "aac", "-t", String(originalDuration), out,
      ], options.ffmpegPath, undefined, runOptions);
      input = out;
    }

    const rawCuts = [
      ...project.operations.filter((op): op is Extract<MediaOperation, { type: "cut_ranges" }> => op.type === "cut_ranges").flatMap(op => op.ranges),
      ...(await Promise.all(project.operations.filter((op): op is Extract<MediaOperation, { type: "remove_silences" }> => op.type === "remove_silences").map(op => detectSilences(input, {
        thresholdDb: op.thresholdDb,
        minDurationMs: op.minDurationMs,
        ffmpegPath: options.ffmpegPath,
        ...runOptions,
      })))).flat(),
    ].sort((a, b) => a.start - b.start);
    const cuts: Array<{start:number;end:number}> = [];
    for(const range of rawCuts) { const previous=cuts[cuts.length-1]; if(previous && range.start <= previous.end) previous.end=Math.max(previous.end,range.end); else cuts.push({...range}); }
    let keptSegments: KeptSegment[] | null = null;
    if (cuts.length) {
      const duration = originalDuration ?? await probeDuration(input, options.ffmpegPath, runOptions);
      const keep: Array<{ start: number; end: number }> = []; let cursor = 0;
      for (const cut of cuts) { if (cut.start > duration) throw new Error("Cut range exceeds media duration"); if (cut.start > cursor) keep.push({ start: cursor, end: Math.min(cut.start, duration) }); cursor = Math.min(cut.end, duration); }
      if (cursor < duration) keep.push({ start: cursor, end: duration });
      if (!keep.length) throw new Error("Cut operations remove the entire media");
      let timelineStart = 0;
      keptSegments = keep.map(segment => {
        const result = { ...segment, timelineStart };
        timelineStart += segment.end - segment.start;
        return result;
      });
      const out = join(work, "combined-cuts.mp4");
      const filters = keep.map((r, i) => `[0:v]trim=start=${r.start}:end=${r.end},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${r.start}:end=${r.end},asetpts=PTS-STARTPTS[a${i}]`).join(";") + `;${keep.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${keep.length}:v=1:a=1[v][a]`;
      await run(["-y", "-i", input, "-filter_complex", filters, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", out], options.ffmpegPath, undefined, runOptions);
      input = out;
    }
    for (const [index, op] of project.operations.entries()) {
      if (op.type === "export") {
        const out = join(work, `operation-${index}-export.mp4`), vf = op.aspect === "9:16" ? "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" : "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080";
        await run(["-y", "-i", input, "-vf", vf, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", out], options.ffmpegPath, undefined, runOptions); input = out;
      } else if (op.type === "burn_subtitles") {
        if (!op.subtitles?.length) continue;
        const srt = join(work, `operation-${index}-subs.srt`), out = join(work, `operation-${index}-subtitles.mp4`);
        const subtitles = keptSegments ? retimeSubtitles(op.subtitles, keptSegments) : op.subtitles;
        if (!subtitles.length) continue;
        const timestamp=(s:number)=>{const ms=Math.round(s*1000), h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),sec=Math.floor(ms%60000/1000),frac=ms%1000;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")},${String(frac).padStart(3,"0")}`;};
        await writeFile(srt, subtitles.map((s, i) => `${i + 1}\n${timestamp(s.start)} --> ${timestamp(s.end)}\n${s.text}\n`).join("\n"));
        const color=assColor(op.style.color),highlight=op.style.highlightColor?assColor(op.style.highlightColor):color;
        const font=op.style.font?`,FontName=${op.style.font.replace(/[,'\\]/g,"")}`:"";
        await run(["-y", "-i", input, "-vf", `subtitles=${basename(srt)}:force_style='FontSize=${op.style.size},PrimaryColour=${color},SecondaryColour=${highlight},Alignment=${op.style.position === "top" ? 8 : op.style.position === "center" ? 5 : 2}${font}'`, "-c:a", "copy", out], options.ffmpegPath, work, runOptions); input = out;
      }
    }
    await run(["-y", "-i", input, "-c", "copy", "-movflags", "+faststart", outputPath], options.ffmpegPath, undefined, runOptions);
    await access(outputPath);
  } finally { await rm(work,{recursive:true,force:true}); }
}

// ---------------------------------------------------------------------------
// Media studio v3: stop motion, multivoice dubbing and voiceover.
// Each function is one ffmpeg pipeline over inputs the caller has already
// materialised on disk. Arguments are always passed as argv, never as a shell string.
// ---------------------------------------------------------------------------

export interface StopMotionOptions extends RunOptions {
  framePaths: string[];
  frameDurationSeconds: number;
  cameraMotion: CameraMotion;
  outputPath: string;
  ffmpegPath?: string;
  width?: number;
  height?: number;
  fps?: number;
}

export interface MultivoiceTrack {
  /** Offset in seconds where this clip starts on the timeline. */
  start: number;
  /** End of the last spoken segment in this clip; informational, the output is bounded by the source video. */
  end: number;
  speaker: string;
  audioPath: string;
}

const MAX_STOP_MOTION_FRAMES = 200;

function isEvenPositive(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value % 2 === 0;
}

/** Concat-demuxer list entries are single-quoted; forward slashes avoid backslash escapes on Windows. */
function concatEntry(path: string): string {
  return `file '${path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
}

export async function stopMotion(options: StopMotionOptions): Promise<{ outputPath: string; durationSeconds: number }> {
  const { framePaths, frameDurationSeconds, cameraMotion, outputPath } = options;
  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  const fps = options.fps ?? 30;
  if (!framePaths.length || framePaths.length > MAX_STOP_MOTION_FRAMES) throw new Error(`Stop motion needs between 1 and ${MAX_STOP_MOTION_FRAMES} frames`);
  if (!Number.isFinite(frameDurationSeconds) || frameDurationSeconds < 0.05 || frameDurationSeconds > 10) throw new Error("Frame duration must be between 0.05 and 10 seconds");
  if (!["pan", "zoom", "none"].includes(cameraMotion)) throw new Error("Unsupported camera motion");
  if (!isEvenPositive(width) || !isEvenPositive(height)) throw new Error("Stop motion dimensions must be positive even integers");
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error("Stop motion frame rate must be an integer between 1 and 60");
  for (const path of framePaths) await access(path);

  const work = await mkdtemp(join(tmpdir(), "paperclip-stop-motion-"));
  try {
    // Concat demuxer: every frame gets its own duration. The last frame is repeated without a duration (ffmpeg requirement);
    // the output is then capped with -t so the length is exactly frames x frameDurationSeconds.
    const listPath = join(work, "frames.txt");
    const lines = framePaths.flatMap(path => [concatEntry(path), `duration ${frameDurationSeconds}`]);
    lines.push(concatEntry(framePaths[framePaths.length - 1]!));
    await writeFile(listPath, `${lines.join("\n")}\n`);

    const scaleToFit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    const holdFrames = Math.max(1, Math.round(frameDurationSeconds * fps));
    let filter: string;
    if (cameraMotion === "none") {
      filter = `${scaleToFit},fps=${fps}`;
    } else if (cameraMotion === "zoom") {
      // Each still zooms from 1.0x to 1.15x over its own hold, then snaps to the next frame. `on` counts frames after fps conversion.
      filter = `${scaleToFit},fps=${fps},zoompan=z='1+0.15*mod(on,${holdFrames})/${holdFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps},setsar=1`;
    } else {
      // Pan: cover a 25% larger frame, then slide a window across it once per hold.
      const panWidth = Math.ceil((width * 1.25) / 2) * 2;
      const panHeight = Math.ceil((height * 1.25) / 2) * 2;
      filter = `scale=${panWidth}:${panHeight}:force_original_aspect_ratio=increase,crop=${panWidth}:${panHeight},fps=${fps},crop=${width}:${height}:x='(in_w-${width})*mod(t,${frameDurationSeconds})/${frameDurationSeconds}':y='(in_h-${height})/2',setsar=1`;
    }

    const durationSeconds = framePaths.length * frameDurationSeconds;
    await run([
      "-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", listPath,
      "-vf", filter, "-t", durationSeconds.toFixed(3),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath,
    ], options.ffmpegPath, work, options);
    await access(outputPath);
    return { outputPath, durationSeconds };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Replaces the source audio with per-speaker tracks mixed at their offsets; the source video is copied unchanged. */
export async function dubMultivoice(options: { sourcePath: string; segments: MultivoiceTrack[]; outputPath: string; ffmpegPath?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<{ outputPath: string }> {
  const { sourcePath, segments, outputPath } = options;
  if (!segments.length || segments.length > 200) throw new Error("Multivoice dubbing needs between 1 and 200 speaker tracks");
  for (const segment of segments) {
    if (!Number.isFinite(segment.start) || segment.start < 0 || !Number.isFinite(segment.end) || segment.end < segment.start) throw new Error("Multivoice tracks need non-negative start offsets");
    await access(segment.audioPath);
  }
  await access(sourcePath);
  const durationSeconds = await probeDuration(sourcePath, options.ffmpegPath, options);
  const args = ["-y", "-i", sourcePath];
  for (const segment of segments) args.push("-i", segment.audioPath);
  const filters = segments.map((segment, index) => {
    const delay = Math.round(segment.start * 1000);
    return `[${index + 1}:a]adelay=${delay}|${delay}[a${index}]`;
  });
  const mixInputs = segments.map((_, index) => `[a${index}]`).join("");
  // apad keeps the mixed track running; -t caps the output at the source video length.
  filters.push(`${mixInputs}amix=inputs=${segments.length}:duration=longest:normalize=0,apad[out]`);
  // The original audio is not mapped at all, which mutes it.
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "0:v?", "-map", "[out]",
    "-c:v", "copy", "-c:a", "aac", "-t", durationSeconds.toFixed(3), "-movflags", "+faststart", outputPath,
  );
  await run(args, options.ffmpegPath, undefined, options);
  await access(outputPath);
  return { outputPath };
}

/** Lays a voice track over the source audio, ducking the source under the voice, then muxes with the source video. */
export async function voiceover(options: { sourcePath: string; voicePath: string; outputPath: string; duckingDb?: number; ffmpegPath?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<{ outputPath: string }> {
  const { sourcePath, voicePath, outputPath } = options;
  const duckingDb = options.duckingDb ?? -12;
  if (!Number.isFinite(duckingDb) || duckingDb < -40 || duckingDb > 0) throw new Error("Ducking must be between -40 and 0 dB");
  await access(sourcePath);
  await access(voicePath);
  const durationSeconds = await probeDuration(sourcePath, options.ffmpegPath, options);
  // sidechaincompress has no dB parameter. The ratio is mapped from the requested reduction as an approximation:
  // ratio = 1 + |dB| / 2, bounded to [1, 20]. The exact resulting level is not guaranteed.
  const ratio = Math.min(20, Math.max(1, 1 + Math.abs(duckingDb) / 2));
  const filter = [
    "[1:a]asplit=2[voice][key]",
    `[0:a][key]sidechaincompress=threshold=0.02:ratio=${ratio.toFixed(2)}:attack=20:release=400[ducked]`,
    "[ducked][voice]amix=inputs=2:duration=longest:normalize=0,apad[out]",
  ].join(";");
  await run([
    "-y", "-i", sourcePath, "-i", voicePath,
    "-filter_complex", filter,
    "-map", "0:v?", "-map", "[out]",
    "-c:v", "copy", "-c:a", "aac", "-t", durationSeconds.toFixed(3), "-movflags", "+faststart", outputPath,
  ], options.ffmpegPath, undefined, options);
  await access(outputPath);
  return { outputPath };
}
