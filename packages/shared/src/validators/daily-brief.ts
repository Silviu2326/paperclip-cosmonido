import { z } from "zod";

export const updateDailyBriefPreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  channel: z.enum(["email", "whatsapp", "none"]).optional(),
  hourLocal: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  deliveryAgentId: z.string().uuid().nullable().optional(),
});

export type UpdateDailyBriefPreferenceInput = z.infer<typeof updateDailyBriefPreferenceSchema>;
