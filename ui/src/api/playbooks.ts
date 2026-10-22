import type { CreatePlaybookInput, Playbook, PlaybookRun, PlaybookUsageSummary, UpdatePlaybookInput } from "@paperclipai/shared";
import { api } from "./client";

export const playbooksApi = {
  list: (companyId: string, filters?: { status?: string; key?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.key) params.set("key", filters.key);
    return api.get<Playbook[]>(`/companies/${companyId}/playbooks${params.size ? `?${params}` : ""}`);
  },
  templates: (companyId: string) => api.get<CreatePlaybookInput[]>(`/companies/${companyId}/playbooks/templates`),
  get: (id: string) => api.get<Playbook>(`/playbooks/${id}`),
  create: (companyId: string, input: CreatePlaybookInput) => api.post<Playbook>(`/companies/${companyId}/playbooks`, input),
  fromTemplate: (companyId: string, templateKey: string) => api.post<Playbook>(`/companies/${companyId}/playbooks/from-template`, { templateKey }),
  update: (id: string, input: UpdatePlaybookInput) => api.patch<Playbook>(`/playbooks/${id}`, input),
  publish: (id: string) => api.post<Playbook>(`/playbooks/${id}/publish`, {}),
  newDraft: (id: string) => api.post<Playbook>(`/playbooks/${id}/new-draft`, {}),
  archive: (id: string) => api.post<Playbook>(`/playbooks/${id}/archive`, {}),
  usage: (companyId: string) => api.get<PlaybookUsageSummary[]>(`/companies/${companyId}/playbook-usage`),
  runs: (companyId: string, filters?: { playbookId?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.playbookId) params.set("playbookId", filters.playbookId);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return api.get<PlaybookRun[]>(`/companies/${companyId}/playbook-runs${params.size ? `?${params}` : ""}`);
  },
};
