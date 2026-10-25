import type { AudioFormat } from "../../core/types.js";
import { invalid } from "./http.js";

/** Translate engine containers into Cartesia's native output settings. */
export function audioFormat(input: AudioFormat = { container: "wav" }) {
  const format = { ...input, sampleRate: input.sampleRate ?? (input.container === "mulaw" || input.container === "alaw" ? 8000 : 24000), channels: 1 as const };
  if (input.channels === 2) invalid("Cartesia produces mono audio", "unsupported");
  if (!Number.isInteger(format.sampleRate) || format.sampleRate < 8000 || format.sampleRate > 48000) invalid("Cartesia sample rate must be 8000..48000");
  if (input.bitDepth === 24) invalid("Cartesia does not support 24-bit PCM", "unsupported");
  if (!["wav", "pcm", "mp3", "mulaw", "alaw"].includes(format.container)) invalid("Unsupported Cartesia audio format", "unsupported");
  const container = format.container === "pcm" || format.container === "mulaw" || format.container === "alaw" ? "raw" : format.container;
  const encoding = format.container === "mulaw" ? "pcm_mulaw" : format.container === "alaw" ? "pcm_alaw" : input.bitDepth === 32 ? "pcm_f32le" : "pcm_s16le";
  if (format.container === "wav" || format.container === "pcm") format.bitDepth = input.bitDepth ?? 16;
  const output: Record<string, unknown> = { container, sample_rate: format.sampleRate };
  if (container !== "mp3") output.encoding = encoding;
  if (container === "mp3") {
    format.bitrate = input.bitrate ?? 128;
    output.bit_rate = format.bitrate * 1000;
  }
  if (input.bitrate !== undefined) {
    if (container !== "mp3") invalid("Cartesia bit rate is only supported for MP3", "unsupported");
    output.bit_rate = input.bitrate * 1000;
  }
  const mimeType = format.container === "mp3" ? "audio/mpeg" : format.container === "wav" ? "audio/wav" : format.container === "pcm" ? "audio/pcm" : `audio/${format.container}`;
  return { format, output, mimeType };
}

/** Wrap buffered SSE PCM in a single WAV file with its actual byte length. */
export function wav(data: Uint8Array, format: AudioFormat): Uint8Array {
  const bits = format.bitDepth ?? 16;
  const result = new Uint8Array(44 + data.length);
  const view = new DataView(result.buffer);
  const label = (offset: number, text: string) => result.set(new TextEncoder().encode(text), offset);
  label(0, "RIFF"); view.setUint32(4, data.length + 36, true); label(8, "WAVE"); label(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, bits === 32 ? 3 : 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, format.sampleRate ?? 24000, true); view.setUint32(28, (format.sampleRate ?? 24000) * bits / 8, true);
  view.setUint16(32, bits / 8, true); view.setUint16(34, bits, true); label(36, "data"); view.setUint32(40, data.length, true);
  result.set(data, 44);
  return result;
}
