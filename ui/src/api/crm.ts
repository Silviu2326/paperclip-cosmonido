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
  CrmSubjectKind,
} from "@paperclipai/shared";
import {
  opportunityForecastSchema,
  type OpportunityForecastQuery,
} from "@paperclipai/shared/productization/opportunity-forecast";
import { api } from "./client";

export interface CrmPage<T> {
  items: T[];
  nextCursor: string | null;
}

// A2 begin
export interface OpportunityListQuery extends Partial<CrmListQuery> {
  stageKey?: string;
  ownerId?: string;
  customerId?: string;
  nextActionBefore?: string;
}

export interface CommitmentListQuery extends Partial<CrmListQuery> {
  customerId?: string;
  opportunityId?: string;
}

/** Response of stage changes: the gate decides whether the change was applied now or is pending. */
export interface StageChangeResponse {
  mode: "draft" | "approval" | "direct";
  externalAction: { id: string; status: string; mode: string; result?: unknown };
  opportunity: Opportunity | null;
}
// A2 end

// A1 begin
/** Create bodies accept `force: true` to proceed past duplicate candidates (409 otherwise). */
export interface CreateDuplicateOptions {
  force?: boolean;
}

export interface CustomerLinkedContact {
  contact: Contact;
  role: string | null;
  isPrimary: boolean;
}

export interface DuplicateCandidate<T> {
  record: T;
  reasons: string[];
}

export type DuplicateQuery =
  | { kind: "customer"; name: string; domain?: string; contactEmail?: string }
  | { kind: "contact"; displayName?: string; email?: string; phone?: string };

/** Body of a 409 response when a create would duplicate existing records. */
export interface CrmDuplicateConflict {
  error: string;
  details?: {
    code?: string;
    candidates?: DuplicateCandidate<Customer | Contact>[];
  };
}
// A1 end

function withQuery(path: string, query?: object) {
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
    // A1 begin
    create: (companyId: string, data: CreateCustomer & CreateDuplicateOptions & { contactEmail?: string | null }) =>
      api.post<Customer>(`/companies/${companyId}/customers`, data),
    update: (id: string, data: UpdateCustomer) => api.patch<Customer>(`/customers/${id}`, data),
    listContacts: (id: string) => api.get<CustomerLinkedContact[]>(`/customers/${id}/contacts`),
    linkContact: (id: string, data: { contactId: string; role?: string | null; isPrimary?: boolean }) =>
      api.post<unknown>(`/customers/${id}/contacts`, data),
    unlinkContact: (id: string, contactId: string) => api.delete<{ ok: true }>(`/customers/${id}/contacts/${contactId}`),
    // A1 end
  },
  contacts: {
    list: (companyId: string, query?: Partial<CrmListQuery>) =>
      api.get<CrmPage<Contact>>(withQuery(`/companies/${companyId}/contacts`, query)),
    get: (id: string) => api.get<Contact>(`/contacts/${id}`),
    // A1 begin
    create: (companyId: string, data: CreateContact & CreateDuplicateOptions) =>
      api.post<Contact>(`/companies/${companyId}/contacts`, data),
    update: (id: string, data: UpdateContact) => api.patch<Contact>(`/contacts/${id}`, data),
    // A1 end
  },
  // A2 begin
  opportunities: {
    list: (companyId: string, query?: OpportunityListQuery) =>
      api.get<CrmPage<Opportunity>>(withQuery(`/companies/${companyId}/opportunities`, query)),
    get: (id: string) => api.get<Opportunity>(`/opportunities/${id}`),
    create: (companyId: string, data: CreateOpportunity) =>
      api.post<Opportunity>(`/companies/${companyId}/opportunities`, data),
    update: (id: string, data: UpdateOpportunity) => api.patch<Opportunity>(`/opportunities/${id}`, data),
    /** Stage changes pass the action gate: 200 with `opportunity` for board users, 202 when an agent action waits. */
    changeStage: (id: string, data: ChangeOpportunityStage) =>
      api.post<StageChangeResponse>(`/opportunities/${id}/stage`, data),
    close: (id: string, data: { outcome: "won" | "lost"; expectedVersion: number; reason?: string }) =>
      api.post<StageChangeResponse>(`/opportunities/${id}/close`, data),
    setNextAction: (id: string, data: { nextAction: string; nextActionAt?: string | null; expectedVersion?: number }) =>
      api.post<Opportunity>(`/opportunities/${id}/next-action`, data),
    /** Weighted open-pipeline ESTIMATE (never revenue); the response is validated against the shared schema. */
    forecast: async (companyId: string, query?: Partial<OpportunityForecastQuery>, signal?: AbortSignal) => {
      const response = await api.get<unknown>(
        withQuery(`/companies/${encodeURIComponent(companyId)}/opportunities/forecast`, query),
        { signal },
      );
      const parsed = opportunityForecastSchema.safeParse(response);
      if (!parsed.success) throw new Error("Unexpected forecast response");
      return parsed.data;
    },
  },
  activities: {
    list: (companyId: string, query: { subjectKind: CrmSubjectKind; subjectId: string; cursor?: string; limit?: number }) =>
      api.get<CrmPage<CrmActivity>>(withQuery(`/companies/${companyId}/crm/activities`, query)),
    create: (companyId: string, data: CreateCrmActivity) =>
      api.post<CrmActivity>(`/companies/${companyId}/crm/activities`, data),
  },
  commitments: {
    list: (companyId: string, query?: CommitmentListQuery) =>
      api.get<CrmPage<Commitment>>(withQuery(`/companies/${companyId}/commitments`, query)),
    create: (companyId: string, data: CreateCommitment) =>
      api.post<Commitment>(`/companies/${companyId}/commitments`, data),
    resolve: (id: string, data: ResolveCommitment) => api.post<Commitment>(`/commitments/${id}/resolve`, data),
  },
  // A2 end
  // A1 begin
  duplicates: (companyId: string, query: DuplicateQuery) =>
    api.get<DuplicateCandidate<Customer | Contact>[]>(withQuery(`/companies/${companyId}/crm/duplicates`, query)),
  // A1 end
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
