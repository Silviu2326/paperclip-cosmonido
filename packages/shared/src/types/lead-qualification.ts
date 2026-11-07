/** Sprint 3 WP2: qualification against criteria plus enrichment. */
export interface LeadQualificationReason {
  criterion: string;
  met: boolean | null;
  weight: number;
  note: string | null;
}

export interface LeadQualificationSource {
  kind: "enrichment" | "conversation" | "context" | "agent";
  ref: string;
  label?: string | null;
  url?: string | null;
}

export interface LeadQualification {
  id: string;
  companyId: string;
  leadId: string;
  criteriaVersion: string;
  score: number;
  reasons: LeadQualificationReason[];
  sources: LeadQualificationSource[];
  enrichment: Record<string, unknown> | null;
  agentId: string | null;
  runId: string | null;
  createdByUserId: string | null;
  createdAt: Date | string;
}

export interface EnrichmentResult {
  query: string;
  company: string | null;
  domain: string | null;
  size: string | null;
  sector: string | null;
  signals: string[];
  sources: Array<{ provider: string; url: string; title?: string | null }>;
  costCents: number;
}

/** Criteria document shape. Stored as a context file with role `procedure` and key `qualification-criteria`. */
export interface QualificationCriteria {
  version: string;
  criteria: Array<{ key: string; label: string; weight: number; description?: string | null }>;
  /** Score (0-100) at or above which the lead is qualified. */
  threshold: number;
}
