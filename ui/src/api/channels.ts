import { api } from "./client";

// Customer channel accounts (Sprint 2 pistas D/E). Board-only settings. Secret values are never
// sent or shown: accounts only carry the names of company secrets.

export type ChannelProvider = "meta" | "telegram" | "twilio";
export type ChannelKind = "whatsapp" | "messenger" | "instagram" | "telegram" | "sms";
export type ChannelAccountStatus = "pending" | "active" | "disabled";

export interface ApprovedTemplate {
  name: string;
  language: string;
}

export interface ChannelAccount {
  id: string;
  companyId: string;
  provider: ChannelProvider;
  kind: ChannelKind;
  label: string;
  externalAccountId: string;
  providerAccountSid: string | null;
  verifySecretName: string;
  challengeSecretName: string | null;
  tokenSecretName: string;
  status: ChannelAccountStatus;
  approvedTemplates: ApprovedTemplate[];
  lastTestedAt: string | null;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelAccountInput {
  provider: ChannelProvider;
  kind: ChannelKind;
  label: string;
  externalAccountId: string;
  providerAccountSid?: string | null;
  verifySecretName: string;
  challengeSecretName?: string | null;
  tokenSecretName: string;
  approvedTemplates?: ApprovedTemplate[];
}

export interface UpdateChannelAccountInput {
  label?: string;
  providerAccountSid?: string | null;
  verifySecretName?: string;
  challengeSecretName?: string | null;
  tokenSecretName?: string;
  approvedTemplates?: ApprovedTemplate[];
  status?: "active" | "disabled";
}

export interface ChannelTestResult {
  ok: boolean;
  status: number | null;
  detail: string;
}

export const channelsApi = {
  list: (companyId: string) =>
    api.get<ChannelAccount[]>(`/companies/${encodeURIComponent(companyId)}/customer-channels`),
  create: (companyId: string, body: CreateChannelAccountInput) =>
    api.post<ChannelAccount>(`/companies/${encodeURIComponent(companyId)}/customer-channels`, body),
  update: (id: string, body: UpdateChannelAccountInput) =>
    api.patch<ChannelAccount>(`/customer-channels/${encodeURIComponent(id)}`, body),
  test: (id: string) => api.post<ChannelTestResult>(`/customer-channels/${encodeURIComponent(id)}/test`, {}),
};
