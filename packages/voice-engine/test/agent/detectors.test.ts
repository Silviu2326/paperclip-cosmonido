import { describe, expect, it } from "vitest";
import { SilenceEndOfTurnDetector } from "../../src/agent/end-of-turn.js";
import { EnergyVad } from "../../src/agent/vad.js";
import { int16ArrayToPcm16 } from "../../src/agent/codecs.js";
describe("agent detectors", () => {
  it("uses language cues to lengthen continuation silence", async () => { const d = new SilenceEndOfTurnDetector(); expect((await d.analyze({ transcript: "I think,", silenceMs: 700, language: "en" })).endOfTurn).toBe(false); expect((await d.analyze({ transcript: "Ya terminé.", silenceMs: 300, language: "es" })).endOfTurn).toBe(true); });
  it("applies VAD start and end hysteresis", () => { const vad = new EnergyVad({ startFrames: 2, endFrames: 2 }); const loud = { data: int16ArrayToPcm16(Int16Array.from({ length: 320 }, () => 12000)), encoding: "pcm16" as const, sampleRate: 16000, channels: 1 as const }; const quiet = { ...loud, data: new Uint8Array(640) }; expect(vad.process(loud).isSpeech).toBe(false); expect(vad.process(loud).isSpeech).toBe(true); vad.process(quiet); expect(vad.process(quiet).isSpeech).toBe(false); });
});
