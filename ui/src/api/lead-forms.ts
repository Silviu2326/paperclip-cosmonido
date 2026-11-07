import type {
  CreateLeadForm,
  LeadFormDetail,
  LeadFormLifecycleAction,
  LeadFormPage,
  LeadFormStatusFilter,
  UpdateLeadForm,
} from "@paperclipai/shared";
import { api } from "./client";

export interface LeadFormListFilters {
  status?: LeadFormStatusFilter;
  q?: string;
  cursor?: string;
  limit?: number;
}

function withQuery(path: string, query?: object) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Every write sends `expectedUpdatedAt`, the `updatedAt` the editor last loaded. A 409 means
 * another change landed first; the caller should reload instead of retrying the same payload.
 */
export const leadFormsApi = {
  list: (companyId: string, filters?: LeadFormListFilters) =>
    api.get<LeadFormPage>(withQuery(`/companies/${companyId}/lead-forms`, filters)),
  get: (id: string) => api.get<LeadFormDetail>(`/lead-forms/${id}`),
  create: (companyId: string, data: CreateLeadForm) =>
    api.post<LeadFormDetail>(`/companies/${companyId}/lead-forms`, data),
  update: (id: string, data: UpdateLeadForm) => api.patch<LeadFormDetail>(`/lead-forms/${id}`, data),
  lifecycle: (id: string, action: LeadFormLifecycleAction, expectedUpdatedAt: string) =>
    api.post<LeadFormDetail>(`/lead-forms/${id}/${action}`, { expectedUpdatedAt }),
};
