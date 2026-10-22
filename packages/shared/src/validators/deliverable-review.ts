import { z } from "zod";
export const deliverableTargetKindSchema = z.enum(["work_product", "company_file_version", "document_revision"]);
export const deliverableReviewStateSchema = z.enum(["pending", "accepted", "changes_requested"]);
export const createDeliverableReviewSchema = z.object({
  goalId: z.string().uuid().optional().nullable(),
  issueId: z.string().uuid().optional().nullable(),
  targetKind: deliverableTargetKindSchema,
  targetId: z.string().uuid(),
  targetVersion: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(20_000),
  evidence: z.record(z.string(), z.unknown()).optional().nullable(),
});
export const resolveDeliverableReviewSchema = z.object({
  state: z.enum(["accepted", "changes_requested"]),
  reason: z.string().trim().max(20_000).optional(),
}).superRefine((value, ctx) => {
  if (value.state === "changes_requested" && !value.reason?.trim()) ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required when requesting changes" });
});
export type CreateDeliverableReview = z.infer<typeof createDeliverableReviewSchema>;
export type ResolveDeliverableReview = z.infer<typeof resolveDeliverableReviewSchema>;
