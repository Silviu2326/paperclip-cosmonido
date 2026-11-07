import { z } from "zod";

export const autonomyLevelSchema = z.enum(["draft_only", "send_with_approval", "send_direct"]);
export const playbookStepKindSchema = z.enum(["qualify", "respond", "follow_up", "propose", "book", "close", "handoff", "wait"]);
export const playbookChannelSchema = z.enum(["email", "whatsapp", "sms", "chat", "call", "internal"]);
export const playbookScopeKindSchema = z.enum(["lead_type", "offering", "customer_segment"]);
export const playbookStatusSchema = z.enum(["draft", "active", "archived"]);
export const playbookSubjectKindSchema = z.enum(["lead", "opportunity", "conversation", "customer"]);
export const playbookRunStatusSchema = z.enum(["running", "waiting", "paused", "done", "failed", "cancelled"]);

export const playbookStepSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  kind: playbookStepKindSchema,
  title: z.string().trim().max(200).optional().nullable(),
  channel: playbookChannelSchema.optional().nullable(),
  delayHours: z.number().min(0).max(24 * 365).optional().nullable(),
  condition: z.string().trim().max(2_000).optional().nullable(),
  templateKey: z.string().trim().max(120).optional().nullable(),
  autonomy: autonomyLevelSchema,
  maxAttempts: z.number().int().min(1).max(50).optional().nullable(),
  instructions: z.string().trim().max(10_000).optional().nullable(),
});

export const playbookStepsSchema = z.array(playbookStepSchema).min(1).max(50).superRefine((steps, ctx) => {
  const seen = new Set<string>();
  steps.forEach((step, index) => {
    if (seen.has(step.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: `Duplicate step key "${step.key}"` });
    seen.add(step.key);
  });
});

export const createPlaybookSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional().nullable(),
  scopeKind: playbookScopeKindSchema.default("lead_type"),
  scopeValue: z.string().trim().max(200).optional().nullable(),
  steps: playbookStepsSchema,
});

export const updatePlaybookSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5_000).optional().nullable(),
  scopeKind: playbookScopeKindSchema.optional(),
  scopeValue: z.string().trim().max(200).optional().nullable(),
  steps: playbookStepsSchema.optional(),
});

export const startPlaybookRunSchema = z.object({
  playbookId: z.string().uuid(),
  subjectKind: playbookSubjectKindSchema,
  subjectId: z.string().trim().min(1).max(200),
  agentId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(255),
});

export const advancePlaybookRunSchema = z.object({
  /** The step the caller believes is current; mismatch yields 409 so an agent cannot skip steps. */
  expectedStepIndex: z.number().int().min(0).optional(),
  outcome: z.enum(["done", "skipped", "failed"]).default("done"),
  note: z.string().trim().max(5_000).optional().nullable(),
});

export const playbookListQuerySchema = z.object({
  status: playbookStatusSchema.optional(),
  key: z.string().trim().max(80).optional(),
});

export const playbookRunListQuerySchema = z.object({
  status: playbookRunStatusSchema.optional(),
  subjectKind: playbookSubjectKindSchema.optional(),
  subjectId: z.string().trim().max(200).optional(),
  playbookId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreatePlaybookInput = z.infer<typeof createPlaybookSchema>;
export type UpdatePlaybookInput = z.infer<typeof updatePlaybookSchema>;
export type StartPlaybookRunInput = z.infer<typeof startPlaybookRunSchema>;
export type AdvancePlaybookRunInput = z.infer<typeof advancePlaybookRunSchema>;
