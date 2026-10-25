import type { TranscriptSegment, TranscriptWord } from "../stt/types.js";

/** Format transcript timing as SubRip or WebVTT. */
export function formatSubtitles(items: Array<TranscriptSegment | TranscriptWord>, format: "srt" | "vtt"): string {
  const rows = items.filter(item => Number.isFinite(item.startMs) && Number.isFinite(item.endMs) && item.endMs >= item.startMs && item.text.trim());
  const body = rows.map((item, index) => `${format === "srt" ? `${index + 1}\n` : ""}${stamp(item.startMs, format)} --> ${stamp(item.endMs, format)}\n${item.text.trim()}`).join("\n\n");
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${body}${body ? "\n" : ""}`;
}

function stamp(ms: number, format: "srt" | "vtt"): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${format === "srt" ? "," : "."}${String(millis).padStart(3, "0")}`;
}
