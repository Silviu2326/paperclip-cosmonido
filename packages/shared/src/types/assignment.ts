export type AssignmentStatus = "planned" | "in_progress" | "awaiting_review" | "changes_requested" | "accepted" | "cancelled";

import type { Goal } from "./goal.js";
import type { Issue } from "./issue.js";

export interface Assignment extends Goal {
  kind: "assignment";
  acceptanceCriteria: string;
  expectedDeliverable: string | null;
  budgetCents: number | null;
  projectId: string | null;
  assigneeAgentId: string | null;
  rootIssueId: string | null;
  assignmentStatus: AssignmentStatus;
  rootIssue: Issue | null;
}
