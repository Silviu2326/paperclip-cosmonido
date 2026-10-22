import { z } from "zod";
import {
  AUTONOMY_LEVELS,
  COMMITMENT_STATUSES,
  COMMITMENT_WHO,
  CONTACT_IDENTITY_CHANNELS,
  CONVERSATION_CHANNELS,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATUSES,
  CRM_ACTIVITY_KINDS,
  CRM_SUBJECT_KINDS,
  CUSTOMER_HEALTHS,
  CUSTOMER_KINDS,
  CUSTOMER_STATUSES,
  CONTACT_STATUSES,
  EXTERNAL_ACTION_TYPES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  SALES_STAGE_KEYS,
} from "../constants/crm.js";
import { objectWithoutDefaults } from "./partial.js";

const idempotencyKeySchema = z.string().trim().min(1).max(240);
const guidSchema = z.string().guid();
const isoDateSchema = z.string().datetime({ offset: true });
const languageSchema = z.string().regex(/^[a-z]{2}$/, "Use an ISO 639-1 code");
const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use an ISO 4217 code");

// ---------------------------------------------------------------- customers

export const createCustomerSchema = z.object({
  kind: z.enum(CUSTOMER_KINDS).optional().default("organization"),
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(253).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional().default([]),
  ownerUserId: z.string().min(1).optional().nullable(),
  ownerAgentId: guidSchema.optional().nullable(),
  health: z.enum(CUSTOMER_HEALTHS).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateCustomer = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = objectWithoutDefaults(
  createCustomerSchema.omit({ idempotencyKey: true }),
)
  .partial()
  .extend({ status: z.enum(CUSTOMER_STATUSES).optional() });

export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;

// ---------------------------------------------------------------- contacts

export const createContactSchema = z.object({
  firstName: z.string().trim().max(120).optional().nullable(),
  lastName: z.string().trim().max(120).optional().nullable(),
  displayName: z.string().trim().min(1).max(200),
  primaryEmail: z.string().trim().email().max(320).optional().nullable(),
  primaryPhone: z.string().trim().max(32).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  language: languageSchema.optional().nullable(),
  preferredChannel: z.enum(CONVERSATION_CHANNELS).optional().nullable(),
  consents: z
    .object({
      email: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
      sms: z.boolean().optional(),
      updatedAt: isoDateSchema.optional(),
    })
    .optional()
    .default({}),
  customerId: guidSchema.optional().nullable(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateContact = z.infer<typeof createContactSchema>;

export const updateContactSchema = objectWithoutDefaults(createContactSchema.omit({ idempotencyKey: true, customerId: true }))
  .partial()
  .extend({ status: z.enum(CONTACT_STATUSES).optional() });

export type UpdateContact = z.infer<typeof updateContactSchema>;

export const contactIdentityInputSchema = z.object({
  channel: z.enum(CONTACT_IDENTITY_CHANNELS),
  identifier: z.string().trim().min(1).max(320),
  verified: z.boolean().optional().default(false),
  source: z.string().max(120).optional().nullable(),
});

export type ContactIdentityInput = z.infer<typeof contactIdentityInputSchema>;

// ---------------------------------------------------------------- leads

export const createLeadSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  sourceRef: z.string().trim().min(1).max(500).optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  priority: z.enum(LEAD_PRIORITIES).optional().nullable(),
  language: languageSchema.optional().nullable(),
  contactId: guidSchema.optional().nullable(),
  customerId: guidSchema.optional().nullable(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateLead = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = objectWithoutDefaults(createLeadSchema.omit({ idempotencyKey: true, source: true }))
  .partial()
  .extend({
    assignedUserId: z.string().min(1).optional().nullable(),
    assignedAgentId: guidSchema.optional().nullable(),
  });

export type UpdateLead = z.infer<typeof updateLeadSchema>;

export const convertLeadSchema = z.object({
  customerId: guidSchema.optional(),
  contactId: guidSchema.optional(),
  createOpportunity: z.boolean().optional().default(false),
  opportunityTitle: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export type ConvertLead = z.infer<typeof convertLeadSchema>;

// ---------------------------------------------------------------- opportunities

const probabilitySchema = z.number().int().min(0).max(100);

export const createOpportunitySchema = z.object({
  customerId: guidSchema,
  primaryContactId: guidSchema.optional().nullable(),
  title: z.string().trim().min(1).max(200),
  stageKey: z.enum(SALES_STAGE_KEYS).optional().default("new"),
  amountCents: z.number().int().min(0).optional().nullable(),
  currency: currencySchema.optional().nullable(),
  probability: probabilitySchema.optional().nullable(),
  expectedCloseAt: isoDateSchema.optional().nullable(),
  nextAction: z.string().trim().max(500).optional().nullable(),
  nextActionAt: isoDateSchema.optional().nullable(),
  ownerUserId: z.string().min(1).optional().nullable(),
  ownerAgentId: guidSchema.optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateOpportunity = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = objectWithoutDefaults(
  createOpportunitySchema.omit({ idempotencyKey: true, stageKey: true }),
)
  .partial()
  .extend({
    expectedVersion: z.number().int().min(1),
    lostReason: z.string().trim().max(500).optional().nullable(),
  });

export type UpdateOpportunity = z.infer<typeof updateOpportunitySchema>;

export const changeOpportunityStageSchema = z.object({
  stageKey: z.enum(SALES_STAGE_KEYS),
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().max(500).optional(),
});

export type ChangeOpportunityStage = z.infer<typeof changeOpportunityStageSchema>;

// ---------------------------------------------------------------- activities

export const createCrmActivitySchema = z.object({
  subjectKind: z.enum(CRM_SUBJECT_KINDS),
  subjectId: guidSchema,
  kind: z.enum(CRM_ACTIVITY_KINDS),
  summary: z.string().trim().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()).optional().nullable(),
  externalRef: z.string().trim().max(500).optional().nullable(),
  occurredAt: isoDateSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateCrmActivity = z.infer<typeof createCrmActivitySchema>;

// ---------------------------------------------------------------- commitments

export const createCommitmentSchema = z.object({
  who: z.enum(COMMITMENT_WHO),
  what: z.string().trim().min(1).max(1000),
  dueAt: isoDateSchema.optional().nullable(),
  customerId: guidSchema.optional().nullable(),
  contactId: guidSchema.optional().nullable(),
  opportunityId: guidSchema.optional().nullable(),
  conversationId: guidSchema.optional().nullable(),
  evidence: z.record(z.string(), z.unknown()).optional().nullable(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateCommitment = z.infer<typeof createCommitmentSchema>;

export const resolveCommitmentSchema = z.object({
  status: z.enum(["kept", "missed", "cancelled"]),
  note: z.string().trim().max(2000).optional(),
});

export type ResolveCommitment = z.infer<typeof resolveCommitmentSchema>;

// ---------------------------------------------------------------- conversations

export const createConversationSchema = z.object({
  channel: z.enum(CONVERSATION_CHANNELS),
  contactId: guidSchema.optional().nullable(),
  customerId: guidSchema.optional().nullable(),
  opportunityId: guidSchema.optional().nullable(),
  leadId: guidSchema.optional().nullable(),
  externalThreadId: z.string().trim().min(1).max(500).optional().nullable(),
  subject: z.string().trim().max(300).optional().nullable(),
  priority: z.enum(CONVERSATION_PRIORITIES).optional().default("normal"),
  language: languageSchema.optional().nullable(),
  assignedUserId: z.string().min(1).optional().nullable(),
  assignedAgentId: guidSchema.optional().nullable(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CreateConversation = z.infer<typeof createConversationSchema>;

export const createConversationMessageSchema = z.object({
  body: z.string().min(1).max(100000),
  attachments: z.array(z.record(z.string(), z.unknown())).max(50).optional().default([]),
  idempotencyKey: idempotencyKeySchema,
});

export type CreateConversationMessage = z.infer<typeof createConversationMessageSchema>;

export const setConversationStateSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES),
  priority: z.enum(CONVERSATION_PRIORITIES).optional(),
});

export type SetConversationState = z.infer<typeof setConversationStateSchema>;

// ---------------------------------------------------------------- autonomy

export const upsertAutonomyPolicySchema = z.object({
  agentId: guidSchema.optional().nullable(),
  actionType: z.enum(EXTERNAL_ACTION_TYPES),
  level: z.enum(AUTONOMY_LEVELS),
  reason: z.string().trim().max(500).optional().nullable(),
});

export type UpsertAutonomyPolicy = z.infer<typeof upsertAutonomyPolicySchema>;

// ---------------------------------------------------------------- list query

export const crmListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().trim().min(1).max(40).optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type CrmListQuery = z.infer<typeof crmListQuerySchema>;
