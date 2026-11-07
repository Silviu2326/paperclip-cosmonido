import { z } from "zod";
import { autonomyLevelSchema } from "./playbook.js";

export const autonomyActionTypeSchema = z.enum(["email", "message", "booking", "stage_change", "proposal", "publish", "call"]);

export const grantAutonomySchema = z.object({
  agentId: z.string().uuid().optional().nullable(),
  actionType: autonomyActionTypeSchema,
  level: autonomyLevelSchema,
  reason: z.string().trim().max(2_000).optional().nullable(),
  /** Required when raising to a level above `draft_only`; the bench must have passed. */
  benchRunId: z.string().uuid().optional().nullable(),
});

export const revokeAutonomySchema = z.object({
  agentId: z.string().uuid().optional().nullable(),
  actionType: autonomyActionTypeSchema,
  reason: z.string().trim().min(1).max(2_000),
});

export const recordShadowOutcomeSchema = z.object({
  agentId: z.string().uuid(),
  actionType: autonomyActionTypeSchema,
  outcome: z.enum(["sent_unchanged", "edited", "rejected"]),
  occurredAt: z.coerce.date().optional(),
});

export const autonomyEffectiveQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  actionType: autonomyActionTypeSchema,
});

export const runAutonomyBenchSchema = z.object({
  agentId: z.string().uuid(),
  actionType: autonomyActionTypeSchema,
  sampleSize: z.number().int().min(1).max(100).default(20),
  /** Score 0..1 that enables the Raise button; defaults to the company threshold. */
  threshold: z.number().min(0).max(1).optional(),
});

export type GrantAutonomyInput = z.infer<typeof grantAutonomySchema>;
export type RevokeAutonomyInput = z.infer<typeof revokeAutonomySchema>;
export type RecordShadowOutcomeInput = z.infer<typeof recordShadowOutcomeSchema>;
export type RunAutonomyBenchInput = z.infer<typeof runAutonomyBenchSchema>;
