import type { ConvertLead, CreateLead, CrmListQuery, Lead, UpdateLead } from "@paperclipai/shared";
import { api } from "./client";
import type { CrmPage } from "./crm";

function withQuery(path: string, query?: Partial<CrmListQuery>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const leadsApi = {
  list: (companyId: string, query?: Partial<CrmListQuery>) =>
    api.get<CrmPage<Lead>>(withQuery(`/companies/${companyId}/leads`, query)),
  get: (id: string) => api.get<Lead>(`/leads/${id}`),
  create: (companyId: string, data: CreateLead) => api.post<Lead>(`/companies/${companyId}/leads`, data),
  update: (id: string, data: UpdateLead) => api.patch<Lead>(`/leads/${id}`, data),
  convert: (id: string, data: ConvertLead) => api.post<Lead>(`/leads/${id}/convert`, data),
  discard: (id: string, reason?: string) => api.post<Lead>(`/leads/${id}/discard`, { reason }),
  // CSV import: the body is the raw CSV text.
  importCsv: (companyId: string, csv: string) =>
    api.post<{ imported: number; skipped: number }>(`/companies/${companyId}/leads/import`, { csv }),
};
