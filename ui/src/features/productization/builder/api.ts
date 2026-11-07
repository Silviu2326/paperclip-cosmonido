import type { BuilderDraft, BuilderSelection } from "@paperclipai/shared/productization/description-builder";
import type { OnboardingJourney } from "@paperclipai/shared/productization/onboarding-journey";
import { api } from "@/api/client";

export type BuilderJourneySnapshot = {
  journey: OnboardingJourney & { builderDrafts?: BuilderDraft[] };
  availableAgents: Array<{ id: string; name: string; title: string | null }>;
  revision: number;
  serverNow: string;
};
export type BuilderConnection = {
  id: string;
  applicationKey: string | null;
  applicationName: string;
  name: string;
  stage: "available" | "connected" | "authorized" | "checked";
  healthStatus: string;
  checkedAt: string | null;
  reconnectPath: string;
  evidence: "stored_provider_health_check" | null;
};
export type BuilderSavedResponse = {
  journey: BuilderJourneySnapshot["journey"];
  revision: number;
  draftId: string;
  version: number;
  serverNow: string;
  generation: { status: "not_configured"; provider: null };
};
const companyPath = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/productization`;

export const businessBuilderApi = {
  onboarding: (companyId: string, signal?: AbortSignal) => api.get<BuilderJourneySnapshot>(`${companyPath(companyId)}/onboarding`, signal ? { signal } : undefined),
  skills: (companyId: string) => api.get<Array<{ id: string; name: string; key: string; compatibility: string }>>(`/companies/${encodeURIComponent(companyId)}/skills`),
  connections: (companyId: string) => api.get<{ connections: BuilderConnection[]; serverNow: string }>(`${companyPath(companyId)}/builder/connections`),
  extractionAvailability: (companyId: string) => api.get<{ status: string; canExtract: boolean; connectionId: string | null; reason: string }>(`${companyPath(companyId)}/builder/url-extraction`),
  save: (companyId: string, input: { expectedRevision: number; draftId?: string; description: string; selection: BuilderSelection }) => api.post<BuilderSavedResponse>(`${companyPath(companyId)}/builder/drafts`, input),
  clone: (companyId: string, draftId: string, input: { expectedRevision: number; sourceVersion: number }) => api.post<BuilderSavedResponse>(`${companyPath(companyId)}/builder/drafts/${encodeURIComponent(draftId)}/clone`, input),
  compare: (companyId: string, input: { leftDraftId: string; leftVersion: number; rightDraftId: string; rightVersion: number }) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) query.set(key, String(value));
    return api.get<{ left: { draftId: string; version: number; description: string; selection: BuilderSelection }; right: { draftId: string; version: number; description: string; selection: BuilderSelection }; changes: Record<string, boolean> }>(`${companyPath(companyId)}/builder/compare?${query}`);
  },
  configurationPreview: (companyId: string, input: { expectedRevision: number; draftId: string; version: number }) => api.post<{
    mode: "configuration_preview"; executed: false; createdAgent: false; changedPermissions: false; startedExecution: false;
    draftId: string; version: number; checks: { descriptionPresent: boolean; roleSelected: boolean; selectedSkills: number; selectedConnections: number; authorizedConnections: number; connectionsNeedAuthorization: string[]; requestedMonthlyBudgetUsd: number; budgetApplied: false; autonomyApplied: false };
    nextAction: string; serverNow: string;
  }>(`${companyPath(companyId)}/builder/configuration-preview`, input),
};
