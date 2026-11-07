/** Sprint 3 WP9: sale → delivery handoff. */
export type HandoffSourceKind = "proposal" | "opportunity";
export type HandoffStatus = "partial" | "complete";
export type HandoffStep = "project" | "assignment" | "team" | "brief" | "summary";
export const HANDOFF_STEPS: readonly HandoffStep[] = ["project", "assignment", "team", "brief", "summary"];

export interface HandoffReceipt {
  id: string;
  companyId: string;
  sourceKind: HandoffSourceKind;
  sourceId: string;
  customerId: string | null;
  projectId: string | null;
  assignmentGoalId: string | null;
  teamCatalogKey: string | null;
  status: HandoffStatus;
  stepsDone: string[];
  error: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
