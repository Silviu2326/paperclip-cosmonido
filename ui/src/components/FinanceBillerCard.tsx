import type { FinanceByBiller } from "@paperclipai/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, providerDisplayName } from "@/lib/utils";
import { useTranslation } from "@/i18n";

interface FinanceBillerCardProps {
  row: FinanceByBiller;
}

export function FinanceBillerCard({ row }: FinanceBillerCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{providerDisplayName(row.biller)}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {t("financeBillerCard.summary", {
                events: t(row.eventCount === 1 ? "financeBillerCard.eventOne" : "financeBillerCard.eventOther", { count: row.eventCount }),
                kinds: t(row.kindCount === 1 ? "financeBillerCard.kindOne" : "financeBillerCard.kindOther", { count: row.kindCount }),
              })}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{formatCents(row.netCents, row.currency)}</div>
            <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("financeBillerCard.net")}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-3">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="border border-border p-3">
            <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("financeBillerCard.debits")}</div>
            <div className="mt-1 font-medium tabular-nums">{formatCents(row.debitCents, row.currency)}</div>
          </div>
          <div className="border border-border p-3">
            <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("financeBillerCard.credits")}</div>
            <div className="mt-1 font-medium tabular-nums">{formatCents(row.creditCents, row.currency)}</div>
          </div>
          <div className="border border-border p-3">
            <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("financeBillerCard.estimated")}</div>
            <div className="mt-1 font-medium tabular-nums">{formatCents(row.estimatedDebitCents, row.currency)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
