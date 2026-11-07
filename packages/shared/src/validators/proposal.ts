import { z } from "zod";

export const proposalStatusSchema = z.enum(["draft", "sent", "viewed", "accepted", "rejected", "expired"]);
export const proposalScopeItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5_000).optional().nullable(),
  quantity: z.number().min(0).optional().nullable(),
  unitPriceCents: z.number().int().min(0).optional().nullable(),
});
const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/).default("EUR");

export const createProposalSchema = z.object({
  opportunityId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(300),
  scope: z.array(proposalScopeItemSchema).min(1).max(100),
  terms: z.string().trim().max(20_000).optional().nullable(),
  priceCents: z.number().int().min(0),
  depositCents: z.number().int().min(0).optional().nullable(),
  currency: currencySchema,
  validUntil: z.coerce.date().optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(255),
});

/** Editing a `sent` revision is not allowed in place; the service creates revision + 1 from this payload. */
export const reviseProposalSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  scope: z.array(proposalScopeItemSchema).min(1).max(100).optional(),
  terms: z.string().trim().max(20_000).optional().nullable(),
  priceCents: z.number().int().min(0).optional(),
  depositCents: z.number().int().min(0).optional().nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  validUntil: z.coerce.date().optional().nullable(),
});

export const sendProposalSchema = z.object({
  /** `link` returns the public URL for the agent to deliver; `message` uses message_send when Sprint 2 provides it. */
  via: z.enum(["link", "message"]).default("link"),
  recipient: z.string().trim().max(300).optional().nullable(),
});

export const acceptProposalPublicSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  /** Revision shown to the signer; must equal the sent revision or the service answers 409. */
  revision: z.number().int().min(1),
});

export const rejectProposalPublicSchema = z.object({
  reason: z.string().trim().max(2_000).optional().nullable(),
  revision: z.number().int().min(1),
});

export const proposalListQuerySchema = z.object({
  status: proposalStatusSchema.optional(),
  opportunityId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  q: z.string().trim().max(300).optional(),
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type ReviseProposalInput = z.infer<typeof reviseProposalSchema>;
export type AcceptProposalPublicInput = z.infer<typeof acceptProposalPublicSchema>;
