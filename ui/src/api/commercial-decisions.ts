import type { CommercialDecisionMetadata, RemoteDecisionLink } from "@paperclipai/shared";
import { api } from "./client";

export interface CommercialDecisionOption {
  id: string;
  label: string;
  description?: string | null;
  style?: "default" | "primary" | "destructive";
}

export interface CommercialDecisionView {
  id: string;
  companyId: string;
  title: string;
  body: string;
  status: "open" | "decided" | "expired" | "cancelled";
  options: CommercialDecisionOption[];
  chosenOptionId: string | null;
  expiresAt: string;
  createdAt: string;
  commercial: (CommercialDecisionMetadata & { resolution?: { appliedAt?: string | null } | null }) | null;
}

export interface ResolveCommercialDecisionResult {
  decision: CommercialDecisionView;
  applied: boolean;
}

export const commercialDecisionsApi = {
  listOpen: (companyId: string) =>
    api.get<CommercialDecisionView[]>(`/companies/${companyId}/commercial-decisions`),
  get: (id: string) => api.get<CommercialDecisionView>(`/commercial-decisions/${id}`),
  resolve: (id: string, body: { optionId: string; subjectVersion?: string }) =>
    api.post<ResolveCommercialDecisionResult>(`/commercial-decisions/${id}/resolve`, body),
  createRemoteLink: (id: string, body: { channel?: "email" | "whatsapp" | "sms"; expiresInHours?: number } = {}) =>
    api.post<RemoteDecisionLink>(`/commercial-decisions/${id}/remote-link`, body),
};
