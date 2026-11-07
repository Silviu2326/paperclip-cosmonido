import { api } from "./client";

// Web chat settings (pista F): active flag, greeting and brand color per company.
// The widget itself is served by the public surface at /api/p/:companyId/widget.js.

export interface WebchatSettings {
  active: boolean;
  greeting: string | null;
  brandColor: string | null;
}

export const webchatApi = {
  getSettings: (companyId: string) => api.get<WebchatSettings>(`/companies/${companyId}/webchat/settings`),
  saveSettings: (companyId: string, data: WebchatSettings) =>
    api.put<WebchatSettings>(`/companies/${companyId}/webchat/settings`, data),
};
