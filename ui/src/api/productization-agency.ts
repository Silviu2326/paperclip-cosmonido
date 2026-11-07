import { api } from "@/api/client";
import type { AgencyBrand, AgencyPortfolio, AgencyOperation, AgencyClientProvision } from "@paperclipai/shared/productization/agency";

export type AgencySetupResult = AgencyOperation & { installPlan: unknown; nextStep: string };
export interface AgencyPackageSummary { id: string; name: string; packageKey: string; packageVersion: string; status: string }
export interface AgencyBrandSettings extends AgencyBrand { companyId: string; logoUrl: string | null; domainStatus: "unavailable"; updatedByUserId: string | null; createdAt?: string | null; updatedAt?: string | null }
export const productizationAgencyApi = {
  createClient: (accountId: string, input: AgencyClientProvision) => api.post<AgencySetupResult>(`/productization/accounts/${accountId}/agency/clients`, input),
  resume: (accountId: string, operationId: string) => api.post<AgencySetupResult>(`/productization/accounts/${accountId}/agency/clients/${operationId}/resume`, {}),
  portfolio: (accountId: string, signal?: AbortSignal) => api.get<AgencyPortfolio & { accountUsage: Array<{ metric: string; periodKey: string; consumed: number }> }>(`/productization/accounts/${accountId}/agency/portfolio`, { signal }),
  operations: (accountId: string, signal?: AbortSignal) => api.get<AgencySetupResult[]>(`/productization/accounts/${accountId}/agency/operations`, { signal }),
  packages: (companyId: string, signal?: AbortSignal) => api.get<AgencyPackageSummary[]>(`/companies/${companyId}/productization/catalog/packages`, { signal }),
  addClientUser: (companyId: string, userId: string) => api.post(`/companies/${companyId}/agency/client-users`, { userId }),
  getBrand: (companyId: string, signal?: AbortSignal) => api.get<AgencyBrandSettings>(`/companies/${companyId}/agency/brand`, { signal }),
  saveBrand: (companyId: string, brand: AgencyBrand) => api.put<AgencyBrandSettings>(`/companies/${companyId}/agency/brand`, brand),
  publicBrand: (companyId: string, signal?: AbortSignal) => api.get<Pick<AgencyBrandSettings, "displayName" | "primaryColor" | "accentColor" | "logoUrl" | "domainStatus">>(`/public/productization/agency/brands/${companyId}`, { signal }),
};
