import type { Assignment } from "@paperclipai/shared";
import { api } from "./client";

export type CreateAssignmentInput = { title: string; description?: string | null; acceptanceCriteria: string; expectedDeliverable?: string | null; budgetCents: number; projectId?: string | null; assigneeAgentId: string; idempotencyKey: string };
export const assignmentsApi = {
  list: (companyId: string, filters?: { status?: string; cursor?: string; limit?: number }) => {
    const params = new URLSearchParams(); if (filters?.status) params.set("status", filters.status); if (filters?.cursor) params.set("cursor", filters.cursor); if (filters?.limit) params.set("limit", String(filters.limit));
    return api.get<Assignment[]>(`/companies/${companyId}/assignments${params.size ? `?${params}` : ""}`);
  },
  get: (id: string) => api.get<Assignment>(`/assignments/${id}`),
  create: (companyId: string, input: CreateAssignmentInput) => api.post<Assignment>(`/companies/${companyId}/assignments`, input),
  update: (id: string, input: Partial<CreateAssignmentInput>) => api.patch<Assignment>(`/assignments/${id}`, input),
  cancel: (id: string) => api.post<Assignment>(`/assignments/${id}/cancel`, {}),
  contextUsage: (id: string) => api.get<Array<{ fileId: string; name: string; contextRole: string | null; lastReadAt: string | Date; readCount: number; issueCount: number }>>(`/assignments/${id}/context-usage`),
};
