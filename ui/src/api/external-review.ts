import { api, requestResponse } from "./client";
import { readApiJson } from "./response";

// External deliverable review (pista I). The visitor token travels only in the
// X-Paperclip-Review-Token header; the page keeps it in the URL fragment.

export type ExternalReviewStatus = "pending_approval" | "active" | "revoked" | "rejected" | "expired";
export type ExternalReviewDecision = "open" | "accepted" | "changes_requested";
export type ExternalReviewResponseKind = "comment" | "accept" | "request_changes";

export interface ExternalReviewLink {
  id: string;
  customerId: string;
  customerName: string | null;
  contactId: string | null;
  targetId: string;
  targetTitle: string;
  targetVersion: string;
  stale: boolean;
  status: ExternalReviewStatus;
  decision: ExternalReviewDecision;
  revision: number;
  expiresAt: string;
  decidedAt: string | null;
  approvalId: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  commentCount: number;
}

export interface ExternalReviewEvent {
  kind: ExternalReviewResponseKind;
  body: string;
  authorLabel: string | null;
  targetVersion: string;
  createdAt: string;
}

export interface ExternalReviewCreateInput {
  targetId: string;
  contactId?: string | null;
  expiresAt?: string;
  idempotencyKey?: string;
  expectedTargetVersion?: string | null;
}

export interface ReviewDeliverable {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
}

export interface ReviewDeliverablesPage {
  items: ReviewDeliverable[];
  nextCursor: string | null;
}

export interface PublicExternalReview {
  companyName: string;
  customerName: string;
  title: string;
  summary: string | null;
  type: string | null;
  url: string | null;
  version: string;
  stale: boolean;
  decision: ExternalReviewDecision;
  revision: number;
  canDecide: boolean;
  canComment: boolean;
  expiresAt: string;
  events: ExternalReviewEvent[];
}

export interface PublicExternalReviewResponseInput {
  kind: ExternalReviewResponseKind;
  body: string;
  authorName?: string | null;
  targetVersion: string;
  expectedRevision: number;
  idempotencyKey: string;
}

const TOKEN_HEADER = "X-Paperclip-Review-Token";

export const externalReviewApi = {
  deliverables: (companyId: string, customerId: string, cursor?: string | null) => {
    const query = new URLSearchParams({ customerId });
    if (cursor) query.set("cursor", cursor);
    return api.get<ReviewDeliverablesPage>(`/companies/${companyId}/review-deliverables?${query}`);
  },
  create: (companyId: string, input: ExternalReviewCreateInput) =>
    api.post<{ link: ExternalReviewLink; url: string | null }>(`/companies/${companyId}/review-links`, input),
  list: (companyId: string, filter: { customerId?: string; targetId?: string } = {}) => {
    const query = new URLSearchParams();
    if (filter.customerId) query.set("customerId", filter.customerId);
    if (filter.targetId) query.set("targetId", filter.targetId);
    const suffix = query.size > 0 ? `?${query}` : "";
    return api.get<ExternalReviewLink[]>(`/companies/${companyId}/review-links${suffix}`);
  },
  events: (linkId: string) => api.get<ExternalReviewEvent[]>(`/review-links/${linkId}/events`),
  revealUrl: (linkId: string) => api.post<{ url: string }>(`/review-links/${linkId}/url`, {}),
  revoke: (linkId: string) => api.post<ExternalReviewLink>(`/review-links/${linkId}/revoke`, {}),

  async publicGet(companyId: string, linkId: string, token: string) {
    const response = await requestResponse(`/p/${companyId}/review/${linkId}`, {
      headers: { [TOKEN_HEADER]: token },
      cache: "no-store",
    });
    return readApiJson<PublicExternalReview>(response);
  },
  async publicRespond(companyId: string, linkId: string, token: string, input: PublicExternalReviewResponseInput) {
    const response = await requestResponse(`/p/${companyId}/review/${linkId}/responses`, {
      method: "POST",
      headers: { [TOKEN_HEADER]: token, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return readApiJson<PublicExternalReview & { replayed: boolean }>(response);
  },
};
