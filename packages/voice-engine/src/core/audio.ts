import { VoiceEngineError } from "./errors.js";
import type { AudioContainer, AudioFormat, AudioOutput } from "./types.js";

/** Default synthesis output: MPEG audio at 44.1 kHz and 128 kbps. */
export const DEFAULT_FORMAT: AudioFormat = Object.freeze({ container: "mp3", sampleRate: 44100, bitrate: 128 });
const MIME: Record<AudioContainer, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", pcm: "audio/pcm", opus: "audio/opus", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", mulaw: "audio/basic", alaw: "audio/x-alaw",
};

/** Return the MIME type associated with an audio format or container. */
export function mimeTypeFor(format: AudioFormat | AudioContainer): string { return MIME[typeof format === "string" ? format : format.container]; }

/** Infer an audio format from a MIME type, ignoring parameters. */
export function formatFromMimeType(mime: string): AudioFormat | undefined {
  const value = mime.split(";")[0].trim().toLowerCase();
  const aliases: Record<string, AudioContainer> = { "audio/mp3": "mp3", "audio/x-wav": "wav", "audio/wave": "wav", "audio/x-flac": "flac", "audio/l16": "pcm", "audio/x-mulaw": "mulaw" };
  const container = aliases[value] ?? (Object.entries(MIME).find(([, type]) => type === value)?.[0] as AudioContainer | undefined);
  return container ? { container } : undefined;
}

/** Build a 44-byte little-endian PCM WAV header for the given payload length. */
export function wavHeader(dataLength: number, sampleRateOrFormat: number | AudioFormat = 44100, channels: 1 | 2 = 1, bitDepth: 16 | 24 | 32 = 16): Uint8Array {
  const format = typeof sampleRateOrFormat === "number" ? { sampleRate: sampleRateOrFormat, channels, bitDepth } : sampleRateOrFormat;
  const rate = format.sampleRate ?? 44100, count = format.channels ?? 1, bits = format.bitDepth ?? 16;
  if (!Number.isSafeInteger(dataLength) || dataLength < 0 || dataLength > 0xffffffff - 36 || !Number.isInteger(rate) || rate <= 0) {
    throw new VoiceEngineError("Invalid WAV length or sample rate", { code: "invalid_request" });
  }
  const bytes = new Uint8Array(44), view = new DataView(bytes.buffer);
  const put = (offset: number, text: string) => bytes.set(new TextEncoder().encode(text), offset);
  put(0, "RIFF"); view.setUint32(4, 36 + dataLength + dataLength % 2, true); put(8, "WAVE"); put(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * count * bits / 8, true);
  view.setUint16(32, count * bits / 8, true); view.setUint16(34, bits, true); put(36, "data"); view.setUint32(40, dataLength, true);
  return bytes;
}

function unsupported(message: string): never { throw new VoiceEngineError(message, { code: "unsupported" }); }
function join(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

function wavData(bytes: Uint8Array): { data: Uint8Array; format: AudioFormat } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (offset: number) => new TextDecoder().decode(bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || label(0) !== "RIFF" || label(8) !== "WAVE") unsupported("Expected a RIFF/WAVE file");
  const end = view.getUint32(4, true) + 8;
  if (end > bytes.length) unsupported("Truncated WAV file");
  let format: AudioFormat | undefined;
  const payloads: Uint8Array[] = [];
  for (let offset = 12; offset + 8 <= end;) {
    const size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > end) unsupported("Truncated WAV chunk");
    if (label(offset) === "fmt ") {
      if (size < 16 || view.getUint16(start, true) !== 1) unsupported("Only uncompressed PCM WAV concatenation is supported");
      const channels = view.getUint16(start + 2, true), bitDepth = view.getUint16(start + 14, true);
      if ((channels !== 1 && channels !== 2) || ![16, 24, 32].includes(bitDepth)) unsupported("Unsupported WAV channels or bit depth");
      format = { container: "wav", sampleRate: view.getUint32(start + 4, true), channels, bitDepth: bitDepth as 16 | 24 | 32 };
    }
    if (label(offset) === "data") payloads.push(bytes.subarray(start, start + size));
    offset = start + size + size % 2;
  }
  if (!format || !payloads.length) unsupported("WAV requires fmt and data chunks");
  const data = join(payloads);
  if (data.length % ((format.channels ?? 1) * (format.bitDepth ?? 16) / 8)) unsupported("WAV contains an incomplete PCM frame");
  return { data, format };
}

function compatible(a: AudioFormat, b: AudioFormat): boolean {
  return a.container === b.container && a.sampleRate === b.sampleRate && a.bitrate === b.bitrate
    && (a.channels ?? 1) === (b.channels ?? 1) && (a.bitDepth ?? 16) === (b.bitDepth ?? 16);
}

/** Concatenate compatible outputs, rebuilding PCM WAV headers without transcoding. */
export function concatAudio(outputs: AudioOutput[]): AudioOutput {
  if (!outputs.length) throw new VoiceEngineError("No audio outputs to concatenate", { code: "invalid_request" });
  const first = outputs[0];
  if (!outputs.every((output) => compatible(first.format, output.format))) unsupported("Cannot concatenate mismatched audio formats");
  let format = { ...first.format }, data: Uint8Array;
  if (format.container === "wav") {
    const parsed = outputs.map((output) => wavData(output.data));
    if (!parsed.every((part) => compatible(parsed[0].format, part.format))) unsupported("Cannot concatenate mismatched WAV headers");
    format = parsed[0].format;
    for (const key of ["sampleRate", "channels", "bitDepth"] as const) {
      if (first.format[key] !== undefined && first.format[key] !== format[key]) unsupported("WAV header does not match output format");
    }
    const payload = join(parsed.map((part) => part.data));
    data = join([wavHeader(payload.length, format), payload, new Uint8Array(payload.length % 2)]);
  } else {
    if (outputs.length > 1 && !["mp3", "ogg", "opus", "pcm", "mulaw", "alaw"].includes(format.container)) unsupported(`Concatenation of ${format.container} requires a codec`);
    data = join(outputs.map((output) => output.data));
  }
  const durationMs = outputs.every((output) => output.durationMs !== undefined)
    ? outputs.reduce((total, output) => total + output.durationMs!, 0) : estimateDurationMs(format, data.byteLength);
  return { data, format, mimeType: mimeTypeFor(format), durationMs };
}

/** Estimate duration from PCM layout or a declared lossy bitrate; otherwise unknown. */
export function estimateDurationMs(format: AudioFormat, byteLength: number): number | undefined {
  if (["pcm", "wav", "mulaw", "alaw"].includes(format.container) && format.sampleRate) {
    const bits = format.container === "mulaw" || format.container === "alaw" ? 8 : format.bitDepth ?? 16;
    return Math.max(0, byteLength - (format.container === "wav" ? 44 : 0)) * 8 / (format.sampleRate * (format.channels ?? 1) * bits) * 1000;
  }
  return format.bitrate ? byteLength * 8 / format.bitrate : undefined;
}

/** Test exact digital silence in signed 16-bit PCM; partial samples are invalid. */
export function isSilentPcm16(bytes: Uint8Array): boolean { return bytes.length % 2 === 0 && bytes.every((byte) => byte === 0); }
