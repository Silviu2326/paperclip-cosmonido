export type MediaJobKind = "transcribe" | "render" | "dub" | "stop_motion" | "dub_multivoice" | "voiceover";
export type MediaJobStatus = "queued" | "running" | "done" | "failed";
export type MediaProjectStatus = "draft" | "processing" | "ready" | "failed";
export type MediaCameraMotion = "pan" | "zoom" | "none";
export type MediaOperation =
  | { type: "cut_ranges"; ranges: Array<{ start: number; end: number }> }
  | { type: "remove_silences"; thresholdDb: number; minDurationMs: number }
  | { type: "remove_fillers"; words: string[] }
  | { type: "burn_subtitles"; style: { font?: string; size: number; color: string; highlightColor?: string; position: "top" | "center" | "bottom" } }
  | { type: "export"; aspect: "9:16" | "16:9"; cropMode: "center" }
  | { type: "replace_audio"; assetId: string }
  // Job-only operations: they run as their own media jobs and are rejected when a project's operations are rendered.
  | { type: "stop_motion"; frameDurationSeconds: number; cameraMotion: MediaCameraMotion }
  | { type: "voiceover"; assetId: string; duckingDb: number }
  | { type: "dub_multivoice"; language: string };
