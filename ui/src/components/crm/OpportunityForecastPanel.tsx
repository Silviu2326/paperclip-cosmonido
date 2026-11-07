import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  OPPORTUNITY_FORECAST_EXCLUSION_REASONS,
  type OpportunityForecastExclusionReason,
} from "@paperclipai/shared/productization/opportunity-forecast";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { crmApi } from "../../api/crm";
import { formatOpportunityAmount } from "./OpportunityBoard";

const PERIOD_OPTIONS = [30, 60, 90, 180, 365] as const;

const EXCLUSION_DEFAULTS: Record<OpportunityForecastExclusionReason, string> = {
  missingStage: "without a sales stage",
  missingAmount: "without an amount",
  missingCurrency: "without a currency",
  missingProbability: "without a probability",
  missingExpectedClose: "without an expected close date",
  expectedClosePast: "with an expected close date in the past",
  outsidePeriod: "closing outside the period",
  otherCurrency: "in another currency",
};

/**
 * Weighted open-pipeline ESTIMATE per stage. Only persisted amount, currency, probability and
 * expected close date are used; what is left out is counted and shown, never guessed.
 * It is not income or revenue and currencies are never added together.
 */
export function OpportunityForecastPanel({ companyId, ownerId }: { companyId: string; ownerId?: string }) {
  const { t } = useTranslation();
  const [periodDays, setPeriodDays] = useState<number>(90);
  const [currency, setCurrency] = useState<string>("");

  const query = { periodDays, currency: currency || undefined, ownerId };
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    // Prefix ["opportunities", companyId] so stage moves and creates refresh the forecast too.
    queryKey: ["opportunities", companyId, "forecast", query] as const,
    queryFn: ({ signal }) => crmApi.opportunities.forecast(companyId, query, signal),
    enabled: Boolean(companyId),
  });

  const title = t("crm.opportunities.forecast.title", { defaultValue: "Pipeline forecast" });
  const estimate = t("crm.opportunities.forecast.estimate", { defaultValue: "Estimate" });

  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          <Badge variant="outline">{estimate}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {t("crm.opportunities.forecast.period", { defaultValue: "Closing in the next" })}
            <NativeSelect value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
              {PERIOD_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} {t("crm.opportunities.forecast.days", { defaultValue: "days" })}
                </option>
              ))}
            </NativeSelect>
          </label>
          {data && data.availableCurrencies.length > 1 && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              {t("crm.opportunities.forecast.currency", { defaultValue: "Currency" })}
              <NativeSelect value={currency || (data.currency ?? "")} onChange={(event) => setCurrency(event.target.value)}>
                {data.availableCurrencies.map((entry) => (
                  <option key={entry.currency} value={entry.currency}>
                    {entry.currency} ({entry.count})
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("crm.opportunities.forecast.loading", { defaultValue: "Calculating the estimate..." })}</p>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
          <span>{t("crm.opportunities.forecast.loadError", { defaultValue: "Could not calculate the forecast." })}</span>
          <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            {t("crm.opportunities.forecast.retry", { defaultValue: "Try again" })}
          </Button>
        </div>
      ) : data ? (
        <>
          {data.currency === null || data.coverage.included === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm.opportunities.forecast.empty", {
                defaultValue:
                  "No open opportunity has amount, currency, probability and an upcoming expected close date yet. Fill those in on the opportunities to get an estimate.",
              })}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {data.byStage.map((stage) => (
                  <div key={stage.stageKey} className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 p-2">
                    <span className="text-xs text-muted-foreground">
                      {t(`crm.opportunities.stages.${stage.stageKey}`)} · {stage.count}
                    </span>
                    <span className="text-sm font-medium">
                      {formatOpportunityAmount(stage.weightedCents, data.currency)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("crm.opportunities.forecast.unweighted", { defaultValue: "Before weighting" })}:{" "}
                      {formatOpportunityAmount(stage.amountCents, data.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">
                  {t("crm.opportunities.forecast.total", { defaultValue: "Estimated weighted pipeline" })}:{" "}
                </span>
                <span className="font-medium">{formatOpportunityAmount(data.totals.weightedCents, data.currency)}</span>
              </p>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {t("crm.opportunities.forecast.disclaimer", {
              defaultValue:
                "Open opportunities weighted by their saved probability. This is an estimate, not income or revenue, and each currency is shown on its own.",
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("crm.opportunities.forecast.coverage", { defaultValue: "Included" })}: {data.coverage.included} /{" "}
            {data.coverage.openOpportunities}
            {data.coverage.truncated &&
              ` · ${t("crm.opportunities.forecast.truncated", { defaultValue: "partial: more open opportunities than could be read" })}`}
          </p>
          {data.coverage.excluded > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {OPPORTUNITY_FORECAST_EXCLUSION_REASONS.filter((reason) => data.coverage.excludedBy[reason] > 0).map((reason) => (
                <li key={reason}>
                  {data.coverage.excludedBy[reason]}{" "}
                  {t(`crm.opportunities.forecast.excluded.${reason}`, { defaultValue: EXCLUSION_DEFAULTS[reason] })}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
