import { z } from "zod";

export const handoffFromProposalSchema = z.object({
  proposalId: z.string().uuid(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  teamCatalogKey: z.string().trim().max(200).optional().nullable(),
  /** Conversation and commitment summary for the account manager; Sprint 2 supplies it when available. */
  summaryMarkdown: z.string().trim().max(50_000).optional().nullable(),
});

export const handoffFromOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  acceptanceCriteria: z.string().trim().min(1).max(20_000),
  budgetCents: z.number().int().min(0).default(0),
  customerId: z.string().uuid().optional().nullable(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  teamCatalogKey: z.string().trim().max(200).optional().nullable(),
  summaryMarkdown: z.string().trim().max(50_000).optional().nullable(),
});

export type HandoffFromProposalInput = z.infer<typeof handoffFromProposalSchema>;
export type HandoffFromOpportunityInput = z.infer<typeof handoffFromOpportunitySchema>;
