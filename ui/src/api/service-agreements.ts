import type { AgreementPeriod, ServiceAgreement, ServiceAgreementDeliverable } from "@paperclipai/shared";
import { api } from "./client";

export type ServiceAgreementUpdateInput = {
  title?: string;
  noticeDays?: number;
  autoRenew?: boolean;
  endsAt?: string | null;
  deliverablesPerPeriod?: ServiceAgreementDeliverable[];
  status?: ServiceAgreement["status"];
};

export interface AgreementTickResult {
  periodsStarted: number;
  periodErrors: Array<{ periodId: string; message: string }>;
  renewalsRequested: number;
}

export const serviceAgreementsApi = {
  list: (companyId: string) => api.get<ServiceAgreement[]>(`/companies/${companyId}/service-agreements`),
  get: (id: string) => api.get<ServiceAgreement>(`/service-agreements/${id}`),
  periods: (id: string) => api.get<AgreementPeriod[]>(`/service-agreements/${id}/periods`),
  update: (id: string, input: ServiceAgreementUpdateInput) => api.patch<ServiceAgreement>(`/service-agreements/${id}`, input),
  cancel: (id: string) => api.post<ServiceAgreement>(`/service-agreements/${id}/cancel`, {}),
  /** Demo helper: starts the due periods and requests due renewals for the company now. Board only. */
  tick: (companyId: string) => api.post<AgreementTickResult>(`/companies/${companyId}/service-agreements/tick`, {}),
};
