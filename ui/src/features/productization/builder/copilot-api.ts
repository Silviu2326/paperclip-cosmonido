import type { DecisionAvailability } from "@paperclipai/shared";
import type { BuilderApplication, BuilderSandboxRun, CopilotOutcome, CopilotProposalRequest, CopilotApplyPlanRequest, CopilotApplyChangeRequest, CopilotSandboxRequest } from "@paperclipai/shared/productization/description-builder";
import { api, requestResponse } from "@/api/client";
import { readApiJson } from "@/api/response";
import type { BuilderJourneySnapshot } from "./api";

const path = (id: string) => `/companies/${encodeURIComponent(id)}/productization/builder/copilot`;
type Saved = Pick<BuilderJourneySnapshot, "journey" | "revision" | "serverNow">;
export const configurationCopilotApi = {
  availability: async (companyId: string, signal?: AbortSignal) => readApiJson<{ proposal: DecisionAvailability; sandbox: DecisionAvailability }>(await requestResponse(path(companyId), { signal, cache: "no-store" })),
  snapshot: async (companyId: string, signal?: AbortSignal) => readApiJson<BuilderJourneySnapshot>(await requestResponse(`/companies/${encodeURIComponent(companyId)}/productization/onboarding`, { signal, cache: "no-store" })),
  propose: (id: string, input: CopilotProposalRequest) => api.post<CopilotOutcome<Saved & { draftId: string; version: number; replayed: boolean; diff: Array<{ field: string; from: unknown; to: unknown }> }>>(`${path(id)}/propose`, input),
  plan: (id: string, input: CopilotApplyPlanRequest) => api.post<Saved & { application: BuilderApplication; replayed: boolean }>(`${path(id)}/plan`, input),
  apply: (id: string, input: CopilotApplyChangeRequest) => api.post<Saved & { application: BuilderApplication; replayed: boolean }>(`${path(id)}/apply`, input),
  sandbox: (id: string, input: CopilotSandboxRequest) => api.post<CopilotOutcome<Saved & { run: BuilderSandboxRun; replayed: boolean }>>(`${path(id)}/sandbox`, input),
};
