/** Sprint 3 WP5: commercial decisions on top of the existing `decisions` table. */
export type CommercialDecisionType =
  | "approve_send"
  | "approve_proposal"
  | "price_exception"
  | "discard_lead"
  | "escalate_customer"
  | "raise_autonomy";
export const COMMERCIAL_DECISION_TYPES: readonly CommercialDecisionType[] = [
  "approve_send", "approve_proposal", "price_exception", "discard_lead", "escalate_customer", "raise_autonomy",
];

export type CommercialSubjectKind = "lead" | "opportunity" | "conversation" | "proposal" | "customer" | "autonomy_policy" | "message_draft";

/** Stored in `decisions.metadata.commercial`. */
export interface CommercialDecisionMetadata {
  type: CommercialDecisionType;
  subject: { kind: CommercialSubjectKind; id: string };
  /** Version of the subject when the decision was created (e.g. proposal revision, `updatedAt` ISO). Resolution with a stale version is 409. */
  subjectVersion: string;
  /** Declared effect per option id, applied by the domain service when the option is chosen. */
  effects: Record<string, CommercialDecisionEffect>;
  continuation?: { playbookRunId?: string | null; messageId?: string | null } | null;
  /** Agent whose shadow statistics this decision feeds, when the subject is a draft. */
  shadowAgentId?: string | null;
  shadowActionType?: string | null;
}

export type CommercialDecisionEffect =
  | { kind: "send_message"; messageId: string }
  | { kind: "send_proposal"; proposalId: string }
  | { kind: "apply_price_exception"; proposalId: string; priceCents: number }
  | { kind: "discard_lead"; leadId: string; reason?: string | null }
  | { kind: "escalate_customer"; customerId: string; note?: string | null }
  | { kind: "raise_autonomy"; agentId: string; actionType: string; level: string; benchRunId?: string | null }
  | { kind: "advance_playbook"; playbookRunId: string }
  | { kind: "none" };

export interface RemoteDecisionLink {
  decisionId: string;
  url: string;
  expiresAt: string;
}
