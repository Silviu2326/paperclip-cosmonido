import { useEffect, useState } from "react";
import { Handshake } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Opportunity, SalesStageKey } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { OpportunityBoard, formatOpportunityAmount, isNextActionOverdue } from "../../components/crm/OpportunityBoard";
import { OpportunityForecastPanel } from "../../components/crm/OpportunityForecastPanel";
import { OpportunityNeedsMe } from "../../components/crm/OpportunityNeedsMe";
import { authApi } from "../../api/auth";
import { NativeSelect } from "@/components/ui/select";
import { ActivityTimeline } from "../../components/crm/ActivityTimeline";
import { CommitmentsList } from "../../components/crm/CommitmentsList";
import { OpportunityCreateDialog } from "../../components/crm/OpportunityCreateDialog";
import { crmApi, type StageChangeResponse } from "../../api/crm";
import { queryKeys } from "../../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type View = "board" | "list";

// Sprint 2 pista A2 (CRM): opportunities by sales stage (board) or as a table (list).
export function Opportunities() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("board");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.opportunities") }]);
  }, [setBreadcrumbs, t]);

  const companyId = selectedCompanyId ?? "";
  const listKey = queryKeys.opportunities.list(companyId);

  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession() });
  const userId = session.data?.user?.id ?? session.data?.session?.userId ?? null;

  // Owner filter is company-scoped state: it is dropped when the company changes.
  const [ownerId, setOwnerId] = useState("");
  const [knownOwners, setKnownOwners] = useState<string[]>([]);
  useEffect(() => {
    setOwnerId("");
    setKnownOwners([]);
    setSelected(null);
  }, [companyId]);

  // Key keeps the ["opportunities", companyId] prefix so existing invalidations still refresh it.
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [...listKey, "board", ownerId] as const,
    queryFn: () => crmApi.opportunities.list(companyId, { limit: 100, ownerId: ownerId || undefined }),
    enabled: Boolean(companyId),
  });

  const items = data?.items ?? [];
  useEffect(() => {
    const found = items.map((item) => item.ownerUserId ?? item.ownerAgentId).filter((owner): owner is string => Boolean(owner));
    if (found.length === 0) return;
    setKnownOwners((current) => {
      const next = Array.from(new Set([...current, ...found])).sort();
      return next.length === current.length ? current : next;
    });
  }, [items]);

  const move = useMutation({
    mutationFn: ({ opportunity, stageKey }: { opportunity: Opportunity; stageKey: SalesStageKey }) =>
      crmApi.opportunities.changeStage(opportunity.id, { stageKey, expectedVersion: opportunity.version }),
    onMutate: () => setNotice(null),
    onSuccess: (response: StageChangeResponse) => {
      // 202: an agent action waits for approval; the stage changes once it is approved.
      setNotice(response.mode === "direct" ? null : t("crm.opportunities.pendingApproval"));
    },
    onError: (err: Error) => setNotice(err.message || t("crm.opportunities.moveError")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Handshake} message={t("crm.opportunities.selectCompany")} />;
  }
  if (isLoading) return <PageSkeleton variant="list" />;
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
        <span>{t("crm.opportunities.loadError")}</span>
        <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {t("crm.opportunities.forecast.retry", { defaultValue: "Try again" })}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={view === "board" ? "default" : "outline"} onClick={() => setView("board")}>
            {t("crm.opportunities.board")}
          </Button>
          <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>
            {t("crm.opportunities.list")}
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {t("crm.opportunities.owner")}
            <NativeSelect value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">{t("crm.opportunities.ownerAll", { defaultValue: "Everyone" })}</option>
              {userId && <option value={userId}>{t("crm.opportunities.ownerMine", { defaultValue: "Mine" })}</option>}
              {knownOwners
                .filter((owner) => owner !== userId)
                .map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
            </NativeSelect>
          </label>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t("crm.opportunities.create.title")}
        </Button>
      </div>

      {notice && (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      )}

      <OpportunityForecastPanel companyId={companyId} ownerId={ownerId || undefined} />

      {userId && <OpportunityNeedsMe companyId={companyId} userId={userId} items={items} onOpen={setSelected} />}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            icon={Handshake}
            message={ownerId ? t("crm.opportunities.emptyOwner", { defaultValue: "This owner has no opportunities." }) : t("crm.opportunities.empty")}
          />
          {ownerId ? (
            <Button size="sm" variant="outline" onClick={() => setOwnerId("")}>
              {t("crm.opportunities.clearOwner", { defaultValue: "Show everyone" })}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              {t("crm.opportunities.create.title")}
            </Button>
          )}
        </div>
      ) : view === "board" ? (
        <OpportunityBoard
          items={items}
          disabled={move.isPending}
          onOpen={setSelected}
          onMove={(opportunity, stageKey) => move.mutate({ opportunity, stageKey })}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.title")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.stage")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.amount")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.nextAction")}</th>
                <th className="p-2 font-medium">{t("crm.opportunities.columns.owner")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setSelected(item)}>
                  <td className="p-2">{item.title}</td>
                  <td className="p-2">{item.stageKey ? t(`crm.opportunities.stages.${item.stageKey}`) : "-"}</td>
                  <td className="p-2">{formatOpportunityAmount(item.amountCents, item.currency) ?? "-"}</td>
                  <td className={isNextActionOverdue(item) ? "p-2 text-destructive" : "p-2"}>
                    {item.nextAction ?? t("crm.opportunities.noNextAction")}
                    {isNextActionOverdue(item) && ` · ${t("crm.opportunities.overdue", { defaultValue: "Overdue" })}`}
                  </td>
                  <td className="p-2">{item.ownerUserId ?? item.ownerAgentId ?? t("crm.opportunities.noOwner")}</td>
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
      />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
              </SheetHeader>
              <section className="flex flex-col gap-2 p-4">
                <h3 className="text-sm font-medium">{t("crm.activities.title")}</h3>
                <ActivityTimeline companyId={companyId} subjectKind="opportunity" subjectId={selected.id} />
              </section>
              <section className="flex flex-col gap-2 p-4">
                <h3 className="text-sm font-medium">{t("crm.commitments.title")}</h3>
                <CommitmentsList companyId={companyId} opportunityId={selected.id} />
              </section>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
