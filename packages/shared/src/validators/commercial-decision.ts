import { z } from "zod";

export const commercialDecisionTypeSchema = z.enum([
  "approve_send", "approve_proposal", "price_exception", "discard_lead", "escalate_customer", "raise_autonomy",
]);
export const commercialSubjectKindSchema = z.enum(["lead", "opportunity", "conversation", "proposal", "customer", "autonomy_policy", "message_draft"]);

export const commercialDecisionEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("send_message"), messageId: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("send_proposal"), proposalId: z.string().uuid() }),
  z.object({ kind: z.literal("apply_price_exception"), proposalId: z.string().uuid(), priceCents: z.number().int().min(0) }),
  z.object({ kind: z.literal("discard_lead"), leadId: z.string().uuid(), reason: z.string().trim().max(2_000).optional().nullable() }),
  z.object({ kind: z.literal("escalate_customer"), customerId: z.string().uuid(), note: z.string().trim().max(5_000).optional().nullable() }),
  z.object({ kind: z.literal("raise_autonomy"), agentId: z.string().uuid(), actionType: z.string().min(1).max(40), level: z.string().min(1).max(40), benchRunId: z.string().uuid().optional().nullable() }),
  z.object({ kind: z.literal("advance_playbook"), playbookRunId: z.string().uuid() }),
  z.object({ kind: z.literal("none") }),
]);

export const createCommercialDecisionSchema = z.object({
  type: commercialDecisionTypeSchema,
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
  subject: z.object({ kind: commercialSubjectKindSchema, id: z.string().min(1).max(200) }),
  subjectVersion: z.string().min(1).max(200),
  options: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional().nullable(),
    style: z.enum(["default", "primary", "destructive"]).optional(),
    effect: commercialDecisionEffectSchema,
  })).min(1).max(6),
  continuation: z.object({ playbookRunId: z.string().uuid().optional().nullable(), messageId: z.string().max(200).optional().nullable() }).optional().nullable(),
  shadowAgentId: z.string().uuid().optional().nullable(),
  shadowActionType: z.string().max(40).optional().nullable(),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
  idempotencyKey: z.string().trim().min(1).max(255),
});

export const resolveCommercialDecisionSchema = z.object({
  optionId: z.string().trim().min(1).max(80),
  /** Subject version the resolver saw; mismatch with the current subject is 409. */
  subjectVersion: z.string().min(1).max(200).optional(),
  inputValues: z.record(z.string(), z.string().max(5_000)).optional(),
});

export const resolveRemoteDecisionSchema = z.object({
  optionId: z.string().trim().min(1).max(80),
});

export const createRemoteDecisionLinkSchema = z.object({
  channel: z.enum(["email", "whatsapp", "sms"]).default("email"),
  expiresInHours: z.number().int().min(1).max(24 * 7).default(48),
});

export type CreateCommercialDecisionInput = z.infer<typeof createCommercialDecisionSchema>;
export type ResolveCommercialDecisionInput = z.infer<typeof resolveCommercialDecisionSchema>;
export type ResolveRemoteDecisionInput = z.infer<typeof resolveRemoteDecisionSchema>;
export type CreateRemoteDecisionLinkInput = z.infer<typeof createRemoteDecisionLinkSchema>;
