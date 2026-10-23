import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { opportunities } from "@paperclipai/db";
import {
  OPPORTUNITY_FORECAST_MAX_ROWS,
  buildOpportunityForecast,
  type OpportunityForecast,
  type OpportunityForecastQuery,
} from "@paperclipai/shared/productization/opportunity-forecast";

// S3 WP11. Read-only: weighted open pipeline ESTIMATE from persisted opportunity fields.
// One bounded query, no writes, no activity rows.

export function opportunityForecastService(db: Db) {
  return {
    async forecast(companyId: string, query: OpportunityForecastQuery, now: Date = new Date()): Promise<OpportunityForecast> {
      const conditions: SQL[] = [
        eq(opportunities.companyId, companyId),
        eq(opportunities.status, "open"),
        isNull(opportunities.closedAt),
      ];
      if (query.ownerId) {
        conditions.push(
          or(eq(opportunities.ownerUserId, query.ownerId), sql`${opportunities.ownerAgentId}::text = ${query.ownerId}`)!,
        );
      }
      // Read one extra row to know whether the bound cut the data.
      const rows = await db
        .select({
          stageKey: opportunities.stageKey,
          amountCents: opportunities.amountCents,
          currency: opportunities.currency,
          probability: opportunities.probability,
          expectedCloseAt: opportunities.expectedCloseAt,
        })
        .from(opportunities)
        .where(and(...conditions))
        .orderBy(opportunities.id)
        .limit(OPPORTUNITY_FORECAST_MAX_ROWS + 1);
      const truncated = rows.length > OPPORTUNITY_FORECAST_MAX_ROWS;
      return buildOpportunityForecast(rows.slice(0, OPPORTUNITY_FORECAST_MAX_ROWS), {
        now,
        periodDays: query.periodDays,
        currency: query.currency ?? null,
        truncated,
      });
    },
  };
}
