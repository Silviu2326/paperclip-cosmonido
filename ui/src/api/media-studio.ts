import type { MediaCameraMotion, MediaOperation } from "@paperclipai/shared";
import { api } from "./client";

export interface MediaJob { id: string; projectId: string; kind: "transcribe" | "render" | "dub" | "stop_motion" | "dub_multivoice" | "voiceover"; status: "queued" | "running" | "done" | "failed"; error: string | null; outputAssetId: string | null; }
export interface MediaProject { id: string; companyId: string; sourceAssetId: string; transcriptDocumentId: string | null; operations: MediaOperation[]; jobs: MediaJob[]; transcript: { text: string; language: string | null; duration: number | null; words: Array<{ text: string; start: number; end: number }> } | null; }
export const mediaStudioApi = {
  create: (companyId: string, source: {assetId?:string;companyFileId?:string}) => api.post<MediaProject>(`/companies/${companyId}/media-projects`, source),
  get: (id: string) => api.get<MediaProject>(`/media-projects/${id}`),
  listJobs: (companyId: string, goalId: string) => api.get<{ jobs: MediaJob[] }>(`/companies/${companyId}/media-jobs?goalId=${encodeURIComponent(goalId)}`),
  transcribe: (id: string, idempotencyKey: string) => api.post<MediaJob>(`/media-projects/${id}/transcribe`, { idempotencyKey }),
  operations: (id: string, operations: MediaOperation[]) => api.post<MediaProject>(`/media-projects/${id}/operations`, { operations }),
  render: (id: string, idempotencyKey: string, primary = false) => api.post<MediaJob>(`/media-projects/${id}/render`, { idempotencyKey, primary, aspect: "9:16", cropMode: "center" }),
  stopMotion: (id: string, body: { idempotencyKey: string; frameAssetIds: string[]; frameDurationSeconds: number; cameraMotion: MediaCameraMotion; aspect?: "9:16" | "16:9"; primary?: boolean; goalId?: string }) =>
    api.post<MediaJob>(`/media-projects/${id}/stop-motion`, body),
  dubMultivoice: (id: string, body: { idempotencyKey: string; language: string; segments: Array<{ start: number; end: number; text: string; speaker: string; voiceId: string }>; primary?: boolean }) =>
    api.post<MediaJob>(`/media-projects/${id}/dub-multivoice`, body),
  voiceover: (id: string, body: { idempotencyKey: string; script?: string; voiceAssetId?: string; voiceId?: string; language?: string; duckingDb?: number; primary?: boolean }) =>
    api.post<MediaJob>(`/media-projects/${id}/voiceover`, body),
};
