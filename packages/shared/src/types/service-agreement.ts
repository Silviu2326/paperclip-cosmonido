/** Sprint 3 WP10: recurring agreements and renewals. */
export type AgreementPeriodKind = "monthly" | "quarterly" | "yearly";
export type ServiceAgreementStatus = "active" | "notice" | "renewed" | "ended" | "cancelled";
export type AgreementPeriodStatus = "planned" | "active" | "delivered" | "skipped";

export interface ServiceAgreementDeliverable {
  title: string;
  acceptanceCriteria: string;
  expectedDeliverable?: string | null;
  budgetCents?: number | null;
}

export interface ServiceAgreement {
  id: string;
  companyId: string;
  customerId: string | null;
  proposalId: string | null;
  title: string;
  periodKind: AgreementPeriodKind;
  startsAt: Date | string;
  endsAt: Date | string | null;
  deliverablesPerPeriod: ServiceAgreementDeliverable[];
  status: ServiceAgreementStatus;
  autoRenew: boolean;
  noticeDays: number;
  assigneeAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AgreementPeriod {
  id: string;
  companyId: string;
  agreementId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  assignmentGoalId: string | null;
  renewalProposalId: string | null;
  renewalDecisionId: string | null;
  status: AgreementPeriodStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UpsellSuggestion {
  title: string;
  rationale: string;
  evidence: string[];
  estimatedPriceCents?: number | null;
  confidence: number;
}
