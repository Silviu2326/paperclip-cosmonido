import type { DeliverableReview, DeliverableReviewState, DeliverableTargetKind } from "@paperclipai/shared";
import { api } from "./client";
export const deliverableReviewsApi = {
  listByGoal: (id: string) => api.get<DeliverableReview[]>(`/goals/${id}/deliverable-reviews`),
  listByIssue: (id: string) => api.get<DeliverableReview[]>(`/issues/${id}/deliverable-reviews`),
  listPending: (companyId: string) => api.get<DeliverableReview[]>(`/companies/${companyId}/deliverable-reviews?state=pending`),
  submit: (companyId: string, input: { goalId?: string | null; issueId?: string | null; targetKind: DeliverableTargetKind; targetId: string; targetVersion: string; summary: string }) => api.post<DeliverableReview>(`/companies/${companyId}/deliverable-reviews`, input),
  resolve: (id: string, input: { state: Extract<DeliverableReviewState, "accepted" | "changes_requested">; reason?: string; expectedRevision?: string }) => api.post<DeliverableReview>(`/deliverable-reviews/${id}/resolve`, input),
};
