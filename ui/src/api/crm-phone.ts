import type {
  CrmPhoneCall,
  CrmPhoneCallback,
  CrmPhoneConnectorStatus,
  CrmPhoneDialAuthorization,
} from "@paperclipai/shared";
import { api } from "./client";

const base = (companyId: string) => `/companies/${companyId}/crm-phone`;

export const crmPhoneApi = {
  status: (companyId: string) => api.get<CrmPhoneConnectorStatus>(`${base(companyId)}/status`),
  calls: (companyId: string) => api.get<CrmPhoneCall[]>(`${base(companyId)}/calls`),
  sync: (companyId: string) => api.post<{ examined: number; projected: number }>(`${base(companyId)}/calls/sync`, {}),
  linkContact: (companyId: string, callId: string, contactId: string) =>
    api.post<CrmPhoneCall>(`${base(companyId)}/calls/${callId}/link-contact`, { contactId }),
  callbacks: (companyId: string, status?: CrmPhoneCallback["status"]) =>
    api.get<CrmPhoneCallback[]>(`${base(companyId)}/callbacks${status ? `?status=${status}` : ""}`),
  approve: (companyId: string, callbackId: string) =>
    api.post<CrmPhoneCallback>(`${base(companyId)}/callbacks/${callbackId}/approve`, {}),
  cancel: (companyId: string, callbackId: string) =>
    api.post<CrmPhoneCallback>(`${base(companyId)}/callbacks/${callbackId}/cancel`, {}),
  dialAuthorization: (companyId: string, callbackId: string) =>
    api.get<CrmPhoneDialAuthorization>(`${base(companyId)}/callbacks/${callbackId}/dial-authorization`),
};
