export interface DashboardRunActivityDay {
  date: string;
  succeeded: number;
  /**
   * True failures for the day, excluding process-loss/restart kills that were
   * later recovered by a successful retry (those are surfaced in `recovered`).
   */
  failed: number;
  /**
   * Runs that terminated in a failure state (failed/timed_out) but whose retry
   * chain eventually succeeded — e.g. restart-killed runs that recovered. Kept
   * out of `failed` so the headline failure count reflects true, unrecovered
   * failures.
   */
  recovered: number;
  other: number;
  total: number;
  /**
   * Per-error-code breakdown of the (true) `failed` count for the day, so a
   * spike can be attributed to an error class (e.g. `process_lost`,
   * `provider_quota`, `workspace_validation_failed`). Recovered runs are not
   * included here. Runs with no error code are bucketed under `unknown`.
   */
  failedByErrorCode: Record<string, number>;
}

/** A dashboard section either carries data or the reason it could not be built. */
export type DashboardSection<T> = ({ error?: undefined } & T) | { error: string };

export interface DashboardActiveAssignment {
  id: string;
  title: string;
  status: string;
  assigneeAgentId: string | null;
  assigneeName: string | null;
  rootIssueId: string | null;
  spendCents: number;
  budgetCents: number | null;
  lastEventAt: string | null;
  href: string;
}

export interface DashboardNeedsYouItem {
  kind: "approval" | "decision" | "deliverable_review";
  id: string;
  title: string;
  createdAt: string;
  href: string;
}

export interface DashboardCostWindow {
  spendCents: number;
  /** Events counted vs. events carrying an assignment; the rest is unattributed. */
  eventCount: number;
  assignmentCents: number;
  unattributedCents: number;
  /** Share of spend (0-100) attributed to an assignment; null when nothing was spent. */
  coveragePercent: number | null;
  /** Unpriced events and runs awaiting accounting make a window incomplete. */
  pricingComplete: boolean;
  from: string;
  to: string;
}

export interface DashboardAssignmentSections {
  activeAssignments?: DashboardSection<{ items: DashboardActiveAssignment[] }>;
  needsYou?: DashboardSection<{
    items: DashboardNeedsYouItem[];
    counts: { approvals: number; decisions: number; deliverableReviews: number };
  }>;
  costsToday?: DashboardSection<DashboardCostWindow>;
  costsThisWeek?: DashboardSection<DashboardCostWindow>;
}

export interface DashboardSummary extends DashboardAssignmentSections {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  budgets: {
    activeIncidents: number;
    pendingApprovals: number;
    pausedAgents: number;
    pausedProjects: number;
  };
  runActivity: DashboardRunActivityDay[];
}
