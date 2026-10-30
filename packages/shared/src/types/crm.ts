import type {
  AutonomyLevel,
  CommitmentSource,
  CommitmentStatus,
  CommitmentWho,
  ContactIdentityChannel,
  ContactStatus,
  ConversationChannel,
  ConversationPriority,
  ConversationStatus,
  CrmActivityKind,
  CrmSubjectKind,
  CustomerHealth,
  CustomerKind,
  CustomerStatus,
  DeliveryStatus,
  ExternalActionMode,
  ExternalActionStatus,
  ExternalActionType,
  LeadPriority,
  LeadSource,
  LeadStatus,
  MessageActorKind,
  MessageDirection,
  OpportunityStatus,
} from "../constants/crm.js";

// Dates are ISO 8601 strings on the wire.

export interface Customer {
  id: string;
  companyId: string;
  kind: CustomerKind;
  name: string;
  domain: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  legalName?: string | null;
  taxId?: string | null;
  tags: string[];
  ownerUserId: string | null;
  ownerAgentId: string | null;
  status: CustomerStatus;
  health: CustomerHealth | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  companyId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  /** Included by the company contact list so rows need no per-person requests. */
  customers?: Array<{ id: string; name: string }>;
  primaryEmail: string | null;
  primaryPhone: string | null;
  title: string | null;
  language: string | null;
  preferredChannel: string | null;
  consents: { email?: boolean; whatsapp?: boolean; sms?: boolean; updatedAt?: string };
  status: ContactStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerContact {
  id: string;
  companyId: string;
  customerId: string;
  contactId: string;
  role: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactIdentity {
  id: string;
  companyId: string;
  contactId: string;
  channel: ContactIdentityChannel;
  identifier: string;
  verified: boolean;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  companyId: string;
  source: LeadSource;
  sourceRef: string | null;
  payload: Record<string, unknown>;
  status: LeadStatus;
  priority: LeadPriority | null;
  language: string | null;
  contactId: string | null;
  customerId: string | null;
  opportunityId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  assignedAgentId: string | null;
  discardReason: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  companyId: string;
  customerId: string;
  primaryContactId: string | null;
  title: string;
  pipelineId: string | null;
  stageId: string | null;
  stageKey: string | null;
  amountCents: number | null;
  currency: string | null;
  probability: number | null;
  expectedCloseAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  ownerUserId: string | null;
  ownerAgentId: string | null;
  source: string | null;
  status: OpportunityStatus;
  lostReason: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  companyId: string;
  subjectKind: CrmSubjectKind;
  subjectId: string;
  kind: CrmActivityKind;
  actorUserId: string | null;
  actorAgentId: string | null;
  summary: string;
  payload: Record<string, unknown> | null;
  externalRef: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Commitment {
  id: string;
  companyId: string;
  who: CommitmentWho;
  what: string;
  dueAt: string | null;
  status: CommitmentStatus;
  source: CommitmentSource;
  customerId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  conversationId: string | null;
  evidence: Record<string, unknown> | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  companyId: string;
  channel: ConversationChannel;
  contactId: string | null;
  customerId: string | null;
  opportunityId: string | null;
  leadId: string | null;
  externalThreadId: string | null;
  subject: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  slaDueAt: string | null;
  assignedUserId: string | null;
  assignedAgentId: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  companyId: string;
  conversationId: string;
  direction: MessageDirection;
  actorKind: MessageActorKind;
  actorUserId: string | null;
  actorAgentId: string | null;
  body: string;
  attachments: Record<string, unknown>[];
  language: string | null;
  deliveryStatus: DeliveryStatus;
  provider: string | null;
  providerMessageId: string | null;
  providerReceipt: Record<string, unknown> | null;
  externalActionId: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Messages are chronological within a page; the cursor loads older messages. */
export interface ConversationMessagePage {
  items: ConversationMessage[];
  nextCursor: string | null;
}

export interface CrmAutonomyPolicy {
  id: string;
  companyId: string;
  agentId: string | null;
  actionType: ExternalActionType;
  level: AutonomyLevel;
  grantedByUserId: string | null;
  reason: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalAction {
  id: string;
  companyId: string;
  actionType: ExternalActionType;
  actorAgentId: string | null;
  actorUserId: string | null;
  subjectKind: CrmSubjectKind | null;
  subjectId: string | null;
  levelApplied: AutonomyLevel;
  mode: ExternalActionMode;
  approvalId: string | null;
  decisionId: string | null;
  payloadHash: string | null;
  idempotencyKey: string | null;
  status: ExternalActionStatus;
  result: Record<string, unknown> | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
