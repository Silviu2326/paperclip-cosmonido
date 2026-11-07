/**
 * Sprint 3 WP6/WP7: commitment candidates and commercial triggers.
 * Persistence lives in the Sprint 2 `commitments` table; until it exists these shapes travel through the API only.
 */
export interface CommitmentCandidate {
  who: "us" | "them";
  what: string;
  dueAt: string | null;
  confidence: number;
  /** Stable hash of conversationId + normalized text; the persistence layer deduplicates on it. */
  fingerprint: string;
  evidence: string | null;
}

export type CommercialTriggerKind =
  | "no_reply"
  | "meeting_held"
  | "stage_changed"
  | "lead_unattended"
  | "commitment_due_soon";

export interface CommercialTriggerEvent {
  kind: CommercialTriggerKind;
  companyId: string;
  subjectKind: "lead" | "opportunity" | "conversation" | "commitment" | "customer";
  subjectId: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
}
