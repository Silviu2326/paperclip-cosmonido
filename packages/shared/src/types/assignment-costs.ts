/** Cost attribution of assignments (goals with kind='assignment') and their descendant tasks. */

export interface AssignmentCostTotals {
  eventCount: number;
  estimatedEventCount: number;
  unpricedEventCount: number;
  costCents: number;
  costCentsExact: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface GoalCostRow extends AssignmentCostTotals {
  goalId: string;
  title: string;
  kind: string;
  status: string;
  budgetCents: number | null;
}

/** Company-wide report. `sum(rows) + unattributed === total`. */
export interface GoalCostReport {
  companyId: string;
  rows: GoalCostRow[];
  /** Events with no goal, directly or through the task tree. Always present. */
  unattributed: AssignmentCostTotals;
  total: AssignmentCostTotals;
}

export interface GoalCostByAgent extends AssignmentCostTotals {
  agentId: string | null;
  agentName: string | null;
}

export interface GoalCostByProvider extends AssignmentCostTotals {
  provider: string;
  usageKind: string;
}

/** One bucket per event: the event's task is mapped to exactly one deliverable. */
export interface GoalCostByDeliverable extends AssignmentCostTotals {
  /** Null bucket holds events whose task has no work product, or that have no task. */
  workProductId: string | null;
  title: string | null;
  issueId: string | null;
}

export interface GoalCostSummary {
  companyId: string;
  goalId: string;
  title: string;
  kind: string;
  budgetCents: number | null;
  /** `budgetCents - total.costCents`, floored at 0; null without a budget. */
  remainingBudgetCents: number | null;
  overBudget: boolean;
  total: AssignmentCostTotals;
  byAgent: GoalCostByAgent[];
  byProvider: GoalCostByProvider[];
  byDeliverable: GoalCostByDeliverable[];
  /** Part of `total` with no agent (decision or fast-response usage); also the null row of `byAgent`. */
  unattributed: AssignmentCostTotals;
}
