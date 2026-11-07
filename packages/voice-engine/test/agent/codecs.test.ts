import { describe, expect, it } from "vitest";
import { alawToPcm16, convertFrame, int16ArrayToPcm16, mulawToPcm16, pcm16ToAlaw, pcm16ToInt16Array, pcm16ToMulaw, resamplePcm16 } from "../../src/agent/codecs.js";
describe("agent codecs", () => {
  it("round trips companded samples within expected quantization", () => { for (const x of [-20000, -4000, 0, 4000, 20000]) { expect(Math.abs(mulawToPcm16(pcm16ToMulaw(x)) - x)).toBeLessThan(1400); expect(Math.abs(alawToPcm16(pcm16ToAlaw(x)) - x)).toBeLessThan(1000); } });
  it("resamples and respects odd byte offsets", () => { const src = int16ArrayToPcm16(Int16Array.from([0, 1000, 2000, 3000])); expect(resamplePcm16(src, 8000, 16000).length).toBe(16); const odd = new Uint8Array(src.length + 1); odd.set(src, 1); expect(pcm16ToInt16Array(odd.subarray(1))).toEqual(Int16Array.from([0, 1000, 2000, 3000])); });
  it("converts frame encoding", () => { expect(convertFrame({ data: Uint8Array.from([255]), encoding: "mulaw", sampleRate: 8000, channels: 1 }, { encoding: "pcm16", sampleRate: 8000 }).data.length).toBe(2); });
});
