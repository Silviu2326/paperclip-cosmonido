import type {
  ExternalActionType,
  AutonomyBenchRun,
  AutonomyMatrixCell,
  AutonomyPolicy,
} from "@paperclipai/shared";
import { api } from "./client";

export type GrantAutonomyPayload = {
  agentId: string;
  actionType: ExternalActionType;
  level: AutonomyPolicy["level"];
  reason?: string | null;
  benchRunId?: string | null;
};

export type RevokeAutonomyPayload = {
  agentId: string;
  actionType: ExternalActionType;
  reason: string;
};

export type RunAutonomyBenchPayload = {
  agentId: string;
  actionType: ExternalActionType;
  sampleSize?: number;
  threshold?: number;
};

export const autonomyApi = {
  matrix: (companyId: string) => api.get<AutonomyMatrixCell[]>(`/companies/${companyId}/autonomy`),
  history: (companyId: string, agentId: string, actionType: ExternalActionType) => {
    const params = new URLSearchParams({ agentId, actionType });
    return api.get<AutonomyPolicy[]>(`/companies/${companyId}/autonomy/history?${params}`);
  },
  grant: (companyId: string, input: GrantAutonomyPayload) =>
    api.post<AutonomyPolicy>(`/companies/${companyId}/autonomy/grant`, input),
  revoke: (companyId: string, input: RevokeAutonomyPayload) =>
    api.post<{ policy: AutonomyPolicy; triggersDisabled: number }>(`/companies/${companyId}/autonomy/revoke`, input),
  runBench: (companyId: string, input: RunAutonomyBenchPayload) =>
    api.post<AutonomyBenchRun>(`/companies/${companyId}/autonomy/bench`, input),
  benchRun: (id: string) => api.get<AutonomyBenchRun>(`/autonomy-bench-runs/${id}`),
};
