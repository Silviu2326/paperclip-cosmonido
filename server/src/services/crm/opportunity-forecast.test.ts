import { describe, expect, it } from "vitest";
import {
  buildOpportunityForecast,
  opportunityForecastQuerySchema,
  opportunityForecastSchema,
  type OpportunityForecastInput,
} from "@paperclipai/shared/productization/opportunity-forecast";

// Written for S3 WP11; not executed in the authoring session.

const now = new Date("2026-10-22T10:00:00.000Z");

function row(overrides: Partial<OpportunityForecastInput> = {}): OpportunityForecastInput {
  return {
    stageKey: "proposal",
    amountCents: 100_000,
    currency: "EUR",
    probability: 50,
    expectedCloseAt: "2026-11-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildOpportunityForecast", () => {
  it("weights by the persisted probability and keeps every stage present", () => {
    const result = buildOpportunityForecast([row(), row({ stageKey: "new", probability: 10 })], { now, periodDays: 90 });
    expect(opportunityForecastSchema.safeParse(result).success).toBe(true);
    expect(result.estimate).toBe(true);
    expect(result.currency).toBe("EUR");
    expect(result.byStage.map((stage) => stage.stageKey)).toEqual(["new", "qualified", "proposal", "negotiation"]);
    expect(result.byStage.find((stage) => stage.stageKey === "proposal")?.weightedCents).toBe(50_000);
    expect(result.byStage.find((stage) => stage.stageKey === "new")?.weightedCents).toBe(10_000);
    expect(result.totals.weightedCents).toBe(60_000);
  });

  it("never invents values: missing fields are excluded and counted", () => {
    const result = buildOpportunityForecast(
      [
        row({ probability: null }),
        row({ amountCents: null }),
        row({ currency: null }),
        row({ expectedCloseAt: null }),
        row({ stageKey: null }),
      ],
      { now, periodDays: 90 },
    );
    expect(result.coverage.included).toBe(0);
    expect(result.currency).toBeNull();
    expect(result.coverage.excludedBy).toMatchObject({
      missingProbability: 1,
      missingAmount: 1,
      missingCurrency: 1,
      missingExpectedClose: 1,
      missingStage: 1,
    });
    expect(result.coverage.excluded).toBe(5);
  });

  it("excludes past close dates and dates outside the period", () => {
    const result = buildOpportunityForecast(
      [
        row({ expectedCloseAt: "2026-10-01T00:00:00.000Z" }),
        row({ expectedCloseAt: "2027-06-01T00:00:00.000Z" }),
        row({ expectedCloseAt: "2026-10-22T00:00:00.000Z" }),
      ],
      { now, periodDays: 30 },
    );
    expect(result.coverage.excludedBy.expectedClosePast).toBe(1);
    expect(result.coverage.excludedBy.outsidePeriod).toBe(1);
    expect(result.coverage.included).toBe(1);
  });

  it("never sums currencies", () => {
    const result = buildOpportunityForecast(
      [row(), row(), row({ currency: "USD", amountCents: 900_000 })],
      { now, periodDays: 90 },
    );
    expect(result.currency).toBe("EUR");
    expect(result.totals.amountCents).toBe(200_000);
    expect(result.coverage.excludedBy.otherCurrency).toBe(1);
    expect(result.availableCurrencies).toEqual([
      { currency: "EUR", count: 2 },
      { currency: "USD", count: 1 },
    ]);

    const usd = buildOpportunityForecast([row(), row({ currency: "USD", amountCents: 900_000 })], {
      now,
      periodDays: 90,
      currency: "USD",
    });
    expect(usd.currency).toBe("USD");
    expect(usd.totals.weightedCents).toBe(450_000);
  });

  it("flags truncated reads", () => {
    expect(buildOpportunityForecast([row()], { now, periodDays: 90, truncated: true }).coverage.truncated).toBe(true);
  });
});

describe("opportunityForecastQuerySchema", () => {
  it("applies defaults and bounds the period", () => {
    expect(opportunityForecastQuerySchema.parse({}).periodDays).toBe(90);
    expect(opportunityForecastQuerySchema.parse({ currency: "eur" }).currency).toBe("EUR");
    expect(opportunityForecastQuerySchema.safeParse({ periodDays: 5000 }).success).toBe(false);
    expect(opportunityForecastQuerySchema.safeParse({ unknown: 1 }).success).toBe(false);
  });
});
