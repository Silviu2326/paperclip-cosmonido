import type { AgentAudioFrame, VoiceActivityDetector } from "./types.js";
import { convertFrame, pcm16ToInt16Array } from "./codecs.js";

export interface EnergyVadOptions { onThresholdDb?: number; offThresholdDb?: number; startFrames?: number; endFrames?: number; noiseFloorDb?: number; adaptation?: number; }
/** Energy-based VAD with an adaptive floor and separate start/stop hysteresis. */
export class EnergyVad implements VoiceActivityDetector {
  private above = 0; private below = 0; private speech = false; private floor: number;
  readonly options: Required<EnergyVadOptions>;
  constructor(options: EnergyVadOptions = {}) { this.options = { onThresholdDb: -38, offThresholdDb: -45, startFrames: 3, endFrames: 8, noiseFloorDb: -58, adaptation: 0.04, ...options }; this.floor = this.options.noiseFloorDb; }
  process(frame: AgentAudioFrame): { probability: number; isSpeech: boolean } {
    const pcm = frame.encoding === "pcm16" ? frame : convertFrame(frame, { encoding: "pcm16", sampleRate: frame.sampleRate });
    const samples = pcm16ToInt16Array(pcm.data); const rms = samples.length ? Math.sqrt(samples.reduce((a, x) => a + x * x, 0) / samples.length) : 0;
    const db = 20 * Math.log10(Math.max(rms, 1) / 32768); const aboveFloor = db - this.floor;
    const probability = Math.max(0, Math.min(1, (aboveFloor + 3) / 24));
    if (!this.speech) this.floor += this.options.adaptation * (Math.min(db, this.floor + 2) - this.floor);
    if (db >= Math.max(this.options.onThresholdDb, this.floor + 8)) { this.above++; this.below = 0; if (this.above >= this.options.startFrames) this.speech = true; }
    else if (db <= Math.max(this.options.offThresholdDb, this.floor + 4)) { this.below++; this.above = 0; if (this.below >= this.options.endFrames) this.speech = false; }
    else { this.above = 0; this.below = 0; }
    return { probability, isSpeech: this.speech };
  }
  reset(): void { this.above = 0; this.below = 0; this.speech = false; this.floor = this.options.noiseFloorDb; }
}
/** Adapt a caller supplied speech probability model to the agent VAD interface. */
export function createVadFromProbability(fn: (frame: AgentAudioFrame) => number | Promise<number>): VoiceActivityDetector {
  let previous = false;
  return { process(frame) { const result = fn(frame); if (typeof result !== "number") throw new TypeError("Async probability models must be adapted before synchronous VAD use"); const probability = Math.max(0, Math.min(1, result)); previous = probability >= 0.5; return { probability, isSpeech: previous }; }, reset() { previous = false; } };
}
