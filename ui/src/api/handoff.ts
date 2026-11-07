import type { HandoffReceipt } from "@paperclipai/shared";
import { api } from "./client";

export const handoffApi = {
  list: (companyId: string) => api.get<HandoffReceipt[]>(`/companies/${companyId}/handoffs`),
  get: (id: string) => api.get<HandoffReceipt>(`/handoffs/${id}`),
  /** Resumes a partial handoff. Board only. Answers 200 when complete, 202 when still partial. */
  retry: (id: string) => api.post<HandoffReceipt>(`/handoffs/${id}/retry`, {}),
};
