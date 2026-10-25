import { describe, expect, it } from "vitest";
import { formatSubtitles } from "../../src/cli/subtitles.js";

describe("subtitle formatter", () => {
  it("writes numbered SRT cues with comma milliseconds", () => {
    expect(formatSubtitles([{ text: "Hola", startMs: 1250, endMs: 2400 }], "srt")).toBe("1\n00:00:01,250 --> 00:00:02,400\nHola\n");
  });
  it("writes a WebVTT header and dot milliseconds", () => {
    expect(formatSubtitles([{ text: "Hello", startMs: 0, endMs: 100 }], "vtt")).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:00.100\nHello\n");
  });
  it("ignores malformed and empty cues", () => {
    expect(formatSubtitles([{ text: "", startMs: 0, endMs: 1 }, { text: "bad", startMs: 2, endMs: 1 }], "srt")).toBe("");
  });
});
