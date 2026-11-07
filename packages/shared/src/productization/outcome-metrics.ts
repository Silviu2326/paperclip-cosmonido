import { z } from "zod";

export const outcomeMetricsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).strict();
export const outcomeMetricSchema = z.object({
  key: z.string(), unit: z.enum(["count", "milliseconds", "usd_cents"]),
  current: z.number().finite().nullable(), previous: z.number().finite().nullable(),
  source: z.string(), coverage: z.string(),
}).strict();
export const outcomeMetricsSchema = z.object({
  companyId: z.string().uuid(), generatedAt: z.string().datetime(),
  current: z.object({ from: z.string().datetime(), to: z.string().datetime() }).strict(),
  previous: z.object({ from: z.string().datetime(), to: z.string().datetime() }).strict(),
  metrics: z.array(outcomeMetricSchema),
}).strict();
export type OutcomeMetrics = z.infer<typeof outcomeMetricsSchema>;
