import type { CompanyRetentionInput, CompanyRetentionPolicy, RetentionPreviewInput } from "@paperclipai/shared/productization/security";
import { api } from "./client";

export type RetentionPreview = { id: string; counts: { closedConversations: number; files: number; versions: number; bytes: number; filesAvailable: boolean; filesBlocker: string | null }; expiresAt: string };
export type AccountDeletion = { id: string; accountId: string; status: "cooling" | "running" | "blocked" | "completed" | "cancelled"; coolingEndsAt: string; blockerCode: string | null; completedAt: string | null };

export const productizationSecurityApi = {
  retention: (companyId: string) => api.get<CompanyRetentionPolicy>(`/companies/${companyId}/productization/security/retention`),
  previewRetention: (companyId: string, input: RetentionPreviewInput) => api.post<RetentionPreview>(`/companies/${companyId}/productization/security/retention/preview`, input),
  updateRetention: (companyId: string, input: CompanyRetentionInput) => api.put<CompanyRetentionPolicy>(`/companies/${companyId}/productization/security/retention`, input),
  requestAccountDeletion: (accountId: string, confirmation: string) => api.post<AccountDeletion>("/accounts/deletion", { accountId, confirmation }),
  accountDeletion: (accountId: string) => api.get<AccountDeletion | null>(`/accounts/${accountId}/deletion`),
  cancelAccountDeletion: (deletionId: string) => api.post<AccountDeletion>("/accounts/deletion/cancel", { deletionId }),
};
