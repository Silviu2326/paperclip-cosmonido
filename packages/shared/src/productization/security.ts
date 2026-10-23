import { z } from "zod";

export const companyRetentionPolicySchema = z.object({
  companyId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  conversations: z.object({ enabled: z.boolean(), days: z.number().int().min(30).max(3650) }),
  files: z.object({ enabled: z.boolean(), days: z.number().int().min(7).max(3650) }),
  updatedAt: z.string().datetime().nullable(),
  updatedByUserId: z.string().nullable(),
  enforcement: z.enum(["active", "not_configured", "blocked"]),
  blocker: z.string().nullable(),
});

export const companyRetentionPolicyInputSchema = z.object({
  revision: z.number().int().nonnegative(),
  conversations: z.object({ enabled: z.boolean(), days: z.number().int().min(30).max(3650) }),
  files: z.object({ enabled: z.boolean(), days: z.number().int().min(7).max(3650) }),
  previewId: z.string().uuid(),
}).strict();

export const retentionPreviewInputSchema = z.object({
  conversations: z.object({ enabled: z.boolean(), days: z.number().int().min(30).max(3650) }),
  files: z.object({ enabled: z.boolean(), days: z.number().int().min(7).max(3650) }),
}).strict();

export const accountDeletionRequestSchema = z.object({ accountId: z.string().uuid(), confirmation: z.literal("DELETE COMMERCIAL ACCOUNT") }).strict();
export const accountDeletionCancelSchema = z.object({ deletionId: z.string().uuid() }).strict();

export type CompanyRetentionPolicy = z.infer<typeof companyRetentionPolicySchema>;
export type CompanyRetentionInput = z.infer<typeof companyRetentionPolicyInputSchema>;
export type RetentionPreviewInput = z.infer<typeof retentionPreviewInputSchema>;
