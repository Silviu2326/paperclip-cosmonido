import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import type { AssignmentCostTotals, GoalCostReport, GoalCostSummary } from "@paperclipai/shared";
import { costsApi } from "../api/costs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CostAmount } from "./CostAmount";
import { providerDisplayName, formatCents } from "../lib/utils";

function BreakdownList({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: Array<{ key: string; label: string; totals: AssignmentCostTotals; to?: string }>;
  emptyLabel: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2 text-sm">
              {row.to ? (
                <Link to={row.to} className="min-w-0 flex-1 truncate no-underline text-inherit hover:underline">{row.label}</Link>
              ) : (
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
              )}
              <span className="shrink-0 font-mono tabular-nums">
                <CostAmount
                  costCents={row.totals.costCents}
                  eventCount={row.totals.eventCount}
                  estimatedEventCount={row.totals.estimatedEventCount}
                  unpricedEventCount={row.totals.unpricedEventCount}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Spend against budget with its breakdown, for `/assignments/:id`. */
export function AssignmentCosts({ goalId }: { goalId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-costs", "goal", goalId],
    queryFn: () => costsApi.goalSummary(goalId),
    enabled: !!goalId,
  });

  if (isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("assignmentCosts.loading", { defaultValue: "Loading cost…" })}</p>;
  if (error || !data) {
    return <p role="alert" className="text-sm text-destructive">{t("assignmentCosts.loadFailed", { defaultValue: "Could not load the cost of this assignment. Reload to try again." })}</p>;
  }
  return <AssignmentCostsView summary={data} />;
}

export function AssignmentCostsView({ summary }: { summary: GoalCostSummary }) {
  const { t } = useTranslation();
  const { total, budgetCents } = summary;
  const percent = budgetCents && budgetCents > 0 ? Math.min(100, Math.round((total.costCents / budgetCents) * 100)) : null;

  return (
    <Card className="block space-y-4 p-4" data-testid="assignment-costs">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
            {t("assignmentCosts.spend", { defaultValue: "Spent" })}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{formatCents(total.costCents)}</div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          {budgetCents == null
            ? t("assignmentCosts.noBudget", { defaultValue: "No budget set" })
            : t("assignmentCosts.ofBudget", {
                amount: formatCents(budgetCents),
                defaultValue: "of {{amount}} budget",
              })}
        </div>
      </div>
      {percent != null ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={summary.overBudget ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      {summary.overBudget ? (
        <p role="status" className="text-sm text-destructive">
          {t("assignmentCosts.overBudget", { defaultValue: "This assignment has spent more than its budget." })}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <BreakdownList
          title={t("assignmentCosts.byAgent", { defaultValue: "By agent" })}
          emptyLabel={t("assignmentCosts.noEvents", { defaultValue: "No cost recorded yet." })}
          rows={summary.byAgent.map((row) => ({
            key: row.agentId ?? "none",
            label: row.agentName ?? t("assignmentCosts.noAgent", { defaultValue: "No agent (unattributed)" }),
            totals: row,
            to: row.agentId ? `/agents/${row.agentId}` : undefined,
          }))}
        />
        <BreakdownList
          title={t("assignmentCosts.byProvider", { defaultValue: "By provider" })}
          emptyLabel={t("assignmentCosts.noEvents", { defaultValue: "No cost recorded yet." })}
          rows={summary.byProvider.map((row) => ({
            key: `${row.provider}:${row.usageKind}`,
            label: row.usageKind === "media"
              ? `${providerDisplayName(row.provider)} · ${t("assignmentCosts.media", { defaultValue: "media" })}`
              : providerDisplayName(row.provider),
            totals: row,
          }))}
        />
        <BreakdownList
          title={t("assignmentCosts.byDeliverable", { defaultValue: "By deliverable" })}
          emptyLabel={t("assignmentCosts.noEvents", { defaultValue: "No cost recorded yet." })}
          rows={summary.byDeliverable.map((row) => ({
            key: row.workProductId ?? "none",
            label: row.title ?? t("assignmentCosts.noDeliverable", { defaultValue: "Not tied to a deliverable" }),
            totals: row,
            to: row.issueId ? `/issues/${row.issueId}` : undefined,
          }))}
        />
      </div>
    </Card>
  );
}

/** Company-wide "By assignment" section for `/costs`. */
export function AssignmentCostsReport({ companyId, from, to }: { companyId: string; from?: string; to?: string }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-costs", "company", companyId, from ?? null, to ?? null],
    queryFn: () => costsApi.byGoal(companyId, from, to),
    enabled: !!companyId,
  });

  if (isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("assignmentCosts.loading", { defaultValue: "Loading cost…" })}</p>;
  if (error || !data) {
    return <p role="alert" className="text-sm text-destructive">{t("assignmentCosts.reportFailed", { defaultValue: "Could not load cost by assignment. Reload to try again." })}</p>;
  }
  return <AssignmentCostsReportView report={data} />;
}

export function AssignmentCostsReportView({ report }: { report: GoalCostReport }) {
  const { t } = useTranslation();
  const assignments = report.rows.filter((row) => row.kind === "assignment");
  const otherGoals = report.rows.filter((row) => row.kind !== "assignment");
  const otherCents = otherGoals.reduce((sum, row) => sum + row.costCents, 0);

  return (
    <Card className="gap-3 py-4" data-testid="costs-by-assignment">
      <CardHeader className="gap-0 px-5">
        <CardTitle className="text-base">{t("assignmentCosts.byAssignment", { defaultValue: "By assignment" })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-5">
        {assignments.length === 0 && report.unattributed.eventCount === 0 && otherGoals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("assignmentCosts.noAssignments", { defaultValue: "No assignments yet." })}</p>
        ) : (
          <ul className="divide-y divide-border">
            {assignments.map((row) => (
              <li key={row.goalId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link to={`/assignments/${row.goalId}`} className="min-w-0 flex-1 truncate no-underline text-inherit hover:underline">{row.title}</Link>
                <span className="shrink-0 font-mono tabular-nums">
                  <CostAmount
                    costCents={row.costCents}
                    eventCount={row.eventCount}
                    estimatedEventCount={row.estimatedEventCount}
                    unpricedEventCount={row.unpricedEventCount}
                  />
                  {row.budgetCents != null ? <span className="text-muted-foreground"> / {formatCents(row.budgetCents)}</span> : null}
                </span>
              </li>
            ))}
            {otherCents > 0 ? (
              <li className="flex items-center justify-between gap-3 py-2 text-sm text-muted-foreground">
                <span>{t("assignmentCosts.otherGoals", { defaultValue: "Other goals" })}</span>
                <span className="font-mono tabular-nums">{formatCents(otherCents)}</span>
              </li>
            ) : null}
            <li className="flex items-center justify-between gap-3 py-2 text-sm text-muted-foreground" data-testid="costs-unattributed">
              <span>{t("assignmentCosts.unattributed", { defaultValue: "Not attributed to any goal" })}</span>
              <span className="font-mono tabular-nums">{formatCents(report.unattributed.costCents)}</span>
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
