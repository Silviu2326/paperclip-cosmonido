import { useEffect, useState } from "react";
import { Handshake, Plus } from "lucide-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Opportunity, SalesStageKey } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { OpportunityBoard, formatOpportunityAmount, isNextActionOverdue } from "@/components/crm/OpportunityBoard";
import { OpportunityForecastPanel } from "@/components/crm/OpportunityForecastPanel";
import { OpportunityNeedsMe } from "@/components/crm/OpportunityNeedsMe";
import { OpportunityCreateDialog } from "@/components/crm/OpportunityCreateDialog";
import { OpportunityDetailSheet } from "@/components/crm/OpportunityDetailSheet";
import { LeadEditorDialog } from "@/components/crm/LeadEditorDialog";
import { SalesOwnerSelect, useSalesOwners } from "@/components/crm/SalesOwnerSelect";
import { authApi } from "@/api/auth";
import { crmApi } from "@/api/crm";
import { queryKeys } from "@/lib/queryKeys";
import { useLocation, useNavigate } from "@/lib/router";
import { salesOwnerValue } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function Opportunities() {
  const { selectedCompanyId } = useCompany();
  // Company switches remount every local draft, filter and modal.
  return <SalesPipeline key={selectedCompanyId ?? "none"} companyId={selectedCompanyId ?? ""} />;
}

function SalesPipeline({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = new URLSearchParams(location.search).get("opportunityId");
  const [view, setView] = useState<"board" | "list">("board");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [createStage, setCreateStage] = useState<SalesStageKey | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [lost, setLost] = useState<Opportunity | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const owners = useSalesOwners(companyId);
  const listKey = queryKeys.opportunities.list(companyId);
  const ownerId = owner.startsWith("user:") ? owner.slice(5) : owner.startsWith("agent:") ? owner.slice(6) : owner || undefined;
  const filters = { q: search.trim() || undefined, status: status || undefined, ownerId };
  const query = useInfiniteQuery({
    queryKey: [...listKey, "pipeline", filters],
    queryFn: ({ pageParam }) => crmApi.opportunities.list(companyId, { ...filters, cursor: pageParam, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!companyId,
  });
  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession(), enabled: !!companyId });
  const userId = session.data?.user?.id ?? session.data?.session?.userId;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (sort === "name") items.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "followUp") items.sort((a, b) => (a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity) - (b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity));
  useEffect(() => setBreadcrumbs([{ label: t("uxNav.sales") }]), [setBreadcrumbs, t]);
  const open = (id: string | null) => {
    const params = new URLSearchParams(location.search);
    if (id) params.set("opportunityId", id); else params.delete("opportunityId");
    navigate({ pathname: location.pathname, search: params.size ? `?${params}` : "" });
  };
  const move = useMutation({
    mutationFn: ({ item, stage, reason }: { item: Opportunity; stage: SalesStageKey; reason?: string }) => crmApi.opportunities.changeStage(item.id, { stageKey: stage, expectedVersion: item.version, reason }),
    onMutate: () => setNotice(null),
    onSuccess: (response) => { setLost(null); setReason(""); setNotice(response.mode === "direct" ? null : t("crm.opportunities.pendingApproval")); },
    onError: (error) => setNotice(error.message),
    onSettled: async () => { await Promise.all([client.invalidateQueries({ queryKey: listKey }), client.invalidateQueries({ queryKey: ["sales-opportunity", companyId] }), client.invalidateQueries({ queryKey: ["crm", "activities", companyId, "opportunity"] })]); },
  });
  const changeStage = (item: Opportunity, stage: SalesStageKey) => {
    if (item.stageKey === stage) return;
    if (stage === "lost") { setLost(item); setReason(""); setNotice(null); } else move.mutate({ item, stage });
  };
  if (!companyId) return <EmptyState icon={Handshake} message={t("crm.opportunities.selectCompany")} />;
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold">{t("salesWorkspace.pipeline")}</h1>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setLeadOpen(true)}><Plus data-icon="inline-start" />{t("salesWorkspace.newLead")}</Button><Button size="sm" onClick={() => setCreateStage("new")}><Plus data-icon="inline-start" />{t("crm.opportunities.create.title")}</Button></div>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-2" role="group" aria-label={t("salesWorkspace.view")}><Button size="sm" variant={view === "board" ? "default" : "outline"} aria-pressed={view === "board"} onClick={() => setView("board")}>{t("crm.opportunities.board")}</Button><Button size="sm" variant={view === "list" ? "default" : "outline"} aria-pressed={view === "list"} onClick={() => setView("list")}>{t("crm.opportunities.list")}</Button></div>
      <Input className="w-full sm:w-56" placeholder={t("salesWorkspace.searchOpportunities")} aria-label={t("salesWorkspace.searchOpportunities")} value={search} onChange={(event) => setSearch(event.target.value)} />
      <NativeSelect aria-label={t("salesWorkspace.sortLoaded")} value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t("salesWorkspace.newest")}</option><option value="name">{t("salesWorkspace.byName")}</option><option value="followUp">{t("salesWorkspace.byFollowUp")}</option></NativeSelect>
      <div className="flex flex-col gap-1"><Label htmlFor="pipeline-status">{t("salesWorkspace.status")}</Label><NativeSelect id="pipeline-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("salesWorkspace.allStatuses")}</option>{["open", "won", "lost"].map((value) => <option key={value} value={value}>{t(`salesWorkspace.${value}`)}</option>)}</NativeSelect></div>
      <div className="flex flex-col gap-1"><Label htmlFor="pipeline-owner">{t("salesWorkspace.owner")}</Label><SalesOwnerSelect all id="pipeline-owner" companyId={companyId} value={owner} onChange={setOwner} /></div>
      {(search || owner || status !== "open") && <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setOwner(""); setStatus("open"); }}>{t("salesWorkspace.clearFilters")}</Button>}
    </div>
    {notice && <p role="status" className="text-sm text-destructive">{notice}</p>}
    {query.isLoading ? <PageSkeleton variant="list" /> : query.error ? <div role="alert" className="flex flex-col gap-2"><p className="text-sm text-destructive">{query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("salesWorkspace.retry")}</Button></div> : <>
      <p className="text-xs text-muted-foreground">{t(query.hasNextPage ? "salesWorkspace.partialResults" : "salesWorkspace.resultCount", { count: items.length })}</p>
      {view === "board" ? <OpportunityBoard items={items} disabled={move.isPending} onOpen={(item) => open(item.id)} onMove={changeStage} onCreate={setCreateStage} ownerNames={Object.fromEntries(owners.options.map((option) => [option.value, option.label]))} /> : items.length === 0 ? <EmptyState icon={Handshake} message={t("crm.opportunities.empty")} /> : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["title", "stage", "amount", "nextAction", "owner"].map((column) => <th key={column} className="p-2 font-medium">{t(`salesWorkspace.${column}`)}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-border"><td className="p-2"><button className="text-left font-medium hover:underline" onClick={() => open(item.id)}>{item.title}</button></td><td className="p-2">{t(`crm.opportunities.stages.${item.stageKey}`)}</td><td className="p-2">{formatOpportunityAmount(item.amountCents, item.currency) ?? "—"}</td><td className={isNextActionOverdue(item) ? "p-2 text-destructive" : "p-2"}>{item.nextAction ?? t("crm.opportunities.noNextAction")}{item.nextActionAt && <span className="block text-xs">{new Date(item.nextActionAt).toLocaleString()}</span>}</td><td className="p-2">{owners.name(salesOwnerValue(item.ownerUserId, item.ownerAgentId)) ?? t("salesWorkspace.unassigned")}</td></tr>)}</tbody></table></div>}
      {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t("salesWorkspace.loadMore")}</Button>}
    </>}
    {userId && <OpportunityNeedsMe companyId={companyId} userId={userId} items={items} onOpen={(item) => open(item.id)} />}
    <OpportunityForecastPanel companyId={companyId} ownerId={ownerId} />
    <OpportunityCreateDialog open={createStage !== null} initialStage={createStage ?? "new"} onOpenChange={(value) => !value && setCreateStage(null)} companyId={companyId} onCreated={(item) => open(item.id)} />
    {leadOpen && <LeadEditorDialog companyId={companyId} onClose={() => setLeadOpen(false)} onSaved={(lead) => navigate(`/sales/leads/${lead.id}`)} />}
    {selectedId && <OpportunityDetailSheet key={selectedId} companyId={companyId} id={selectedId} onClose={() => open(null)} onMove={changeStage} moving={move.isPending} />}
    <Dialog open={!!lost} onOpenChange={(value) => !value && !move.isPending && setLost(null)}><DialogContent><DialogHeader><DialogTitle>{t("salesWorkspace.closeLost")}</DialogTitle></DialogHeader><form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (lost && reason.trim() && !move.isPending) move.mutate({ item: lost, stage: "lost", reason: reason.trim() }); }}><Label htmlFor="lost-reason">{t("salesWorkspace.lostReason")}</Label><Input id="lost-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />{move.error && <p role="alert" className="text-sm text-destructive">{move.error.message}</p>}<div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={move.isPending} onClick={() => setLost(null)}>{t("salesWorkspace.cancel")}</Button><Button type="submit" disabled={!reason.trim() || move.isPending}>{t("salesWorkspace.closeLost")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
