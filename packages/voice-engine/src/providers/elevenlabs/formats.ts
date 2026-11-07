import type { AudioFormat } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";

export interface ElevenLabsFormat { outputFormat: string; format: AudioFormat; mimeType: string }

const entries: ElevenLabsFormat[] = [
  { outputFormat: "mp3_22050_32", format: { container: "mp3", sampleRate: 22050, bitrate: 32, channels: 1 }, mimeType: "audio/mpeg" },
  ...[32, 64, 96, 128, 192].map(bitrate => ({ outputFormat: `mp3_44100_${bitrate}`, format: { container: "mp3" as const, sampleRate: 44100, bitrate, channels: 1 as const }, mimeType: "audio/mpeg" })),
  ...[8000, 16000, 22050, 24000, 44100, 48000].map(sampleRate => ({ outputFormat: `pcm_${sampleRate}`, format: { container: "pcm" as const, sampleRate, channels: 1 as const, bitDepth: 16 as const }, mimeType: "audio/pcm" })),
  { outputFormat: "ulaw_8000", format: { container: "mulaw", sampleRate: 8000, channels: 1 }, mimeType: "audio/basic" },
  { outputFormat: "alaw_8000", format: { container: "alaw", sampleRate: 8000, channels: 1 }, mimeType: "audio/alaw" },
  ...[32, 64, 96, 128, 192].map(bitrate => ({ outputFormat: `opus_48000_${bitrate}`, format: { container: "opus" as const, sampleRate: 48000, bitrate, channels: 1 as const }, mimeType: "audio/ogg; codecs=opus" })),
];

export const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

function unsupported(value: unknown): never {
  throw new VoiceEngineError(`Unsupported ElevenLabs output format: ${JSON.stringify(value)}`, { code: "unsupported", provider: "elevenlabs" });
}

/** Map an ElevenLabs output_format to its normalized audio format and MIME type. */
export function fromOutputFormat(outputFormat: string): ElevenLabsFormat {
  const entry = entries.find(item => item.outputFormat === outputFormat);
  if (!entry) return unsupported(outputFormat);
  return { ...entry, format: { ...entry.format } };
}

/** Map a normalized format to an exact native ElevenLabs output format. */
export function toOutputFormat(format?: AudioFormat): ElevenLabsFormat {
  if (!format) return fromOutputFormat(DEFAULT_OUTPUT_FORMAT);
  if ((format.channels !== undefined && format.channels !== 1) || (format.bitDepth !== undefined && (format.container !== "pcm" || format.bitDepth !== 16))) return unsupported(format);
  const sampleRate = format.sampleRate ?? ({ mp3: 44100, pcm: 24000, mulaw: 8000, alaw: 8000, opus: 48000 } as Record<string, number>)[format.container];
  const bitrate = format.bitrate ?? (format.container === "mp3" ? sampleRate === 22050 ? 32 : 128 : format.container === "opus" ? 128 : undefined);
  const entry = entries.find(item => item.format.container === format.container && item.format.sampleRate === sampleRate && item.format.bitrate === bitrate);
  return entry ? fromOutputFormat(entry.outputFormat) : unsupported(format);
}
