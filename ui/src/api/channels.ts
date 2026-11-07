import { api } from "./client";
import type {
  CustomerChannelAccount,
  CustomerChannelKind,
  CustomerChannelProvider,
  CreateCustomerChannelAccount,
  UpdateCustomerChannelAccount,
} from "@paperclipai/shared";

// Customer channel accounts (Sprint 2 pistas D/E). Board-only settings. Secret values are never
// sent or shown: accounts only carry the names of company secrets.

export type ChannelProvider = CustomerChannelProvider;
export type ChannelKind = CustomerChannelKind;
export type ChannelAccount = CustomerChannelAccount;
export type ChannelAccountStatus = ChannelAccount["status"];
export type ApprovedTemplate = ChannelAccount["approvedTemplates"][number];
export type CreateChannelAccountInput = CreateCustomerChannelAccount;
export type UpdateChannelAccountInput = UpdateCustomerChannelAccount;

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
  remove: (id: string) => api.delete<void>(`/customer-channels/${encodeURIComponent(id)}`),
};
