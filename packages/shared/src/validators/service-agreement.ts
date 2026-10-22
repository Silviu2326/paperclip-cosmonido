import { z } from "zod";

export const agreementPeriodKindSchema = z.enum(["monthly", "quarterly", "yearly"]);
export const serviceAgreementStatusSchema = z.enum(["active", "notice", "renewed", "ended", "cancelled"]);
export const serviceAgreementDeliverableSchema = z.object({
  title: z.string().trim().min(1).max(300),
  acceptanceCriteria: z.string().trim().min(1).max(20_000),
  expectedDeliverable: z.string().trim().max(20_000).optional().nullable(),
  budgetCents: z.number().int().min(0).optional().nullable(),
});

export const createServiceAgreementSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  proposalId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(300),
  periodKind: agreementPeriodKindSchema.default("monthly"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  deliverablesPerPeriod: z.array(serviceAgreementDeliverableSchema).min(1).max(50),
  autoRenew: z.boolean().default(true),
  noticeDays: z.number().int().min(0).max(365).default(30),
  assigneeAgentId: z.string().uuid().optional().nullable(),
});

export const updateServiceAgreementSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  endsAt: z.coerce.date().optional().nullable(),
  deliverablesPerPeriod: z.array(serviceAgreementDeliverableSchema).min(1).max(50).optional(),
  autoRenew: z.boolean().optional(),
  noticeDays: z.number().int().min(0).max(365).optional(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  status: serviceAgreementStatusSchema.optional(),
});

export const upsellSuggestSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  agreementId: z.string().uuid().optional().nullable(),
  /** The agent supplies the suggestions it derived from conversations; the service only validates and records them. */
  suggestions: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    rationale: z.string().trim().min(1).max(5_000),
    evidence: z.array(z.string().trim().min(1).max(2_000)).max(20).default([]),
    estimatedPriceCents: z.number().int().min(0).optional().nullable(),
    confidence: z.number().min(0).max(1),
  })).min(1).max(10),
});

export type CreateServiceAgreementInput = z.infer<typeof createServiceAgreementSchema>;
export type UpdateServiceAgreementInput = z.infer<typeof updateServiceAgreementSchema>;
export type UpsellSuggestInput = z.infer<typeof upsellSuggestSchema>;
