import type { AgentAudioEncoding, AgentAudioFrame } from "./types.js";

/** Decode one mu-law sample to signed PCM16. */
export function mulawToPcm16(value: number): number {
  const u = (~value) & 0xff;
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  return (u & 0x80) ? 0x84 - t : t - 0x84;
}
/** Encode signed PCM16 to one mu-law byte. */
export function pcm16ToMulaw(sample: number): number {
  let s = Math.max(-32635, Math.min(32635, Math.trunc(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s += 0x84;
  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (s & mask) === 0; exponent--, mask >>= 1) { /* find segment */ }
  return (~(sign | (exponent << 4) | ((s >> (exponent + 3)) & 0x0f))) & 0xff;
}
/** Decode one A-law sample to signed PCM16. */
export function alawToPcm16(value: number): number {
  const a = (value ^ 0x55) & 0xff;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8;
  else if (seg === 1) t += 0x108;
  else { t += 0x108; t <<= seg - 1; }
  return (a & 0x80) ? t : -t;
}
/** Encode signed PCM16 to one A-law byte. */
export function pcm16ToAlaw(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.trunc(sample)));
  const mask = s >= 0 ? 0xd5 : 0x55;
  if (s < 0) s = -s - 1;
  let seg = 0;
  for (let v = s >> 4; v > 15 && seg < 7; v >>= 1) seg++;
  const aval = (seg << 4) | ((seg < 2 ? (s >> 4) : (s >> (seg + 3))) & 0x0f);
  return aval ^ mask;
}

/** View little-endian PCM16 bytes, including unaligned or sliced buffers. */
export function pcm16ToInt16Array(data: Uint8Array): Int16Array {
  const out = new Int16Array(Math.floor(data.byteLength / 2));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}
/** Alias for reading little-endian PCM16 samples. */
export const pcm16ToInt16 = pcm16ToInt16Array;
/** Encode samples as little-endian PCM16 bytes. */
export function int16ArrayToPcm16(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2); const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i]!, true);
  return out;
}
/** Alias for writing little-endian PCM16 bytes. */
export const int16ToPcm16 = int16ArrayToPcm16;

/** Resample PCM16 with linear interpolation and a short averaging filter when reducing rate. */
export function resamplePcm16(data: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) throw new RangeError("Sample rates must be positive");
  const input = pcm16ToInt16Array(data);
  if (fromRate === toRate || input.length === 0) return int16ArrayToPcm16(input);
  const length = Math.max(1, Math.round(input.length * toRate / fromRate));
  const filtered = fromRate > toRate ? input.map((_, i) => Math.round(((input[Math.max(0, i - 1)] ?? 0) + 2 * input[i]! + (input[Math.min(input.length - 1, i + 1)] ?? 0)) / 4)) : input;
  const output = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * fromRate / toRate; const lo = Math.min(filtered.length - 1, Math.floor(pos)); const hi = Math.min(filtered.length - 1, lo + 1); const f = pos - lo;
    output[i] = Math.max(-32768, Math.min(32767, Math.round(filtered[lo]! * (1 - f) + filtered[hi]! * f)));
  }
  return int16ArrayToPcm16(output);
}

/** Convert an audio frame to PCM16 at the requested format. */
export function convertFrame(frame: AgentAudioFrame, target: { encoding: AgentAudioEncoding; sampleRate: number }): AgentAudioFrame {
  let pcm: Uint8Array;
  if (frame.encoding === "pcm16") pcm = frame.data;
  else { const samples = Int16Array.from(frame.data, b => frame.encoding === "mulaw" ? mulawToPcm16(b) : alawToPcm16(b)); pcm = int16ArrayToPcm16(samples); }
  if (frame.sampleRate !== target.sampleRate) pcm = resamplePcm16(pcm, frame.sampleRate, target.sampleRate);
  let data = pcm;
  if (target.encoding !== "pcm16") { const samples = pcm16ToInt16Array(pcm); data = Uint8Array.from(samples, s => target.encoding === "mulaw" ? pcm16ToMulaw(s) : pcm16ToAlaw(s)); }
  return { data, encoding: target.encoding, sampleRate: target.sampleRate, channels: 1, timestampMs: frame.timestampMs };
}
/** Return frame loudness as RMS amplitude in PCM units. */
export function rmsPcm16(data: Uint8Array): number { const s = pcm16ToInt16Array(data); return s.length ? Math.sqrt(s.reduce((sum, x) => sum + x * x, 0) / s.length) : 0; }
/** Return peak absolute PCM amplitude. */
export function peakPcm16(data: Uint8Array): number { let p = 0; for (const x of pcm16ToInt16Array(data)) p = Math.max(p, Math.abs(x)); return p; }
/** RMS helper for PCM16 byte frames. */
export const rms = rmsPcm16;
/** Peak helper for PCM16 byte frames. */
export const peak = peakPcm16;
/** Estimate frame duration from byte count, encoding, and rate. */
export function frameDurationMs(frame: Pick<AgentAudioFrame, "data" | "encoding" | "sampleRate">): number { return frame.data.byteLength / (frame.encoding === "pcm16" ? 2 : 1) / frame.sampleRate * 1000; }
