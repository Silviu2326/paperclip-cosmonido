import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectSilences, findFillerRanges, probeDuration, removeFillers, renderMedia, retimeSubtitles } from "../src/index.js";

const dirs: string[] = [];
async function ffmpeg(args: string[]) {
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.env.FFMPEG_PATH ?? "ffmpeg",args,{windowsHide:true});let stderr="";
    child.stderr.on("data",chunk=>stderr+=String(chunk));child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(stderr)));
  });
}
async function fixture() {
  const dir=await mkdtemp(join(tmpdir(),"paperclip-media-fixture-"));dirs.push(dir);const source=join(dir,"source.mp4");
  await ffmpeg(["-y","-f","lavfi","-i","color=c=blue:s=320x240:r=15:d=2","-f","lavfi","-i","sine=frequency=500:sample_rate=44100:duration=2","-filter_complex","[1:a]volume=0:enable='between(t,0.8,1.3)'[a]","-map","0:v","-map","[a]","-c:v","libx264","-c:a","aac",source]);return {dir,source};
}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});

describe("media renderer",()=>{
  it("finds punctuation-insensitive phrase fillers and removes their tokens", () => {
    const segments = [
      { start: 0, end: 0.2, text: "O," },
      { start: 0.2, end: 0.45, text: "SEA!" },
      { start: 0.5, end: 0.7, text: "continuamos." },
    ];
    expect(findFillerRanges(segments, ["o sea"])).toEqual([{ start: 0, end: 0.45, text: "O, SEA!" }]);
    expect(removeFillers(segments, ["o sea"])).toEqual([segments[2]]);
  });

  it("removes simple fillers, merges overlapping long matches, and leaves incomplete or paused phrases", () => {
    const segments = [
      { start: 0, end: 0.1, text: "Eh..." },
      { start: 0.2, end: 0.4, text: "o" },
      { start: 0.4, end: 0.6, text: "sea," },
      { start: 0.7, end: 0.9, text: "o" },
      { start: 2, end: 2.2, text: "sea" },
      { start: 2.3, end: 2.5, text: "bueno" },
    ];
    expect(findFillerRanges(segments, ["eh", "o sea", "sea o", "sea bueno"])).toEqual([
      { start: 0, end: 0.1, text: "Eh..." },
      { start: 0.2, end: 0.9, text: "o sea, o" },
      { start: 2, end: 2.5, text: "sea bueno" },
    ]);
    expect(findFillerRanges(segments.slice(1, 3), ["o sea"])).toHaveLength(1);
    expect(findFillerRanges([segments[1]!], ["o sea"])).toEqual([]);
    expect(findFillerRanges([
      { start: 0, end: 0.2, text: "o" },
      { start: 1.3, end: 1.5, text: "sea" },
    ], ["o sea"])).toEqual([]);
    expect(removeFillers(segments, ["eh", "o sea", "sea o", "sea bueno"])).toEqual([]);
  });

  it("detects an inserted silent range and renders an aspect export",async()=>{
    const {dir,source}=await fixture();const silences=await detectSilences(source,{thresholdDb:-35,minDurationMs:250});
    expect(silences.some(s=>s.end-s.start>=0.2)).toBe(true);
    const output=join(dir,"vertical.mp4");await renderMedia({sourcePath:source,operations:[{type:"export",aspect:"9:16",cropMode:"center"}]},output);
    expect((await stat(output)).size).toBeGreaterThan(1000);
    const duration=await probeDuration(output);expect(duration).toBeGreaterThan(1.8);expect(duration).toBeLessThan(2.2);
  });
  it("renders valid burned subtitles and applies transcript-timed cuts",async()=>{
    const {dir,source}=await fixture();const output=join(dir,"edited.mp4");
    await renderMedia({sourcePath:source,operations:[
      {type:"cut_ranges",ranges:[{start:0.5,end:1}]},
      {type:"burn_subtitles",style:{size:20,color:"#ffffff",highlightColor:"#ffff00",position:"bottom"},subtitles:[{start:0.1,end:0.4,text:"Hello media"}]},
    ]},output);
    expect((await stat(output)).size).toBeGreaterThan(1000);const duration=await probeDuration(output);expect(duration).toBeGreaterThan(0.8);expect(duration).toBeLessThan(1.8);
  });

  it("uses distinct intermediates for repeated exports and subtitle operations", async () => {
    const { dir, source } = await fixture();
    const output = join(dir, "repeated-operations.mp4");
    await renderMedia({ sourcePath: source, operations: [
      { type: "export", aspect: "9:16", cropMode: "center" },
      { type: "burn_subtitles", style: { size: 20, color: "#ffffff", position: "bottom" }, subtitles: [{ start: 0.1, end: 0.5, text: "First" }] },
      { type: "export", aspect: "16:9", cropMode: "center" },
      { type: "burn_subtitles", style: { size: 20, color: "#ffff00", position: "top" }, subtitles: [{ start: 1, end: 1.5, text: "Second" }] },
    ] }, output);
    expect((await stat(output)).size).toBeGreaterThan(1000);
    const duration = await probeDuration(output);
    expect(duration).toBeGreaterThan(1.8);
    expect(duration).toBeLessThan(2.2);
  });

  it("retimes original-timeline subtitle cues across kept segments", async () => {
    const { dir, source } = await fixture();
    const keptSegments = [
      { start: 0, end: 0.5, timelineStart: 0 },
      { start: 1, end: 2, timelineStart: 0.5 },
    ];
    expect(retimeSubtitles([{ start: 0.25, end: 1.25, text: "crosses cut" }], keptSegments)).toEqual([
      { start: 0.25, end: 0.5, text: "crosses cut" },
      { start: 0.5, end: 0.75, text: "crosses cut" },
    ]);

    const output = join(dir, "retimed-subtitle.mp4");
    await renderMedia({ sourcePath: source, operations: [
      { type: "cut_ranges", ranges: [{ start: 0.5, end: 1 }] },
      { type: "burn_subtitles", style: { size: 20, color: "#ffffff", position: "bottom" }, subtitles: [{ start: 1.2, end: 1.5, text: "original time" }] },
    ] }, output);
    expect((await stat(output)).size).toBeGreaterThan(1000);
    const duration = await probeDuration(output);
    expect(duration).toBeGreaterThan(1.3);
    expect(duration).toBeLessThan(1.8);
  });

  it("pads replacement audio to the original video timeline before cuts", async () => {
    const { dir, source } = await fixture();
    const replacementAudio = join(dir, "short-audio.m4a");
    await ffmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=44100:duration=0.4", "-c:a", "aac", replacementAudio]);
    const output = join(dir, "audio-with-cut.mp4");
    await renderMedia({ sourcePath: source, operations: [
      { type: "cut_ranges", ranges: [{ start: 0.5, end: 0.8 }] },
      { type: "replace_audio", assetId: "short-audio" },
    ] }, output, { resolveAsset: async () => replacementAudio });
    const duration = await probeDuration(output);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(1.9);
  });

  it("kills a real ffmpeg process when the render deadline expires", async () => {
    const { dir, source } = await fixture();
    await expect(renderMedia({ sourcePath: source, operations: [{ type: "export", aspect: "9:16", cropMode: "center" }] }, join(dir, "deadline.mp4"), { timeoutMs: 1 }))
      .rejects.toThrow(/ffmpeg timed out after 1 ms/);
  });
});
