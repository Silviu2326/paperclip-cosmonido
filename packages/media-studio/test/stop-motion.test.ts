import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dubMultivoice, probeDuration, stopMotion, voiceover } from "../src/index.js";

const dirs: string[] = [];

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.once("error", reject);
    child.once("close", code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
}

// Detect ffmpeg once; the ffmpeg-backed case is skipped (not failed) when the binary is not installed.
const ffmpegAvailable = await new Promise<boolean>(resolve => {
  const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", ["-version"], { windowsHide: true, stdio: "ignore" });
  child.once("error", () => resolve(false));
  child.once("close", code => resolve(code === 0));
});

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe.skipIf(!ffmpegAvailable)("stop motion operation", () => {
  it("builds a video whose duration is frames x frame duration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperclip-stop-motion-test-"));
    dirs.push(dir);
    const colors = ["red", "green", "blue"];
    const framePaths = colors.map((_, index) => join(dir, `frame-${index}.png`));
    for (const [index, color] of colors.entries()) {
      await runFfmpeg(["-y", "-f", "lavfi", "-i", `color=c=${color}:s=64x64`, "-frames:v", "1", framePaths[index]!]);
    }

    const outputPath = join(dir, "stop-motion.mp4");
    const result = await stopMotion({
      framePaths,
      frameDurationSeconds: 0.5,
      cameraMotion: "none",
      outputPath,
      width: 360,
      height: 640,
    });

    expect(result).toEqual({ outputPath, durationSeconds: 1.5 });
    expect((await stat(outputPath)).size).toBeGreaterThan(1000);
    const duration = await probeDuration(outputPath);
    expect(duration).toBeGreaterThan(1.4);
    expect(duration).toBeLessThan(1.6);
  }, 60_000);

  it("renders zoom and pan motion with the same frame-based duration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperclip-stop-motion-motion-test-"));
    dirs.push(dir);
    const framePaths = ["red", "blue"].map((color, index) => join(dir, `frame-${index}.png`));
    for (const [index, color] of ["red", "blue"].entries()) {
      await runFfmpeg(["-y", "-f", "lavfi", "-i", `color=c=${color}:s=64x64`, "-frames:v", "1", framePaths[index]!]);
    }
    for (const cameraMotion of ["zoom", "pan"] as const) {
      const outputPath = join(dir, `${cameraMotion}.mp4`);
      await stopMotion({ framePaths, frameDurationSeconds: 0.5, cameraMotion, outputPath, width: 360, height: 640 });
      const duration = await probeDuration(outputPath);
      expect(duration, cameraMotion).toBeGreaterThan(0.9);
      expect(duration, cameraMotion).toBeLessThan(1.1);
    }
  }, 60_000);

  it("mixes multivoice tracks over muted source audio and ducks a voiceover under the source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperclip-media-v3-mix-test-"));
    dirs.push(dir);
    const source = join(dir, "source.mp4");
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "color=c=green:s=160x120:r=15:d=2", "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=44100:duration=2", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "aac", source]);
    const track = join(dir, "speaker.mp3");
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=600:duration=0.5", "-c:a", "libmp3lame", track]);
    const dubbed = join(dir, "dubbed.mp4");
    await dubMultivoice({ sourcePath: source, segments: [{ start: 0.5, end: 1, speaker: "host", audioPath: track }], outputPath: dubbed });
    expect(await probeDuration(dubbed)).toBeGreaterThan(1.8);

    const voice = join(dir, "voice.mp3");
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=900:duration=1", "-c:a", "libmp3lame", voice]);
    const voiced = join(dir, "voiced.mp4");
    await voiceover({ sourcePath: source, voicePath: voice, outputPath: voiced, duckingDb: -12 });
    const voicedDuration = await probeDuration(voiced);
    expect(voicedDuration).toBeGreaterThan(1.8);
    expect(voicedDuration).toBeLessThan(2.2);
  }, 60_000);

  it("rejects an empty frame list and out-of-range frame durations before running ffmpeg", async () => {
    await expect(stopMotion({ framePaths: [], frameDurationSeconds: 0.5, cameraMotion: "none", outputPath: "unused.mp4" }))
      .rejects.toThrow(/between 1 and 200 frames/);
    await expect(stopMotion({ framePaths: ["unused.png"], frameDurationSeconds: 0.01, cameraMotion: "none", outputPath: "unused.mp4" }))
      .rejects.toThrow(/Frame duration/);
  });
});
