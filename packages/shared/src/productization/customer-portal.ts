export type CustomerPortalResourceKind = "deliverables" | "proposals" | "meetings" | "conversations" | "commitments" | "files";

/** Kinds granted when a link is created without an explicit list. `files` is always an explicit opt-in. */
export const CUSTOMER_PORTAL_DEFAULT_RESOURCE_KINDS: readonly CustomerPortalResourceKind[] = ["deliverables", "proposals", "meetings", "conversations", "commitments"];

/** Hard bounds for portal files. The server enforces them; the UI only mirrors them for early feedback. */
export const CUSTOMER_PORTAL_FILE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxFilesPerPortal: 25,
  maxTotalBytesPerPortal: 100 * 1024 * 1024,
  maxNameLength: 120,
} as const;

export const CUSTOMER_PORTAL_FILE_CONTENT_TYPES: readonly string[] = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export interface CustomerPortalGrant {
  id: string;
  companyId: string;
  customerId: string;
  contactId: string | null;
  expiresAt: string;
  revokedAt: string | null;
  resourceKinds: CustomerPortalResourceKind[];
  allowDeliverableFeedback: boolean;
  allowFileUploads: boolean;
}

export interface CustomerPortalCreateInput {
  customerId: string;
  contactId?: string | null;
  expiresAt: string;
  resourceKinds?: CustomerPortalResourceKind[];
  allowDeliverableFeedback?: boolean;
  /** Lets the link holder upload files. Requires `files` in `resourceKinds`. */
  allowFileUploads?: boolean;
}

export type CustomerPortalFileState = "pending" | "stored" | "rejected" | "abandoned";
export type CustomerPortalFileDirection = "inbound" | "outbound";

/** What the link holder sees about a file. Never includes object keys, asset ids or row ids. */
export interface PublicCustomerPortalFile {
  reference: string;
  name: string;
  contentType: string;
  byteSize: number;
  direction: CustomerPortalFileDirection;
  state: CustomerPortalFileState;
  createdAt: string;
}

export interface PublicCustomerPortalFiles {
  canUpload: boolean;
  limits: { maxBytes: number; maxFiles: number; contentTypes: string[] };
  items: PublicCustomerPortalFile[];
}

/** Persisted upload receipt; the same body is returned for every retry of one idempotency key. */
export interface CustomerPortalUploadReceipt {
  idempotencyKey: string;
  file: PublicCustomerPortalFile;
  sha256: string;
  replayed: boolean;
}

/** Board view of a scoped file. */
export interface CustomerPortalFileRecord {
  id: string;
  customerId: string;
  contactId: string | null;
  portalId: string | null;
  direction: CustomerPortalFileDirection;
  state: CustomerPortalFileState;
  visibleToCustomer: boolean;
  name: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

export interface CustomerPortalCreated extends CustomerPortalGrant {
  token: string;
  url: string;
}

export interface PublicCustomerPortalData {
  brand?: { displayName: string; primaryColor: string; accentColor: string; logoUrl: string | null; domainStatus: "unavailable" } | null;
  companyName: string;
  customerName: string;
  contactName: string | null;
  deliverables: Array<{ reference: string; title: string; summary: string | null; status: string; updatedAt: string }>;
  allowDeliverableFeedback: boolean;
  proposals: Array<{
    reference: string; title: string; revision: number; scope: Array<{ title: string; description?: string | null; quantity?: number | null; unitPriceCents?: number | null }>;
    terms: string | null; priceCents: number; depositCents: number | null; currency: string; validUntil: string | null;
    status: string; paymentStatus: string; paymentUrl: string | null;
  }>;
  meetings: Array<{ title: string; startsAt: string; endsAt: string; status: string; meetingLink: string | null }>;
  conversations: Array<{
    reference: string; subject: string | null; status: string; updatedAt: string;
    messages: Array<{ direction: string; actorKind: string; body: string; createdAt: string }>;
  }>;
  commitments: Array<{ who: string; what: string; dueAt: string | null; status: string }>;
  /** Present only when the link includes the `files` kind. */
  files: PublicCustomerPortalFiles | null;
}

export interface CustomerPortalCommentInput { conversationRef: string; body: string; }
export interface CustomerPortalProposalAcceptanceInput { proposalReference: string; revision: number; name: string; email: string; }
export type CustomerPortalFeedbackDecision = "accept" | "changes_requested";
export interface CustomerPortalFeedbackInput { reference: string; decision: CustomerPortalFeedbackDecision; comment: string; idempotencyKey: string; }
export interface CustomerPortalFeedbackRecord {
  targetKind: "work_product"; targetTitle: string; targetVersion: string;
  decision: CustomerPortalFeedbackDecision; comment: string; actorKind: "portal_token_holder"; createdAt: string;
}
