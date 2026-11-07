import { api } from "./client";

export type CustomerMemorySource = "user" | "agent" | "detected";

export interface CustomerMemoryNote {
  id: string;
  companyId: string;
  customerId: string;
  key: string;
  content: string;
  source: CustomerMemorySource;
  agentId: string | null;
  runId: string | null;
  validUntil: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppendCustomerMemoryInput {
  key: string;
  content: string;
  source?: "user" | "detected";
  validUntil?: string | null;
}

export const crmMemoryApi = {
  list: (customerId: string) => api.get<CustomerMemoryNote[]>(`/customers/${customerId}/memory`),
  append: (customerId: string, data: AppendCustomerMemoryInput) =>
    api.post<CustomerMemoryNote>(`/customers/${customerId}/memory`, data),
  archive: (noteId: string) => api.post<CustomerMemoryNote>(`/customer-memory/${noteId}/archive`, {}),
};
