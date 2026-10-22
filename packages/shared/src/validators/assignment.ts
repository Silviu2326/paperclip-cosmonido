import { z } from "zod";

export const createAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).optional().nullable(),
  acceptanceCriteria: z.string().trim().min(1).max(20_000),
  expectedDeliverable: z.string().trim().max(20_000).optional().nullable(),
  budgetCents: z.number().int().min(0).default(0),
  projectId: z.string().uuid().optional().nullable(),
  assigneeAgentId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(255),
});
export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(20_000).optional().nullable(),
  acceptanceCriteria: z.string().trim().min(1).max(20_000).optional(),
  expectedDeliverable: z.string().trim().max(20_000).optional().nullable(),
  budgetCents: z.number().int().min(0).optional(),
  projectId: z.string().uuid().optional().nullable(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
});
export const assignmentStatusSchema = z.enum(["planned", "in_progress", "awaiting_review", "changes_requested", "accepted", "cancelled"]);
export const assignmentListQuerySchema = z.object({
  status: assignmentStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CreateAssignment = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignment = z.infer<typeof updateAssignmentSchema>;
