import type { ConvertLead, CreateLead, CrmActivity, Lead, LeadSource, LeadStatus, UpdateLead } from "@paperclipai/shared";
import { api } from "./client";
import type { CrmPage } from "./crm";

export interface LeadListFilters {
  q?: string;
  status?: LeadStatus;
  source?: LeadSource;
  priority?: "low" | "normal" | "high";
  /** "unassigned" | "user:<userId>" | "agent:<agentId>" */
  assigned?: string;
  cursor?: string;
  limit?: number;
}

export interface LeadTriageInput {
  priority?: "low" | "normal" | "high" | null;
  language?: string | null;
  assignedAgentId?: string | null;
  assignedUserId?: string | null;
}

export type CsvLeadField = "name" | "email" | "phone" | "company" | "language" | "message" | "sourceRef";

export interface CsvImportRequest {
  csv: string;
  mapping?: Partial<Record<CsvLeadField, string>>;
  skipDuplicates?: boolean;
}

export interface CsvPreviewRow {
  line: number;
  status: "ready" | "duplicate" | "invalid";
  duplicateReason: "in_file" | "existing_lead" | null;
  knownContact: boolean;
  errors: string[];
  values: Partial<Record<CsvLeadField, string>>;
}

export interface CsvPreview {
  delimiter: string;
  headers: string[];
  mapping: Record<CsvLeadField, string | null>;
  totals: { rows: number; ready: number; duplicate: number; invalid: number; knownContacts: number };
  rows: CsvPreviewRow[];
  previewLimit: number;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
  total: number;
}

function withQuery(path: string, query?: object) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const leadsApi = {
  list: (companyId: string, filters?: LeadListFilters) =>
    api.get<CrmPage<Lead>>(withQuery(`/companies/${companyId}/leads`, filters)),
  get: (id: string) => api.get<Lead>(`/leads/${id}`),
  activity: (id: string) => api.get<CrmActivity[]>(`/leads/${id}/activity`),
  create: (companyId: string, data: CreateLead) => api.post<Lead>(`/companies/${companyId}/leads`, data),
  update: (id: string, data: UpdateLead) => api.patch<Lead>(`/leads/${id}`, data),
  triage: (id: string, data: LeadTriageInput) => api.post<Lead>(`/leads/${id}/triage`, data),
  convert: (id: string, data: ConvertLead) => api.post<Lead>(`/leads/${id}/convert`, data),
  discard: (id: string, reason?: string) => api.post<Lead>(`/leads/${id}/discard`, { reason }),
  // CSV import: preview classifies rows without writing; import confirms the same body.
  previewCsv: (companyId: string, body: CsvImportRequest) =>
    api.post<CsvPreview>(`/companies/${companyId}/leads/import/preview`, body),
  importCsv: (companyId: string, body: CsvImportRequest) =>
    api.post<CsvImportResult>(`/companies/${companyId}/leads/import`, body),
};
