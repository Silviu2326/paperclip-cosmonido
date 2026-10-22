import type { OfficeLayout, OfficePatch } from "@paperclipai/shared";
import { api } from "./client";

/** Contract 3: `/api/companies/:companyId/office/*`. The layout is per user and per company. */
export type OfficeLayoutSource = "default" | "saved";
export interface OfficeLayoutResponse {
  layout: OfficeLayout;
  source: OfficeLayoutSource;
}
export interface OfficeHistoryEntry {
  role: "user" | "assistant";
  content: string;
}
export interface OfficeDesignChatRequest {
  message: string;
  layout: OfficeLayout;
  history: OfficeHistoryEntry[];
}
export interface OfficeDesignChatResponse {
  reply: string;
  patch: OfficePatch;
}

export const officeApi = {
  getLayout: (companyId: string) =>
    api.get<OfficeLayoutResponse>(`/companies/${companyId}/office/layout`),
  saveLayout: (companyId: string, layout: OfficeLayout) =>
    api.put<OfficeLayoutResponse>(`/companies/${companyId}/office/layout`, { layout }),
  resetLayout: (companyId: string) =>
    api.delete<OfficeLayoutResponse>(`/companies/${companyId}/office/layout`),
  designChat: (companyId: string, request: OfficeDesignChatRequest) =>
    api.post<OfficeDesignChatResponse>(`/companies/${companyId}/office/design-chat`, request),
};
