import { z } from "zod";

// S3 WP11: honest pipeline forecast. This is an ESTIMATE of weighted open pipeline, never income
// or revenue. It only uses values persisted on each opportunity (`amount_cents`, `currency`,
// `probability`, `expected_close_at`); nothing is defaulted or invented, and currencies are
// never added together.

export const OPPORTUNITY_FORECAST_STAGE_KEYS = ["new", "qualified", "proposal", "negotiation"] as const;
export type OpportunityForecastStageKey = (typeof OPPORTUNITY_FORECAST_STAGE_KEYS)[number];

export const OPPORTUNITY_FORECAST_DEFAULT_PERIOD_DAYS = 90;
export const OPPORTUNITY_FORECAST_MAX_PERIOD_DAYS = 366;
/** Upper bound of open opportunities read for one forecast; beyond it the result says `truncated`. */
export const OPPORTUNITY_FORECAST_MAX_ROWS = 5000;

export const OPPORTUNITY_FORECAST_EXCLUSION_REASONS = [
  "missingStage",
  "missingAmount",
  "missingCurrency",
  "missingProbability",
  "missingExpectedClose",
  "expectedClosePast",
  "outsidePeriod",
  "otherCurrency",
] as const;
export type OpportunityForecastExclusionReason = (typeof OPPORTUNITY_FORECAST_EXCLUSION_REASONS)[number];

export const opportunityForecastQuerySchema = z
  .object({
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use an ISO 4217 code")
      .optional(),
    periodDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(OPPORTUNITY_FORECAST_MAX_PERIOD_DAYS)
      .default(OPPORTUNITY_FORECAST_DEFAULT_PERIOD_DAYS),
    ownerId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type OpportunityForecastQuery = z.infer<typeof opportunityForecastQuerySchema>;

const exclusionCountsSchema = z
  .object({
    missingStage: z.number().int().min(0),
    missingAmount: z.number().int().min(0),
    missingCurrency: z.number().int().min(0),
    missingProbability: z.number().int().min(0),
    missingExpectedClose: z.number().int().min(0),
    expectedClosePast: z.number().int().min(0),
    outsidePeriod: z.number().int().min(0),
    otherCurrency: z.number().int().min(0),
  })
  .strict();

export const opportunityForecastStageSchema = z
  .object({
    stageKey: z.enum(OPPORTUNITY_FORECAST_STAGE_KEYS),
    count: z.number().int().min(0),
    /** Unweighted sum of the included opportunities, in `currency` minor units. */
    amountCents: z.number().int().min(0),
    /** Sum of amount x persisted probability / 100, rounded to minor units. An estimate. */
    weightedCents: z.number().int().min(0),
  })
  .strict();

export const opportunityForecastSchema = z
  .object({
    /** Always true: the numbers are an estimate, never income or revenue. */
    estimate: z.literal(true),
    /** Currency of every amount below; null when no opportunity qualifies. */
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    period: z
      .object({
        days: z.number().int().min(1),
        from: z.string().datetime(),
        to: z.string().datetime(),
        basis: z.literal("expected_close_at"),
      })
      .strict(),
    byStage: z.array(opportunityForecastStageSchema),
    totals: z
      .object({
        count: z.number().int().min(0),
        amountCents: z.number().int().min(0),
        weightedCents: z.number().int().min(0),
      })
      .strict(),
    /** Currencies that have qualifying opportunities; pick one to see its forecast. */
    availableCurrencies: z.array(z.object({ currency: z.string(), count: z.number().int().min(1) }).strict()),
    coverage: z
      .object({
        openOpportunities: z.number().int().min(0),
        included: z.number().int().min(0),
        excluded: z.number().int().min(0),
        excludedBy: exclusionCountsSchema,
        /** More open opportunities than the read bound; the figures cover only the rows read. */
        truncated: z.boolean(),
        source: z.literal("opportunities.probability"),
      })
      .strict(),
    generatedAt: z.string().datetime(),
  })
  .strict();
export type OpportunityForecast = z.infer<typeof opportunityForecastSchema>;
export type OpportunityForecastStage = z.infer<typeof opportunityForecastStageSchema>;

export interface OpportunityForecastInput {
  stageKey: string | null;
  amountCents: number | null;
  currency: string | null;
  probability: number | null;
  expectedCloseAt: Date | string | null;
}

export interface BuildOpportunityForecastOptions {
  now: Date;
  periodDays: number;
  /** Requested currency; when absent the currency with most qualifying opportunities is used. */
  currency?: string | null;
  truncated?: boolean;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Pure forecast over OPEN opportunities. Each excluded opportunity is counted under the first
 * reason that applies, so `excluded` equals the sum of `excludedBy`.
 * An expected close before today is treated as unreliable and excluded, not rolled forward.
 */
export function buildOpportunityForecast(
  rows: readonly OpportunityForecastInput[],
  options: BuildOpportunityForecastOptions,
): OpportunityForecast {
  const fromMs = startOfUtcDay(options.now);
  const toMs = fromMs + options.periodDays * DAY_MS;
  const stageKeys = OPPORTUNITY_FORECAST_STAGE_KEYS as readonly string[];

  const excludedBy = Object.fromEntries(
    OPPORTUNITY_FORECAST_EXCLUSION_REASONS.map((reason) => [reason, 0]),
  ) as Record<OpportunityForecastExclusionReason, number>;

  type Candidate = { stageKey: OpportunityForecastStageKey; amountCents: number; probability: number; currency: string };
  const candidates: Candidate[] = [];

  for (const row of rows) {
    if (!row.stageKey || !stageKeys.includes(row.stageKey)) {
      excludedBy.missingStage += 1;
    } else if (row.amountCents === null || !Number.isInteger(row.amountCents) || row.amountCents < 0) {
      excludedBy.missingAmount += 1;
    } else if (!row.currency || !/^[A-Z]{3}$/.test(row.currency)) {
      excludedBy.missingCurrency += 1;
    } else if (
      row.probability === null ||
      !Number.isInteger(row.probability) ||
      row.probability < 0 ||
      row.probability > 100
    ) {
      excludedBy.missingProbability += 1;
    } else {
      const closeMs = row.expectedCloseAt === null ? Number.NaN : new Date(row.expectedCloseAt).getTime();
      if (row.expectedCloseAt === null || Number.isNaN(closeMs)) {
        excludedBy.missingExpectedClose += 1;
      } else if (closeMs < fromMs) {
        excludedBy.expectedClosePast += 1;
      } else if (closeMs >= toMs) {
        excludedBy.outsidePeriod += 1;
      } else {
        candidates.push({
          stageKey: row.stageKey as OpportunityForecastStageKey,
          amountCents: row.amountCents,
          probability: row.probability,
          currency: row.currency,
        });
      }
    }
  }

  const perCurrency = new Map<string, number>();
  for (const candidate of candidates) perCurrency.set(candidate.currency, (perCurrency.get(candidate.currency) ?? 0) + 1);
  const availableCurrencies = [...perCurrency.entries()]
    .map(([currency, count]) => ({ currency, count }))
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));

  const requested = options.currency ? options.currency.toUpperCase() : null;
  const currency = requested ?? availableCurrencies[0]?.currency ?? null;

  const acc = new Map<OpportunityForecastStageKey, { count: number; amountCents: number; weightedRaw: number }>(
    OPPORTUNITY_FORECAST_STAGE_KEYS.map((key) => [key, { count: 0, amountCents: 0, weightedRaw: 0 }]),
  );
  let included = 0;
  for (const candidate of candidates) {
    if (candidate.currency !== currency) {
      excludedBy.otherCurrency += 1;
      continue;
    }
    const stage = acc.get(candidate.stageKey)!;
    stage.count += 1;
    stage.amountCents += candidate.amountCents;
    stage.weightedRaw += candidate.amountCents * candidate.probability;
    included += 1;
  }

  const byStage: OpportunityForecastStage[] = OPPORTUNITY_FORECAST_STAGE_KEYS.map((stageKey) => {
    const stage = acc.get(stageKey)!;
    return {
      stageKey,
      count: stage.count,
      amountCents: stage.amountCents,
      weightedCents: Math.round(stage.weightedRaw / 100),
    };
  });

  const excluded = OPPORTUNITY_FORECAST_EXCLUSION_REASONS.reduce((sum, reason) => sum + excludedBy[reason], 0);
  return {
    estimate: true,
    currency,
    period: {
      days: options.periodDays,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      basis: "expected_close_at",
    },
    byStage,
    totals: {
      count: included,
      amountCents: byStage.reduce((sum, stage) => sum + stage.amountCents, 0),
      weightedCents: byStage.reduce((sum, stage) => sum + stage.weightedCents, 0),
    },
    availableCurrencies,
    coverage: {
      openOpportunities: rows.length,
      included,
      excluded,
      excludedBy,
      truncated: options.truncated ?? false,
      source: "opportunities.probability",
    },
    generatedAt: options.now.toISOString(),
  };
}
