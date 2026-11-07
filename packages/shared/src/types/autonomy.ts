import type { AutonomyLevel } from "../constants/crm.js";

/** Sprint 3 WP3/WP4: earned autonomy. */
export type AutonomyActionType = "email" | "message" | "booking" | "stage_change" | "proposal" | "publish" | "call" | "review_link";
export const AUTONOMY_ACTION_TYPES: readonly AutonomyActionType[] = ["email", "message", "booking", "stage_change", "proposal", "publish", "call", "review_link"];

export interface AutonomyPolicy {
  id: string;
  companyId: string;
  agentId: string | null;
  actionType: AutonomyActionType;
  level: AutonomyLevel;
  grantedByUserId: string | null;
  grantedByAgentId: string | null;
  grantedAt: Date | string;
  reason: string | null;
  benchRunId: string | null;
  revokedAt: Date | string | null;
  revokedByUserId: string | null;
  revokedReason: string | null;
  createdAt: Date | string;
}

export interface AutonomyShadowStats {
  agentId: string;
  actionType: AutonomyActionType;
  drafts: number;
  sentUnchanged: number;
  edited: number;
  rejected: number;
  /** 0..1 share of drafts sent without edits; null when there are no drafts. */
  unchangedRatio: number | null;
  windowDays: number;
}

export type ShadowOutcome = "sent_unchanged" | "edited" | "rejected";

export interface AutonomyEffectiveLevel {
  companyId: string;
  agentId: string | null;
  actionType: AutonomyActionType;
  level: AutonomyLevel;
  /** Which grant produced the level: company-wide, agent-specific, or the default when nothing was granted. */
  source: "default" | "company" | "agent";
  policyId: string | null;
}

export interface AutonomyMatrixCell {
  agentId: string;
  actionType: AutonomyActionType;
  level: AutonomyLevel;
  source: AutonomyEffectiveLevel["source"];
  policyId: string | null;
  stats: AutonomyShadowStats;
  latestBench: AutonomyBenchRun | null;
  canRaise: boolean;
  nextLevel: AutonomyLevel | null;
}

export type AutonomyBenchStatus = "running" | "done" | "failed" | "cancelled";

export interface AutonomyBenchFailure {
  caseId: string;
  dimension: "appropriateness" | "tone" | "facts" | "proposed_action";
  expected: string;
  actual: string;
  score: number;
  note?: string | null;
}

export interface AutonomyBenchRun {
  id: string;
  companyId: string;
  agentId: string;
  actionType: AutonomyActionType;
  sampleSize: number;
  casesEvaluated: number;
  status: AutonomyBenchStatus;
  score: number | null;
  threshold: number | null;
  failures: AutonomyBenchFailure[];
  costCents: number;
  judgeModel: string | null;
  error: string | null;
  createdByUserId: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
  createdAt: Date | string;
}

/** One replay case: the conversation up to the cut-off, what a human (or approved draft) actually answered, and metadata. */
export interface AutonomyBenchCase {
  caseId: string;
  actionType: AutonomyActionType;
  transcript: Array<{ role: "contact" | "us" | "system"; text: string; at?: string | null }>;
  reference: { text: string; proposedAction?: string | null };
  source: "fixture" | "conversation" | "decision_training_example";
  sourceId?: string | null;
}
