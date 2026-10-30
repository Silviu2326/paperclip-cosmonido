import type { CreateProposalInput, Proposal, ProposalPage, ProposalStatus, ReviseProposalInput } from "@paperclipai/shared";
import { api } from "./client";

export type ProposalSendResult = {
  proposal: Proposal;
  publicUrl: string;
  paymentUnavailableReason: string | null;
  messageId: string | null;
};

export const proposalsApi = {
  page: (companyId: string, filters: { status?: ProposalStatus; customerId?: string; opportunityId?: string; q?: string; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
    return api.get<ProposalPage>(`/companies/${companyId}/proposals/page?${params}`);
  },
  create: (companyId: string, input: CreateProposalInput) => api.post<Proposal>(`/companies/${companyId}/proposals`, input),
  list: (companyId: string, filters?: { status?: ProposalStatus; customerId?: string; opportunityId?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.customerId) params.set("customerId", filters.customerId);
    if (filters?.opportunityId) params.set("opportunityId", filters.opportunityId);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return api.get<Proposal[]>(`/companies/${companyId}/proposals${params.size ? `?${params}` : ""}`);
  },
  get: (id: string) => api.get<Proposal>(`/proposals/${id}`),
  revisions: (id: string) => api.get<Proposal[]>(`/proposals/${id}/revisions`),
  revise: (id: string, input: ReviseProposalInput) => api.post<Proposal>(`/proposals/${id}/revise`, input),
  send: (id: string, input: { via: "link" | "message"; recipient?: string | null }) => api.post<ProposalSendResult>(`/proposals/${id}/send`, input),
};
