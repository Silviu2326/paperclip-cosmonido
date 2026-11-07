import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mediaStudioProviders } from "./media-studio-providers.js";

function runFfmpeg(args: string[], cwd?: string): Promise<string> {
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg exited ${code}: ${stderr}`)));
  });
}

describe("media studio provider ffmpeg boundary", () => {
  it("mixes mocked provider audio at the requested segment offsets", async () => {
    const folder = await mkdtemp(join(tmpdir(), "paperclip-media-provider-ffmpeg-test-"));
    try {
      const samplePath = join(folder, "sample.mp3");
      const outputPath = join(folder, "dub.mp3");
      await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3", "-c:a", "libmp3lame", "-q:a", "9", samplePath]);
      const sample = await readFile(samplePath);
      const providers = mediaStudioProviders({} as never, {
        secrets: {
          getByName: async () => ({ id: "secret" }),
          resolveSecretValue: async () => "test-only-key",
        } as never,
        fetch: async () => new Response(sample, { status: 200, headers: { "content-type": "audio/mpeg" } }),
      });

      const result = await providers.dub({
        companyId: "company-test",
        language: "es",
        voiceId: "voice-test",
        outputPath,
        segments: [
          { start: 0.3, end: 0.9, text: "primer segmento" },
          { start: 1.2, end: 1.8, text: "segundo segmento" },
        ],
      });

      const stat = await import("node:fs/promises").then(fs => fs.stat(outputPath));
      expect(stat.size).toBeGreaterThan(0);
      expect(result.provider).toBe("elevenlabs");
      const probe = await runFfmpeg(["-hide_banner", "-i", outputPath, "-f", "null", "-"]);
      const duration = Number(probe.match(/Duration: \d+:\d+:([\d.]+)/)?.[1]);
      expect(duration).toBeGreaterThan(1.4);
      expect(duration).toBeLessThan(2.2);
      const silence = await runFfmpeg(["-hide_banner", "-i", outputPath, "-af", "silencedetect=noise=-45dB:d=0.12", "-f", "null", "-"]);
      const silenceEnds = [...silence.matchAll(/silence_end: ([\d.]+)/g)].map(match => Number(match[1]));
      expect(silenceEnds.some(time => time > 0.15 && time < 0.5)).toBe(true);
      expect(silenceEnds.some(time => time > 1.0 && time < 1.5)).toBe(true);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }, 30_000);
});
