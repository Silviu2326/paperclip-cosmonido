import type { EnrichmentResult, LeadQualification } from "@paperclipai/shared";
import { api } from "./client";

export const leadQualificationApi = {
  qualifications: (companyId: string, leadId: string) =>
    api.get<LeadQualification[]>(`/companies/${companyId}/leads/${leadId}/qualifications`),
  qualify: (companyId: string, leadId: string, data: Record<string, unknown>) =>
    api.post<LeadQualification & { qualified: boolean; threshold: number }>(`/companies/${companyId}/leads/${leadId}/qualify`, data),
  enrich: (companyId: string, data: { query: string; leadId?: string | null }) =>
    api.post<EnrichmentResult>(`/companies/${companyId}/enrichment`, data),
};
