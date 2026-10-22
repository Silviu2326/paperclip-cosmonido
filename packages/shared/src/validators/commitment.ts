import { z } from "zod";

export const commitmentsExtractSchema = z.object({
  conversationId: z.string().uuid(),
  /** Candidates proposed by the agent from the messages it read. */
  candidates: z.array(z.object({
    who: z.enum(["us", "them"]),
    what: z.string().trim().min(1).max(2_000),
    dueAt: z.coerce.date().optional().nullable(),
    confidence: z.number().min(0).max(1),
    evidence: z.string().trim().max(2_000).optional().nullable(),
  })).min(1).max(50),
});

export const commercialTriggerEventSchema = z.object({
  kind: z.enum(["no_reply", "meeting_held", "stage_changed", "lead_unattended", "commitment_due_soon"]),
  subjectKind: z.enum(["lead", "opportunity", "conversation", "commitment", "customer"]),
  subjectId: z.string().trim().min(1).max(200),
  occurredAt: z.coerce.date().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type CommitmentsExtractInput = z.infer<typeof commitmentsExtractSchema>;
export type CommercialTriggerEventInput = z.infer<typeof commercialTriggerEventSchema>;
