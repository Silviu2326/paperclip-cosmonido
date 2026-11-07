import { z } from "zod";

/** A public plan selection; it contains no price or provider-controlled fields. */
export const productSignupPlanIntentSchema = z.object({ planId: z.string().trim().min(1).max(120) }).strict();
export type ProductSignupPlanIntent = z.infer<typeof productSignupPlanIntentSchema>;

/** A trial can be activated only on the account already prepared for its owner. */
export const productTrialStartSchema = z.object({ accountId: z.string().uuid() }).strict();

/** Server-side policy bound: trial duration is configured by the operator, never supplied by the browser. */
export const productTrialDaysSchema = z.number().int().min(1).max(365);

export const productTrialStartResultSchema = z.object({
  accountId: z.string().uuid(),
  planId: z.string().min(1),
  access: z.enum(["trial_eligible", "active", "inactive"]),
  trialStartedAt: z.string().datetime({ offset: true }).nullable(),
  trialExpiresAt: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(["started", "already_started"]),
}).strict();
export type ProductTrialStartResult = z.infer<typeof productTrialStartResultSchema>;
