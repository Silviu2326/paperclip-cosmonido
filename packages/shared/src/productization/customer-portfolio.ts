import { z } from "zod";

export const customerPortfolioQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30), cursor: z.string().uuid().optional() }).strict();
export const customerPortfolioSchema = z.object({
  companyId: z.string().uuid(), generatedAt: z.string().datetime(), days: z.number().int(),
  current: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
  previous: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
  items: z.array(z.object({ customerId: z.string().uuid(), name: z.string(), activeAssignments: z.number().int().nonnegative(), pendingReviews: z.number().int().nonnegative(), overdueCommitments: z.number().int().nonnegative(), currentCostCents: z.number().nonnegative().nullable(), previousCostCents: z.number().nonnegative().nullable(), unpricedEvents: z.number().int().nonnegative(), state: z.enum(["needs_attention", "work_active", "no_open_work"]) })),
  nextCursor: z.string().uuid().nullable(), coverage: z.string(),
});
export type CustomerPortfolio = z.infer<typeof customerPortfolioSchema>;
