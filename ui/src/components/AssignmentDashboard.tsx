import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import type { DashboardCostWindow, DashboardNeedsYouItem, DashboardSummary } from "@paperclipai/shared";
import { ClipboardCheck, Coins, Hourglass, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { timeAgo } from "../lib/timeAgo";
import { formatCents } from "../lib/utils";

function SectionCard({
  title,
  icon: Icon,
  testId,
  children,
}: {
  title: string;
  icon: typeof ListChecks;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Card className="block min-w-0 flex flex-col gap-3 p-4" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      </div>
      {children}
    </Card>
  );
}

function SectionError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className="text-sm text-destructive">
      {t("assignmentDashboard.sectionFailed", { defaultValue: "This section could not be loaded: {{message}}", message })}
    </p>
  );
}

function ItemLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block rounded-md py-2 no-underline text-inherit transition-colors hover:bg-accent/50">
      {children}
    </Link>
  );
}

function NeedsYouList({ items, emptyLabel }: { items: DashboardNeedsYouItem[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`}>
          <ItemLink to={item.href}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
            </div>
          </ItemLink>
        </li>
      ))}
    </ul>
  );
}

function CostRow({ label, window }: { label: string; window: DashboardCostWindow }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{formatCents(window.spendCents)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {window.coveragePercent == null
          ? t("assignmentDashboard.noSpend", { defaultValue: "No spend recorded." })
          : t("assignmentDashboard.coverage", {
              percent: window.coveragePercent,
              unattributed: formatCents(window.unattributedCents),
              defaultValue: "{{percent}}% in assignments · {{unattributed}} unattributed",
            })}
        {window.pricingComplete ? null : ` ${t("assignmentDashboard.pricingIncomplete", { defaultValue: "Some usage is still unpriced." })}`}
      </p>
    </div>
  );
}

/**
 * Result-oriented block above the existing dashboard. Each card reads its own
 * section of the summary, so one failing section shows an error in place and
 * leaves the other three usable. Older servers omit the sections entirely.
 */
export function AssignmentDashboard({ data }: { data: DashboardSummary }) {
  const { t } = useTranslation();
  const { activeAssignments, needsYou, costsToday, costsThisWeek } = data;
  if (!activeAssignments && !needsYou && !costsToday && !costsThisWeek) return null;

  const activeItems = activeAssignments && activeAssignments.error === undefined ? activeAssignments.items : null;
  const needsItems = needsYou && needsYou.error === undefined ? needsYou.items : null;
  const hasAnyData = (activeItems?.length ?? 0) > 0 || (needsItems?.length ?? 0) > 0;
  const allLoaded = activeItems !== null && needsItems !== null;

  const todaySpendCents = costsToday && costsToday.error === undefined ? costsToday.spendCents : 0;

  if (allLoaded && !hasAnyData && todaySpendCents === 0) {
    return (
      <Card className="block p-4" data-testid="assignment-dashboard-empty">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("assignmentDashboard.empty", { defaultValue: "Nothing is in progress. Create an assignment to put your agents to work." })}
          </p>
          <Button size="sm" asChild>
            <Link to="/assignments">{t("assignmentDashboard.create", { defaultValue: "Create assignment" })}</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const decisions = needsItems?.filter((item) => item.kind !== "deliverable_review") ?? [];
  const reviews = needsItems?.filter((item) => item.kind === "deliverable_review") ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="assignment-dashboard">
      <SectionCard title={t("assignmentDashboard.doing", { defaultValue: "What is being done" })} icon={ListChecks} testId="assignment-dashboard-active">
        {!activeAssignments ? null : activeAssignments.error !== undefined ? (
          <SectionError message={activeAssignments.error} />
        ) : activeAssignments.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("assignmentDashboard.noActive", { defaultValue: "No active assignments." })}</p>
        ) : (
          <ul className="divide-y divide-border">
            {activeAssignments.items.map((item) => (
              <li key={item.id}>
                <ItemLink to={item.href}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{item.assigneeName ?? t("assignmentDashboard.unassigned", { defaultValue: "Unassigned" })}</span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {formatCents(item.spendCents)}
                      {item.budgetCents != null ? ` / ${formatCents(item.budgetCents)}` : ""}
                    </span>
                  </div>
                  {item.lastEventAt ? (
                    <div className="text-xs text-muted-foreground">{timeAgo(item.lastEventAt)}</div>
                  ) : null}
                </ItemLink>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t("assignmentDashboard.needsDecision", { defaultValue: "Needs your decision" })} icon={Hourglass} testId="assignment-dashboard-decisions">
        {!needsYou ? null : needsYou.error !== undefined ? (
          <SectionError message={needsYou.error} />
        ) : (
          <NeedsYouList items={decisions} emptyLabel={t("assignmentDashboard.noDecisions", { defaultValue: "Nothing waiting for a decision." })} />
        )}
      </SectionCard>

      <SectionCard title={t("assignmentDashboard.toReview", { defaultValue: "Deliverables to review" })} icon={ClipboardCheck} testId="assignment-dashboard-reviews">
        {!needsYou ? null : needsYou.error !== undefined ? (
          <SectionError message={needsYou.error} />
        ) : (
          <NeedsYouList items={reviews} emptyLabel={t("assignmentDashboard.noReviews", { defaultValue: "No deliverables waiting for review." })} />
        )}
      </SectionCard>

      <SectionCard title={t("assignmentDashboard.cost", { defaultValue: "Cost" })} icon={Coins} testId="assignment-dashboard-costs">
        <div className="flex flex-col gap-3">
          {!costsToday ? null : costsToday.error !== undefined ? (
            <SectionError message={costsToday.error} />
          ) : (
            <CostRow label={t("assignmentDashboard.today", { defaultValue: "Today" })} window={costsToday} />
          )}
          {!costsThisWeek ? null : costsThisWeek.error !== undefined ? (
            <SectionError message={costsThisWeek.error} />
          ) : (
            <CostRow label={t("assignmentDashboard.thisWeek", { defaultValue: "This week" })} window={costsThisWeek} />
          )}
          <Link to="/costs" className="text-sm underline underline-offset-2">
            {t("assignmentDashboard.openCosts", { defaultValue: "Open costs" })}
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}
