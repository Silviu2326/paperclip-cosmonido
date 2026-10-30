/** Sprint 3 WP8: proposals, light signature and deposit. */
export type ProposalStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
export type ProposalPaymentStatus = "none" | "link_created" | "paid" | "failed";

export interface ProposalScopeItem {
  title: string;
  description?: string | null;
  quantity?: number | null;
  unitPriceCents?: number | null;
}

export interface ProposalAcceptanceEvidence {
  name: string;
  email: string;
  acceptedAt: string;
  ip: string | null;
  userAgent: string | null;
  revision: number;
}

export interface Proposal {
  id: string;
  companyId: string;
  proposalKey: string;
  revision: number;
  opportunityId: string | null;
  customerId: string | null;
  title: string;
  scope: ProposalScopeItem[];
  terms: string | null;
  priceCents: number;
  depositCents: number | null;
  currency: string;
  validUntil: Date | string | null;
  status: ProposalStatus;
  documentId: string | null;
  publicToken: string | null;
  acceptanceEvidence: ProposalAcceptanceEvidence | null;
  stripePaymentLinkId: string | null;
  stripePaymentLinkUrl: string | null;
  paymentStatus: ProposalPaymentStatus;
  paidAt: Date | string | null;
  sentAt: Date | string | null;
  viewedAt: Date | string | null;
  acceptedAt: Date | string | null;
  rejectedAt: Date | string | null;
  expiredAt: Date | string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProposalPage {
  items: Proposal[];
  nextCursor: string | null;
}

/** What the public page shows: never the company internals, never other revisions. */
export interface PublicProposalView {
  title: string;
  companyName: string;
  revision: number;
  scope: ProposalScopeItem[];
  terms: string | null;
  priceCents: number;
  depositCents: number | null;
  currency: string;
  validUntil: string | null;
  status: ProposalStatus;
  paymentStatus: ProposalPaymentStatus;
  paymentUrl: string | null;
  bodyMarkdown: string | null;
}
