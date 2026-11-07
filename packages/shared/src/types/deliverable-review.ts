export type DeliverableTargetKind = "work_product" | "company_file_version" | "document_revision";
export type DeliverableReviewState = "pending" | "accepted" | "changes_requested";
export interface DeliverableReview {
  id: string; companyId: string; goalId: string | null; issueId: string | null;
  targetKind: DeliverableTargetKind; targetId: string; targetVersion: string;
  state: DeliverableReviewState; reviewerUserId: string | null; reviewerAgentId: string | null;
  reason: string | null; evidence: Record<string, unknown> | null;
  reviewedAt: Date | null; createdAt: Date; updatedAt: Date;
}
