import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountIdentity } from "@/api/companies-query";
import { useTranslation } from "@/i18n";
import { productNotificationsApi } from "@/api/product-notifications";
import { useCompany } from "@/context/CompanyContext";
import { Link, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DecisionResolver } from "@/components/DecisionResolver";
import { DeliverableReviewPanel } from "@/components/DeliverableReviewPanel";

/** A push click only navigates. The authenticated live inbox selects the one
 * existing resolver that may offer an explicit, governed action. */
export function NotificationAction() {
  const { t } = useTranslation();
  const { sourceType = "", sourceId = "" } = useParams();
  const { selectedCompanyId } = useCompany();
  const identity = useAccountIdentity();
  if (!selectedCompanyId || !identity.settled || !identity.userId) return <p role="status">{t("notificationAction.loading")}</p>;
  return <ActionForPrincipal key={`${identity.userId}:${selectedCompanyId}:${sourceType}:${sourceId}`} companyId={selectedCompanyId} userId={identity.userId} sourceType={sourceType} sourceId={sourceId} />;
}

function ActionForPrincipal({ companyId, userId, sourceType, sourceId }: { companyId: string; userId: string; sourceType: string; sourceId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const valid = ["decision", "deliverable_review"].includes(sourceType) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId);
  const key = ["product-notifications", userId, companyId];
  const snapshot = useQuery({ queryKey: [...key, "focused", sourceType, sourceId], queryFn: () => productNotificationsApi.snapshot(companyId), enabled: valid, staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000, retry: false });
  const item = snapshot.data?.items.find(item => item.sourceType === sourceType && item.sourceId === sourceId);
  const refresh = () => { void client.invalidateQueries({ queryKey: key }); };
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6"><Card><CardHeader><CardTitle>{item?.title ?? t("notificationAction.review")}</CardTitle><CardDescription>{t("notificationAction.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {!valid ? <p role="alert">{t("notificationAction.invalid")}</p> : snapshot.isPending ? <p role="status">{t("notificationAction.checking")}</p> : snapshot.error ? <p role="alert">{t("notificationAction.loadError")}</p> : !item ? <p role="status">{t("notificationAction.unavailable")}</p> : sourceType === "decision" ? <DecisionResolver companyId={companyId} decisionId={sourceId} cacheScope={userId} onResolved={refresh} /> : <DeliverableReviewPanel companyId={companyId} reviewId={sourceId} cacheScope={userId} />}
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" asChild><Link to="/notifications">{t("notificationAction.back")}</Link></Button><Button variant="ghost" disabled={snapshot.isFetching || !valid} onClick={() => { void snapshot.refetch(); }}>{t("notificationAction.refresh")}</Button></div>
  </CardContent></Card></main>;
}
