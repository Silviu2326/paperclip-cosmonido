import { useEffect, useState, type FormEvent } from "react";
import { UserPlus, Upload } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead, LeadSource, LeadStatus } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { leadsApi, type LeadListFilters } from "../../api/leads";
import { ApiError } from "../../api/client";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { queryKeys } from "../../lib/queryKeys";
import { Link, useNavigate } from "@/lib/router";
import { LeadEditorDialog } from "@/components/crm/LeadEditorDialog";
import { LeadConvertDialog } from "@/components/crm/LeadConvertDialog";
import { SalesOwnerSelect, useSalesOwners } from "@/components/crm/SalesOwnerSelect";
import { salesOwnerValue } from "@/lib/sales";
import { LeadBulkActions, type LeadBulkResult } from "@/components/crm/LeadBulkActions";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { LeadImportDialog } from "../../components/crm/LeadImportDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUSES: LeadStatus[] = ["new", "triaged", "qualified", "converted", "discarded"];
const SOURCES: LeadSource[] = [
  "form", "csv", "email", "whatsapp", "messenger", "instagram", "telegram",
  "webchat", "voice", "manual", "api",
];

export function leadTitle(lead: Lead): string {
  const payload = lead.payload ?? {};
  for (const key of ["name", "company", "email", "phone"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return lead.id.slice(0, 8);
}

export function Leads() {
  const { selectedCompanyId } = useCompany();
  return <LeadList key={selectedCompanyId ?? "none"} />;
}

function LeadList() {
  const { selectedCompanyId } = useCompany();
  const { t, i18n } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const owners = useSalesOwners(selectedCompanyId ?? "");
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<LeadBulkResult | null>(null);
  const [sort, setSort] = useState("newest");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "">("");
  const [assigned, setAssigned] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<Lead | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  useEffect(() => { setSelected(new Set()); setBulkResult(null); }, [search, status, source, priority, assigned]);

  const filters: LeadListFilters = {
    q: search.trim() || undefined,
    status: status || undefined,
    source: source || undefined,
    priority: priority || undefined,
    assigned: assigned || undefined,
  };

  useEffect(() => {
    setBreadcrumbs([{ label: t("crm.leads.title") }]);
  }, [setBreadcrumbs, t]);

  const leadsQuery = useInfiniteQuery({
    queryKey: [...queryKeys.leads.list(selectedCompanyId!), filters],
    queryFn: ({ pageParam }) => leadsApi.list(selectedCompanyId!, { ...filters, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!selectedCompanyId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.leads.list(selectedCompanyId!) });

  const triageMutation = useMutation({
    mutationFn: (lead: Lead) => leadsApi.triage(lead.id, {}),
    onSuccess: refresh,
  });

  const discardMutation = useMutation({
    mutationFn: ({ lead, reason }: { lead: Lead; reason: string }) => leadsApi.discard(lead.id, reason || undefined),
    onSuccess: () => {
      setDiscardTarget(null);
      setDiscardReason("");
      refresh();
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={UserPlus} message={t("crm.leads.selectCompany")} />;
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const leads = leadsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  if (sort === "name") leads.sort((a, b) => leadTitle(a).localeCompare(leadTitle(b), i18n.language));
  const actionError = triageMutation.error;
  const hasFilters = Boolean(filters.q || filters.status || filters.source || filters.priority || filters.assigned);

  const submitDiscard = (event: FormEvent) => {
    event.preventDefault();
    if (discardTarget) discardMutation.mutate({ lead: discardTarget, reason: discardReason.trim() });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-56"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("crm.leads.filters.search")}
            aria-label={t("crm.leads.filters.search")}
          />
          <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as LeadStatus | "")} aria-label={t("crm.leads.filters.status")}>
            <option value="">{t("crm.leads.filters.any")}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>{t(`crm.leads.status.${value}`)}</option>
            ))}
          </NativeSelect>
          <NativeSelect value={source} onChange={(event) => setSource(event.target.value as LeadSource | "")} aria-label={t("crm.leads.filters.source")}>
            <option value="">{t("crm.leads.filters.any")}</option>
            {SOURCES.map((value) => (
              <option key={value} value={value}>{t(`crm.leads.source.${value}`)}</option>
            ))}
          </NativeSelect>
          <NativeSelect value={priority} onChange={(event) => setPriority(event.target.value as "low" | "normal" | "high" | "")} aria-label={t("crm.leads.filters.priority")}>
            <option value="">{t("crm.leads.filters.any")}</option>
            <option value="high">{t("crm.leads.priority.high")}</option>
            <option value="normal">{t("crm.leads.priority.normal")}</option>
            <option value="low">{t("crm.leads.priority.low")}</option>
          </NativeSelect>
          <SalesOwnerSelect all companyId={selectedCompanyId} value={assigned} onChange={setAssigned} />
          <NativeSelect aria-label={t("salesWorkspace.sortLoaded")} value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t("salesWorkspace.newest")}</option><option value="name">{t("salesWorkspace.byName")}</option></NativeSelect>
          {hasFilters && <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setStatus(""); setSource(""); setPriority(""); setAssigned(""); }}>{t("salesWorkspace.clearFilters")}</Button>}
        </div>
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setEditing("new")}>{t("salesWorkspace.newLead")}</Button><Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {t("crm.leads.actions.import")}
        </Button></div>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError.message}</p>}
      {selected.size > 0 && <LeadBulkActions companyId={selectedCompanyId} leads={leads.filter((lead) => selected.has(lead.id))} onComplete={(result) => { setSelected(new Set(result.failedIds)); setBulkResult(result); }} />}
      {bulkResult && <div role="status" className="flex flex-col gap-1 text-sm"><p>{t("salesWorkspace.bulkResult", { succeeded: bulkResult.succeeded, failed: bulkResult.failedIds.length })}</p>{bulkResult.errors.map((error, index) => <p key={index} className="text-destructive">{error}</p>)}</div>}

      {leadsQuery.isLoading && <PageSkeleton variant="list" />}
      {leadsQuery.error && <p className="text-sm text-destructive">{leadsQuery.error.message}</p>}
      {leads.length > 0 && <p className="text-xs text-muted-foreground">{t(leadsQuery.hasNextPage ? "salesWorkspace.partialResults" : "salesWorkspace.resultCount", { count: leads.length })}</p>}

      {leadsQuery.data && leads.length === 0 && (
        <EmptyState icon={UserPlus} message={hasFilters ? t("crm.leads.emptyFiltered") : t("crm.leads.empty")} />
      )}

      {leads.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2"><Checkbox aria-label={t("salesWorkspace.selectLoaded")} checked={leads.every((lead) => selected.has(lead.id)) ? true : selected.size ? "indeterminate" : false} onCheckedChange={(checked) => setSelected(checked === true ? new Set(leads.map((lead) => lead.id)) : new Set())} /></th>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.name")}</th>
                <th className="px-3 py-2 font-medium">{t("salesWorkspace.email")}</th>
                <th className="px-3 py-2 font-medium">{t("salesWorkspace.phone")}</th>
                <th className="px-3 py-2 font-medium">{t("salesWorkspace.owner")}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.source")}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.status")}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.priority")}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.received")}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const open = lead.status !== "converted" && lead.status !== "discarded";
                return (
                  <tr key={lead.id} className="border-t border-border">
                    <td className="px-3 py-2"><Checkbox aria-label={t("salesWorkspace.selectLead", { name: leadTitle(lead) })} checked={selected.has(lead.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(lead.id); else next.delete(lead.id); return next; })} /></td>
                    <td className="px-3 py-2">
                      <Link to={`/sales/leads/${lead.id}`} className="font-medium hover:underline">{leadTitle(lead)}</Link>
                    </td>
                    <td className="px-3 py-2">{typeof lead.payload.email === "string" ? lead.payload.email : "—"}</td>
                    <td className="px-3 py-2">{typeof lead.payload.phone === "string" ? lead.payload.phone : "—"}</td>
                    <td className="px-3 py-2">{owners.name(salesOwnerValue(lead.assignedUserId, lead.assignedAgentId)) ?? t(lead.assignedUserId || lead.assignedAgentId ? "salesWorkspace.savedOwner" : "salesWorkspace.unassigned")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t(`crm.leads.source.${lead.source}`)}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{t(`crm.leads.status.${lead.status}`)}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {lead.priority ? t(`crm.leads.priority.${lead.priority}`) : t("crm.leads.priority.none")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{dateFormat.format(new Date(lead.createdAt))}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(lead)}>{t("salesWorkspace.edit")}</Button>
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/sales/leads/${lead.id}`}>{t("crm.leads.actions.open")}</Link>
                        </Button>
                        {open && lead.status === "new" && (
                          <Button size="sm" variant="ghost" disabled={triageMutation.isPending} onClick={() => triageMutation.mutate(lead)}>
                            {t("crm.leads.actions.triage")}
                          </Button>
                        )}
                        {open && (
                          <Button size="sm" variant="ghost" onClick={() => setConverting(lead)}>
                            {t("salesWorkspace.convertLead")}
                          </Button>
                        )}
                        {open && (
                          <Button size="sm" variant="ghost" onClick={() => setDiscardTarget(lead)}>
                            {t("crm.leads.actions.discard")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {leadsQuery.hasNextPage && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" disabled={leadsQuery.isFetchingNextPage} onClick={() => leadsQuery.fetchNextPage()}>
            {t("crm.leads.actions.loadMore")}
          </Button>
        </div>
      )}

      <LeadImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        companyId={selectedCompanyId}
        onImported={refresh}
      />
      {editing && <LeadEditorDialog companyId={selectedCompanyId} lead={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={(lead) => { if (editing === "new") navigate(`/sales/leads/${lead.id}`); }} />}
      {converting && <LeadConvertDialog lead={converting} onClose={() => setConverting(null)} />}

      <Dialog open={discardTarget !== null} onOpenChange={(open) => { if (!open) setDiscardTarget(null); }}>
        <DialogContent>
          <form onSubmit={submitDiscard} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("crm.leads.discard.title")}</DialogTitle>
              <DialogDescription>{t("crm.leads.discard.description")}</DialogDescription>
            </DialogHeader>
            <Input
              value={discardReason}
              onChange={(event) => setDiscardReason(event.target.value)}
              placeholder={t("crm.leads.discard.reasonPlaceholder")}
              aria-label={t("crm.leads.discard.reasonLabel")}
              maxLength={500}
            />
            {discardMutation.error instanceof ApiError && (
              <p className="text-sm text-destructive">{discardMutation.error.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDiscardTarget(null)}>
                {t("crm.leads.actions.cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={discardMutation.isPending}>
                {t("crm.leads.actions.confirmDiscard")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
