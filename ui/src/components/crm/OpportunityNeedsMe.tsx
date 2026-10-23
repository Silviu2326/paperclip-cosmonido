import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Opportunity } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { crmApi } from "../../api/crm";
import { formatOpportunityAmount } from "./OpportunityBoard";

interface NeedsMeProps {
  companyId: string;
  userId: string;
  /** Loaded opportunities, used to find the ones that have no next action at all. */
  items: Opportunity[];
  onOpen: (opportunity: Opportunity) => void;
}

/**
 * "What needs me": open opportunities I own whose next action is overdue (server query by owner
 * and `nextActionBefore`) or that have no next action (from the loaded page). Real data only;
 * the panel stays hidden when nothing needs attention.
 */
export function OpportunityNeedsMe({ companyId, userId, items, onOpen }: NeedsMeProps) {
  const { t } = useTranslation();
  // Minute-level granularity keeps the query key stable between renders.
  const minute = Math.floor(Date.now() / 60_000);
  const before = useMemo(() => new Date(minute * 60_000).toISOString(), [minute]);

  const overdue = useQuery({
    queryKey: ["opportunities", companyId, "needs-me", userId, before] as const,
    queryFn: () =>
      crmApi.opportunities.list(companyId, { status: "open", ownerId: userId, nextActionBefore: before, limit: 25 }),
    enabled: Boolean(companyId && userId),
  });

  const overdueItems = (overdue.data?.items ?? []).filter((item) => item.nextActionAt !== null);
  const overdueIds = new Set(overdueItems.map((item) => item.id));
  const withoutNextAction = items.filter(
    (item) => item.status === "open" && item.ownerUserId === userId && !item.nextAction && !overdueIds.has(item.id),
  );

  if (overdue.error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
        <span>{t("crm.opportunities.needsMe.loadError", { defaultValue: "Could not load what needs your attention." })}</span>
        <Button size="sm" variant="outline" onClick={() => void overdue.refetch()}>
          {t("crm.opportunities.forecast.retry", { defaultValue: "Try again" })}
        </Button>
      </div>
    );
  }
  if (overdueItems.length === 0 && withoutNextAction.length === 0) return null;

  const title = t("crm.opportunities.needsMe.title", { defaultValue: "Needs you" });
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="flex flex-col gap-1">
        {overdueItems.map((item) => (
          <NeedsMeRow
            key={item.id}
            opportunity={item}
            reason={t("crm.opportunities.needsMe.overdue", { defaultValue: "Next action overdue" })}
            detail={item.nextAction}
            tone="destructive"
            onOpen={onOpen}
          />
        ))}
        {withoutNextAction.map((item) => (
          <NeedsMeRow
            key={item.id}
            opportunity={item}
            reason={t("crm.opportunities.needsMe.noNextAction", { defaultValue: "No next action set" })}
            detail={null}
            tone="muted"
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

function NeedsMeRow({
  opportunity,
  reason,
  detail,
  tone,
  onOpen,
}: {
  opportunity: Opportunity;
  reason: string;
  detail: string | null;
  tone: "destructive" | "muted";
  onOpen: (opportunity: Opportunity) => void;
}) {
  const amount = formatOpportunityAmount(opportunity.amountCents, opportunity.currency);
  return (
    <li>
      <button
        type="button"
        className="flex w-full flex-col items-start gap-0.5 rounded-md p-2 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
        onClick={() => onOpen(opportunity)}
      >
        <span className="text-sm font-medium">
          {opportunity.title}
          {amount && <span className="font-normal text-muted-foreground"> · {amount}</span>}
        </span>
        <span className={tone === "destructive" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {reason}
          {detail && ` · ${detail}`}
        </span>
      </button>
    </li>
  );
}
