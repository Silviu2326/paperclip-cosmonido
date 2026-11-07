import { spawn } from "node:child_process";
import { access, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ASSETS = 200;
const MAX_SPEC_DEPTH = 100;
const MAX_SPEC_NODES = 50_000;
const MAX_VIDEO_SECONDS = 60 * 60;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024;
const OUTPUT_BUFFER_BYTES = 1024 * 1024;

export function motorVideoAssetIds(spec: unknown): string[] {
  const ids = new Set<string>();
  let visited = 0;
  const visit = (value: unknown, path: string[], depth: number): void => {
    if (++visited > MAX_SPEC_NODES || depth > MAX_SPEC_DEPTH) throw new Error("Video specification is too complex");
    if (Array.isArray(value)) {
      for (const item of value) visit(item, path, depth + 1);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (Object.hasOwn(object, "asset")) {
      if (typeof object.asset !== "string" || !UUID.test(object.asset)) {
        throw new Error("Every video asset reference must be a Paperclip asset UUID");
      }
      if (Object.keys(object).length !== 1) throw new Error("Video asset references must contain only an asset UUID");
      ids.add(object.asset.toLowerCase());
      if (ids.size > MAX_ASSETS) throw new Error(`A video may reference at most ${MAX_ASSETS} assets`);
    }
    for (const [key, child] of Object.entries(object)) {
      if (key === "generate" && !(path[0] === "audio" && path[1] === "music")) {
        throw new Error("AI image generation is not available in this video action; provide an authorized image asset instead");
      }
      visit(child, [...path, key], depth + 1);
    }
  };
  visit(spec, [], 0);

  const audio = (spec as { audio?: unknown } | null)?.audio;
  if (audio && typeof audio === "object" && !Array.isArray(audio)) {
    const audioObject = audio as Record<string, unknown>;
    if ((Array.isArray(audioObject.lines) && audioObject.lines.length > 0)
      || (audioObject.cast && typeof audioObject.cast === "object" && Object.keys(audioObject.cast).length > 0)) {
      throw new Error("Speech synthesis is not available in this video action; add a voice-generation permission first");
    }
    const voiceover = audioObject.voiceover;
    if (voiceover && typeof voiceover === "object" && !Array.isArray(voiceover) && Object.hasOwn(voiceover, "text")) {
      throw new Error("Generated voiceovers are not available in this video action; provide an authorized audio asset instead");
    }
  }

  return [...ids];
}

export function rewriteMotorVideoAssets(spec: unknown, assetPaths: ReadonlyMap<string, string>): unknown {
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (Object.hasOwn(object, "asset")) {
      const id = typeof object.asset === "string" ? object.asset.toLowerCase() : "";
      const path = assetPaths.get(id);
      if (!path) throw new Error("Video specification references an unavailable asset");
      return { asset: path };
    }
    return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, rewrite(child)]));
  };
  return rewrite(spec);
}

export function estimateMotorVideoDurationSeconds(spec: unknown): number {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Video specification must be a JSON object");
  const scenes = (spec as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error("Video specification must include at least one scene");
  let seconds = 0;
  for (const [index, scene] of scenes.entries()) {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) throw new Error("Video specification contains an invalid scene");
    const record = scene as Record<string, unknown>;
    if (typeof record.durationSeconds !== "number" || !Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0) {
      throw new Error("Video duration must be explicit; automatic scene durations cannot be quota-admitted");
    }
    const transition = record.transitionIn && typeof record.transitionIn === "object"
      ? (record.transitionIn as Record<string, unknown>).durationSeconds
      : 0;
    if (transition !== undefined && (typeof transition !== "number" || !Number.isFinite(transition) || transition < 0)) {
      throw new Error("Video specification contains an invalid transition duration");
    }
    seconds += record.durationSeconds - (index === 0 ? 0 : Number(transition ?? 0));
    if (seconds <= 0 || seconds > MAX_VIDEO_SECONDS) throw new Error("Video duration must be between 1 frame and 60 minutes");
  }
  return seconds;
}

export async function renderWithMotorVideo(input: {
  spec: unknown;
  folder: string;
  assetPaths: ReadonlyMap<string, string>;
  signal?: AbortSignal;
  onProcessStart?: () => void;
  onProgress?: (progress: { stage: string; frame: number; totalFrames: number }) => void;
}): Promise<{ outputPath: string; durationSeconds: number }> {
  const entry = process.env.PAPERCLIP_MOTOR_VIDEO_ENTRY;
  if (input.signal?.aborted) throw input.signal.reason ?? new Error("Motor-video render was cancelled");
  if (!entry || !isAbsolute(entry)) throw new Error("Motor-video is not configured: set PAPERCLIP_MOTOR_VIDEO_ENTRY to its installed CLI entry point");
  await access(entry);
  const browser = process.env.PAPERCLIP_MOTOR_VIDEO_BROWSER;
  if (browser && !isAbsolute(browser)) throw new Error("PAPERCLIP_MOTOR_VIDEO_BROWSER must be an absolute executable path");
  if (browser) await access(browser);

  const specPath = join(input.folder, "video-spec.json");
  const outputPath = join(input.folder, "motor-video-output.mp4");
  const workDir = join(input.folder, "motor-video-work");
  await writeFile(specPath, `${JSON.stringify(rewriteMotorVideoAssets(input.spec, input.assetPaths))}\n`, { encoding: "utf8", mode: 0o600 });
  const args = [entry, "render", specPath, "--output", outputPath, "--work-dir", workDir, "--qa"];
  if (browser) args.push("--browser", browser);

  const configuredTimeout = Number(process.env.PAPERCLIP_MOTOR_VIDEO_TIMEOUT_MS);
  const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout >= 60_000 && configuredTimeout <= 3_600_000
    ? configuredTimeout
    : 1_800_000;
  const child = spawn(process.execPath, args, { cwd: input.folder, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  input.onProcessStart?.();
  let stdout = "";
  let stderr = "";
  let stdoutOverflow = false;
  let currentStage = "";
  const appendLimited = (current: string, chunk: Buffer, isStdout: boolean): string => {
    const next = current + chunk.toString("utf8");
    if (Buffer.byteLength(next, "utf8") <= OUTPUT_BUFFER_BYTES) return next;
    if (isStdout) stdoutOverflow = true;
    return next.slice(-OUTPUT_BUFFER_BYTES);
  };
  child.stdout.on("data", (chunk: Buffer) => { stdout = appendLimited(stdout, chunk, true); });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendLimited(stderr, chunk, false);
    const lastLine = chunk.toString("utf8").split(/\r?\n/).filter(Boolean).at(-1);
    const match = lastLine?.match(/^([a-z_]+):\s*(\d+)\/(\d+)$/);
    if (match && match[1] !== currentStage) {
      currentStage = match[1]!;
      input.onProgress?.({ stage: currentStage, frame: Number(match[2]), totalFrames: Number(match[3]) });
    }
  });

  let timedOut = false;
  let abortRequested = false;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    forceKillTimer.unref();
  };
  const onAbort = () => { abortRequested = true; terminate(); };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
  timeout.unref();
  try {
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (forceKillTimer) clearTimeout(forceKillTimer);
        resolve({ code, signal });
      });
    });
    if (timedOut) throw new Error(`Motor-video render exceeded the ${Math.round(timeoutMs / 60_000)} minute limit`);
    if (abortRequested || input.signal?.aborted) throw new Error("Motor-video render was cancelled");
    if (exit.code !== 0) {
      const detail = stderr.trim().slice(-4000);
      throw new Error(`Motor-video render failed${exit.signal ? ` (${exit.signal})` : ` (exit ${exit.code})`}${detail ? `: ${detail}` : ""}`);
    }
    const outputStat = await stat(outputPath);
    if (!outputStat.isFile() || outputStat.size <= 0 || outputStat.size > MAX_OUTPUT_BYTES) throw new Error("Motor-video produced an invalid output file");
    let result: unknown;
    try { result = JSON.parse(stdout) as unknown; } catch { throw new Error("Motor-video returned an invalid render receipt"); }
    const durationSeconds = result && typeof result === "object" && typeof (result as { durationSeconds?: unknown }).durationSeconds === "number"
      ? (result as { durationSeconds: number }).durationSeconds
      : null;
    const qaPassed = result && typeof result === "object" && (result as { qa?: { passed?: unknown } }).qa?.passed === true;
    if (stdoutOverflow || !qaPassed || durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_VIDEO_SECONDS) {
      throw new Error("Motor-video returned an incomplete render receipt");
    }
    return { outputPath, durationSeconds };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}
