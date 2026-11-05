import type { AutopilotConfig, AutopilotPlan, ProjectAutopilot } from "@paperclipai/shared";
import { api } from "./client";
const path = (id: string) => `/projects/${encodeURIComponent(id)}/autopilot`;
export const autopilotApi = {
  get: (id: string) => api.get<ProjectAutopilot | null>(path(id)),
  configure: (id: string, config: AutopilotConfig, expectedRevision?: number) => api.put<ProjectAutopilot>(path(id), { config, expectedRevision }),
  discover: (id: string) => api.post<ProjectAutopilot>(`${path(id)}/discover`, {}),
  select: (id: string, planId: AutopilotPlan["id"]) => api.post<ProjectAutopilot>(`${path(id)}/select`, { planId }),
  feedback: (id: string, text: string) => api.post<ProjectAutopilot>(`${path(id)}/feedback`, { text }),
};
