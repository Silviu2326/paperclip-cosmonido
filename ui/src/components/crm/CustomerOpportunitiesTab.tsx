import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../PageSkeleton";
import { formatOpportunityAmount } from "./OpportunityBoard";
import { CUSTOMER_OPPORTUNITIES_KEY, OpportunityCreateDialog } from "./OpportunityCreateDialog";

/** Opportunities of one customer, with a create action that preselects the customer. */
export function CustomerOpportunitiesTab({ companyId, customerId }: { companyId: string; customerId: string }) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: [CUSTOMER_OPPORTUNITIES_KEY, companyId, customerId],
    queryFn: () => crmApi.opportunities.list(companyId, { customerId, limit: 100 }),
    enabled: Boolean(companyId && customerId),
  });

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t("crm.opportunities.create.title")}
        </Button>
      </div>

      {query.isLoading && <PageSkeleton variant="list" />}
      {query.error && <p className="text-sm text-destructive">{t("crm.opportunities.loadError")}</p>}
      {!query.isLoading && !query.error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("crm.customers.opportunitiesEmpty")}</p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.title")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.stage")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.amount")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.nextAction")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="p-2">{item.title}</td>
                  <td className="p-2">{item.stageKey ? t(`crm.opportunities.stages.${item.stageKey}`) : "-"}</td>
                  <td className="p-2">{formatOpportunityAmount(item.amountCents, item.currency) ?? "-"}</td>
                  <td className="p-2">{item.nextAction ?? t("crm.opportunities.noNextAction")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OpportunityCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        customerId={customerId}
      />
    </div>
  );
}
