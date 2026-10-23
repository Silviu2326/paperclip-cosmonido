import {
  onboardingMutationResponseSchema,
  onboardingSnapshotSchema,
  type OnboardingMutationResponse,
  type OnboardingSnapshot,
  type OnboardingUserEvent,
} from "@paperclipai/shared/productization/onboarding-api";
import type { OnboardingPath } from "@paperclipai/shared/productization/onboarding-journey";
import { api } from "@/api/client";

export type ProductOnboardingSnapshot = OnboardingSnapshot;
export type ProductOnboardingAgent = OnboardingSnapshot["availableAgents"][number];
export type ProductOnboardingGoal = OnboardingSnapshot["eligibleGoals"][number];
export type ProductOnboardingUserEvent = OnboardingUserEvent;
export type ProductOnboardingMutationResponse = OnboardingMutationResponse;
export type ProductOnboardingEventResponse = ProductOnboardingMutationResponse & {
  result: { accepted: boolean; reason?: string };
};

function path(companyId: string) {
  return `/companies/${encodeURIComponent(companyId)}/productization/onboarding`;
}

function parseSnapshot(value: unknown): ProductOnboardingSnapshot {
  const result = onboardingSnapshotSchema.safeParse(value);
  if (!result.success) throw new Error("El servidor devolvió un recorrido con formato no válido.");
  return result.data;
}

function parseMutation(value: unknown): ProductOnboardingMutationResponse {
  const result = onboardingMutationResponseSchema.safeParse(value);
  if (!result.success) throw new Error("El servidor devolvió un cambio de recorrido con formato no válido.");
  return result.data;
}

function parseEvent(value: unknown): ProductOnboardingEventResponse {
  const response = parseMutation(value);
  if (!response.result) throw new Error("El servidor no confirmó el resultado del cambio.");
  return { ...response, result: response.result };
}

export const productOnboardingApi = {
  get: (companyId: string, signal?: AbortSignal) =>
    api.get<unknown>(path(companyId), signal ? { signal } : undefined).then(parseSnapshot),
  selectPath: (companyId: string, input: { expectedRevision: number; path: OnboardingPath }) =>
    api.put<unknown>(path(companyId), input).then(parseSnapshot),
  recordEvent: (
    companyId: string,
    input: { expectedRevision: number; event: ProductOnboardingUserEvent },
  ) => api.post<unknown>(`${path(companyId)}/events`, input).then(parseEvent),
  selectTeam: (companyId: string, input: { expectedRevision: number; agentIds: string[] }) =>
    api.post<unknown>(`${path(companyId)}/team`, input).then(parseMutation),
  confirmTeamUse: (companyId: string, input: { expectedRevision: number }) =>
    api.post<unknown>(`${path(companyId)}/activate`, input).then(parseMutation),
  linkFirstJob: (companyId: string, input: { expectedRevision: number; goalId: string }) =>
    api.post<unknown>(`${path(companyId)}/first-job`, input).then(parseMutation),
};
