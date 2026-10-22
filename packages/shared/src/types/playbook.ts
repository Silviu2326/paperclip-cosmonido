/** Sprint 3 WP1: playbooks. */
export type AutonomyLevel = "draft_only" | "send_with_approval" | "send_direct";
export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ["draft_only", "send_with_approval", "send_direct"];
/** Numeric rank so `min()` over levels is well defined: a playbook never raises autonomy above the agent's grant. */
export const AUTONOMY_LEVEL_RANK: Record<AutonomyLevel, number> = { draft_only: 0, send_with_approval: 1, send_direct: 2 };
export function minAutonomyLevel(...levels: Array<AutonomyLevel | null | undefined>): AutonomyLevel {
  let result: AutonomyLevel = "send_direct";
  for (const level of levels) {
    if (level && AUTONOMY_LEVEL_RANK[level] < AUTONOMY_LEVEL_RANK[result]) result = level;
  }
  return result;
}

export type PlaybookStepKind = "qualify" | "respond" | "follow_up" | "propose" | "book" | "close" | "handoff" | "wait";
export type PlaybookChannel = "email" | "whatsapp" | "sms" | "chat" | "call" | "internal";
export type PlaybookScopeKind = "lead_type" | "offering" | "customer_segment";
export type PlaybookStatus = "draft" | "active" | "archived";
export type PlaybookSubjectKind = "lead" | "opportunity" | "conversation" | "customer";
export type PlaybookRunStatus = "running" | "waiting" | "paused" | "done" | "failed" | "cancelled";

export interface PlaybookStep {
  key: string;
  kind: PlaybookStepKind;
  title?: string | null;
  channel?: PlaybookChannel | null;
  delayHours?: number | null;
  /** Free-form condition evaluated by the agent, e.g. "no reply in 3 days". */
  condition?: string | null;
  templateKey?: string | null;
  autonomy: AutonomyLevel;
  maxAttempts?: number | null;
  instructions?: string | null;
}

export interface Playbook {
  id: string;
  companyId: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  status: PlaybookStatus;
  scopeKind: PlaybookScopeKind;
  scopeValue: string | null;
  steps: PlaybookStep[];
  createdByAgentId: string | null;
  createdByUserId: string | null;
  publishedAt: Date | string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PlaybookRun {
  id: string;
  companyId: string;
  playbookId: string;
  playbookVersion: number;
  subjectKind: PlaybookSubjectKind;
  subjectId: string;
  agentId: string | null;
  currentStepIndex: number;
  status: PlaybookRunStatus;
  nextActionAt: Date | string | null;
  lastActionAt: Date | string | null;
  lastRoutineId: string | null;
  lastRunId: string | null;
  attempts: Record<string, number>;
  idempotencyKey: string | null;
  failureReason: string | null;
  startedByAgentId: string | null;
  startedByUserId: string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PlaybookUsageSummary {
  playbookId: string;
  runningRuns: number;
  waitingRuns: number;
  doneRuns: number;
  failedRuns: number;
}
