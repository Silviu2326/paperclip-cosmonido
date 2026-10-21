// CRM, leads, conversations, calendar and autonomy enums shared by the Sprint 2 tracks.
// Mirror these lists in packages/db/src/schema/*.ts check constraints.

export const CUSTOMER_KINDS = ["person", "organization"] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CUSTOMER_STATUSES = ["active", "archived"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_HEALTHS = ["good", "watch", "risk"] as const;
export type CustomerHealth = (typeof CUSTOMER_HEALTHS)[number];

export const CONTACT_STATUSES = ["active", "archived"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_IDENTITY_CHANNELS = [
  "email",
  "phone",
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
  "webchat",
] as const;
export type ContactIdentityChannel = (typeof CONTACT_IDENTITY_CHANNELS)[number];

export const LEAD_SOURCES = [
  "form",
  "csv",
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
  "webchat",
  "voice",
  "manual",
  "api",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ["new", "triaged", "qualified", "converted", "discarded"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["low", "normal", "high"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const OPPORTUNITY_STATUSES = ["open", "won", "lost"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

// Keys of the default "sales" pipeline stages (see ensureSalesPipeline).
export const SALES_STAGE_KEYS = ["new", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type SalesStageKey = (typeof SALES_STAGE_KEYS)[number];

export const CRM_SUBJECT_KINDS = ["customer", "contact", "lead", "opportunity", "conversation", "commitment"] as const;
export type CrmSubjectKind = (typeof CRM_SUBJECT_KINDS)[number];

export const CRM_ACTIVITY_KINDS = [
  "note",
  "call",
  "email",
  "message",
  "meeting",
  "stage_change",
  "status_change",
  "task",
  "system",
] as const;
export type CrmActivityKind = (typeof CRM_ACTIVITY_KINDS)[number];

export const COMMITMENT_WHO = ["us", "them"] as const;
export type CommitmentWho = (typeof COMMITMENT_WHO)[number];

export const COMMITMENT_STATUSES = ["proposed", "open", "kept", "missed", "cancelled"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const COMMITMENT_SOURCES = ["manual", "detected"] as const;
export type CommitmentSource = (typeof COMMITMENT_SOURCES)[number];

export const CONVERSATION_CHANNELS = [
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
  "webchat",
  "voice",
  "sms",
] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_STATUSES = ["open", "waiting_us", "waiting_them", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_ACTOR_KINDS = ["contact", "user", "agent", "system"] as const;
export type MessageActorKind = (typeof MESSAGE_ACTOR_KINDS)[number];

export const DELIVERY_STATUSES = ["draft", "queued", "sent", "delivered", "read", "failed", "uncertain"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const AUTONOMY_LEVELS = ["draft_only", "send_with_approval", "send_direct"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const EXTERNAL_ACTION_TYPES = [
  "email",
  "message",
  "booking",
  "stage_change",
  "proposal",
  "publish",
  "call",
  "review_link",
] as const;
export type ExternalActionType = (typeof EXTERNAL_ACTION_TYPES)[number];

export const EXTERNAL_ACTION_MODES = ["draft", "approval", "direct"] as const;
export type ExternalActionMode = (typeof EXTERNAL_ACTION_MODES)[number];

export const EXTERNAL_ACTION_STATUSES = ["pending", "approved", "rejected", "executed", "failed", "uncertain"] as const;
export type ExternalActionStatus = (typeof EXTERNAL_ACTION_STATUSES)[number];
