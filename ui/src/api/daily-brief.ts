import type { DailyBrief, DailyBriefPreference, UpdateDailyBriefPreferenceInput } from "@paperclipai/shared";
import { api } from "./client";

export const dailyBriefApi = {
  getPreferences: (companyId: string) =>
    api.get<DailyBriefPreference>(`/companies/${companyId}/daily-brief/preferences`),
  updatePreferences: (companyId: string, input: UpdateDailyBriefPreferenceInput) =>
    api.patch<DailyBriefPreference>(`/companies/${companyId}/daily-brief/preferences`, input),
  preview: (companyId: string, date?: string) => {
    const params = date ? `?date=${encodeURIComponent(date)}` : "";
    return api.get<DailyBrief>(`/companies/${companyId}/daily-brief/preview${params}`);
  },
};
