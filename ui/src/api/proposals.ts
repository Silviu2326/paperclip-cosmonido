import type { Proposal, ProposalStatus, ReviseProposalInput } from "@paperclipai/shared";
import { api } from "./client";

export type ProposalSendResult = {
  proposal: Proposal;
  publicUrl: string;
  paymentUnavailableReason: string | null;
  messageId: string | null;
};

export const proposalsApi = {
  list: (companyId: string, filters?: { status?: ProposalStatus }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    return api.get<Proposal[]>(`/companies/${companyId}/proposals${params.size ? `?${params}` : ""}`);
  },
  get: (id: string) => api.get<Proposal>(`/proposals/${id}`),
  revisions: (id: string) => api.get<Proposal[]>(`/proposals/${id}/revisions`),
  revise: (id: string, input: ReviseProposalInput) => api.post<Proposal>(`/proposals/${id}/revise`, input),
  send: (id: string, input: { via: "link" | "message"; recipient?: string | null }) => api.post<ProposalSendResult>(`/proposals/${id}/send`, input),
};
