import type {
  ChangeOpportunityStage,
  Commitment,
  CreateCommitment,
  CreateContact,
  CreateCrmActivity,
  CreateCustomer,
  CreateOpportunity,
  Contact,
  Customer,
  CrmActivity,
  CrmListQuery,
  Opportunity,
  ResolveCommitment,
  UpdateContact,
  UpdateCustomer,
  UpdateOpportunity,
} from "@paperclipai/shared";
import { api } from "./client";

export interface CrmPage<T> {
  items: T[];
  nextCursor: string | null;
}

function withQuery(path: string, query?: Partial<CrmListQuery>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const crmApi = {
  customers: {
    list: (companyId: string, query?: Partial<CrmListQuery>) =>
      api.get<CrmPage<Customer>>(withQuery(`/companies/${companyId}/customers`, query)),
    get: (id: string) => api.get<Customer>(`/customers/${id}`),
    create: (companyId: string, data: CreateCustomer) =>
      api.post<Customer>(`/companies/${companyId}/customers`, data),
    update: (id: string, data: UpdateCustomer) => api.patch<Customer>(`/customers/${id}`, data),
  },
  contacts: {
    list: (companyId: string, query?: Partial<CrmListQuery>) =>
      api.get<CrmPage<Contact>>(withQuery(`/companies/${companyId}/contacts`, query)),
    get: (id: string) => api.get<Contact>(`/contacts/${id}`),
    create: (companyId: string, data: CreateContact) => api.post<Contact>(`/companies/${companyId}/contacts`, data),
    update: (id: string, data: UpdateContact) => api.patch<Contact>(`/contacts/${id}`, data),
  },
  opportunities: {
    list: (companyId: string, query?: Partial<CrmListQuery>) =>
      api.get<CrmPage<Opportunity>>(withQuery(`/companies/${companyId}/opportunities`, query)),
    get: (id: string) => api.get<Opportunity>(`/opportunities/${id}`),
    create: (companyId: string, data: CreateOpportunity) =>
      api.post<Opportunity>(`/companies/${companyId}/opportunities`, data),
    update: (id: string, data: UpdateOpportunity) => api.patch<Opportunity>(`/opportunities/${id}`, data),
    changeStage: (id: string, data: ChangeOpportunityStage) =>
      api.post<Opportunity>(`/opportunities/${id}/stage`, data),
  },
  activities: {
    list: (companyId: string, query?: { subjectKind?: string; subjectId?: string; cursor?: string; limit?: number }) =>
      api.get<CrmPage<CrmActivity>>(withQuery(`/companies/${companyId}/crm/activities`, query)),
    create: (companyId: string, data: CreateCrmActivity) =>
      api.post<CrmActivity>(`/companies/${companyId}/crm/activities`, data),
  },
  commitments: {
    list: (companyId: string, query?: Partial<CrmListQuery>) =>
      api.get<CrmPage<Commitment>>(withQuery(`/companies/${companyId}/commitments`, query)),
    create: (companyId: string, data: CreateCommitment) =>
      api.post<Commitment>(`/companies/${companyId}/commitments`, data),
    resolve: (id: string, data: ResolveCommitment) => api.post<Commitment>(`/commitments/${id}/resolve`, data),
  },
  duplicates: (companyId: string) => api.get<unknown[]>(`/companies/${companyId}/crm/duplicates`),
  // Pista K: memoria por cliente.
  memory: {
    get: (customerId: string) => api.get<unknown>(`/customers/${customerId}/memory`),
    append: (customerId: string, data: { note: string }) => api.post<unknown>(`/customers/${customerId}/memory`, data),
  },
  // Pista L: sincronización externa.
  sync: {
    status: (companyId: string) => api.get<unknown>(`/companies/${companyId}/crm/sync`),
  },
};
