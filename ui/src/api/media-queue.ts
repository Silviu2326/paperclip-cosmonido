import type { MediaQueueJob, MediaQueuePage } from "@paperclipai/shared";
import { api } from "./client";

export const mediaQueueApi = {
  list: (companyId: string, input: { limit?: number; cursor?: string } = {}) => {
    const params = new URLSearchParams({ limit: String(input.limit ?? 25) });
    if (input.cursor) params.set("cursor", input.cursor);
    return api.get<MediaQueuePage>(`/companies/${companyId}/media-queue?${params.toString()}`);
  },
  updatePriority: (companyId: string, jobId: string, input: { priority: number; expectedUpdatedAt: string }) =>
    api.patch<MediaQueueJob>(`/companies/${companyId}/media-jobs/${jobId}/priority`, input),
};
