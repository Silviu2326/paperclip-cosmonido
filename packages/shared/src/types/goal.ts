import type { GoalLevel, GoalStatus } from "../constants.js";

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  level: GoalLevel;
  status: GoalStatus;
  kind?: "goal" | "assignment";
  acceptanceCriteria?: string | null;
  expectedDeliverable?: string | null;
  budgetCents?: number | null;
  projectId?: string | null;
  assigneeAgentId?: string | null;
  rootIssueId?: string | null;
  parentId: string | null;
  ownerAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
