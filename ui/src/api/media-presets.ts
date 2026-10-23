import type { CreateMediaPresetInput, MediaPreset, MediaProductionMetrics } from "@paperclipai/shared/productization/media-presets";
import { api } from "./client";
import type { MediaJob } from "./media-studio";

export const mediaPresetsApi = {
  list: (companyId: string) => api.get<MediaPreset[]>(`/companies/${companyId}/media-presets`),
  createVersion: (companyId: string, input: CreateMediaPresetInput) => api.post<MediaPreset>(`/companies/${companyId}/media-presets`, input),
  metrics: (companyId: string, days: 7 | 30 | 90 = 30) => api.get<MediaProductionMetrics>(`/companies/${companyId}/media-presets/metrics?days=${days}`),
  renderWithAspect: (projectId: string, idempotencyKey: string, aspect: "9:16" | "16:9") =>
    api.post<MediaJob>(`/media-projects/${projectId}/render`, { idempotencyKey, primary: true, aspect, cropMode: "center" }),
};
