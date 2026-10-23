import { api, detachInflightGet } from "./client";

export type CrmSyncProvider = "hubspot" | "pipedrive";
export type CrmSyncDirection = "import" | "export" | "both";
export type CrmSyncToolNames = Partial<Record<"listCustomer" | "createCustomer" | "updateCustomer" | "listContact" | "createContact" | "updateContact", string>>;

export interface CrmSyncJob {
  id: string;
  direction: CrmSyncDirection;
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked";
  stats: Record<string, number>;
  errorCount: number;
  errors: Array<Record<string, unknown>>;
  blockedReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface CrmSyncProviderState {
  provider: CrmSyncProvider;
  label: string;
  configured: boolean;
  enabled: boolean;
  direction: CrmSyncDirection | null;
  primarySystem: "paperclip" | "external" | "manual" | null;
  toolNames: Record<string, string>;
  disconnectedAt: string | null;
  connection: { id: string; name: string; status: string; enabled: boolean } | null;
  ready: boolean;
  blockers: string[];
  links: { linked: number; conflict: number; uncertain: number; error: number };
  openJob: CrmSyncJob | null;
  lastJob: CrmSyncJob | null;
  lastSuccessfulSyncAt: string | null;
}

export interface CrmSyncConnection { id: string; name: string; status: string; enabled: boolean }
export interface CrmSyncAttention {
  id: string;
  provider: CrmSyncProvider;
  entityKind: "customer" | "contact";
  localId: string;
  externalId: string | null;
  status: "conflict" | "uncertain" | "error";
  conflict: Record<string, unknown> | null;
}

const path = (companyId: string) => `/companies/${companyId}/crm/sync`;

export const crmSyncApi = {
  status: (companyId: string) => {
    detachInflightGet(`${path(companyId)}/status`);
    return api.get<{ providers: CrmSyncProviderState[] }>(`${path(companyId)}/status`);
  },
  connections: (companyId: string, provider: CrmSyncProvider) => {
    const url = `${path(companyId)}/connections?provider=${provider}`;
    detachInflightGet(url);
    return api.get<CrmSyncConnection[]>(url);
  },
  attention: (companyId: string) => {
    detachInflightGet(`${path(companyId)}/attention`);
    return api.get<CrmSyncAttention[]>(`${path(companyId)}/attention`);
  },
  saveConfig: (companyId: string, provider: CrmSyncProvider, body: { connectionId: string; direction: CrmSyncDirection; primarySystem: "paperclip" | "external" | "manual"; enabled: boolean; toolNames: CrmSyncToolNames }) =>
    api.put<{ providers: CrmSyncProviderState[] }>(`${path(companyId)}/${provider}/config`, body),
  disconnect: (companyId: string, provider: CrmSyncProvider) =>
    api.post<{ providers: CrmSyncProviderState[] }>(`${path(companyId)}/${provider}/disconnect`, {}),
  start: (companyId: string, provider: CrmSyncProvider) =>
    api.post<CrmSyncJob>(`${path(companyId)}/${provider}/jobs`, { idempotencyKey: crypto.randomUUID() }),
  resume: (companyId: string, jobId: string) =>
    api.post<CrmSyncJob>(`${path(companyId)}/jobs/${jobId}/resume`, {}),
  resolve: (companyId: string, linkId: string, body: { resolution: "keep_local" | "keep_external" | "retry_create" | "link_external"; externalId?: string }) =>
    api.post<{ id: string; resolved: boolean; job?: CrmSyncJob }>(`${path(companyId)}/links/${linkId}/resolve`, body),
};
