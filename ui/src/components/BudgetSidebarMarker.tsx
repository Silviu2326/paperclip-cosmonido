import { DollarSign } from "lucide-react";
import { useTranslation } from "@/i18n";

export type BudgetSidebarMarkerLevel = "healthy" | "warning" | "critical";

const levelClasses: Record<BudgetSidebarMarkerLevel, string> = {
  healthy: "bg-accent/90 text-accent-foreground",
  warning: "bg-muted/95 text-amber-950",
  critical: "bg-destructive/90 text-destructive-foreground",
};

const defaultTitleKeys: Record<BudgetSidebarMarkerLevel, string> = {
  healthy: "budgetSidebarMarker.healthy",
  warning: "budgetSidebarMarker.warning",
  critical: "budgetSidebarMarker.critical",
};

export function BudgetSidebarMarker({
  title,
  level = "critical",
}: {
  title?: string;
  level?: BudgetSidebarMarkerLevel;
}) {
  const { t } = useTranslation();
  const accessibleTitle = title ?? t(defaultTitleKeys[level]);

  return (
    <span
      title={accessibleTitle}
      aria-label={accessibleTitle}
      className={`ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-(--shadow-extract-3) ${levelClasses[level]}`}
    >
      <DollarSign className="h-3 w-3" />
    </span>
  );
}
