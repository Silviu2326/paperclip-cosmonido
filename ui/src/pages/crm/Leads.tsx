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
import { Link } from "@/lib/router";
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
  const { t, i18n } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "">("");
  const [assigned, setAssigned] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<Lead | null>(null);
  const [discardReason, setDiscardReason] = useState("");

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

  const convertMutation = useMutation({
    // A fresh key per click; the button stays disabled while the request is pending.
    mutationFn: (lead: Lead) => leadsApi.convert(lead.id, { createOpportunity: false, idempotencyKey: crypto.randomUUID() }),
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
  const actionError = [triageMutation.error, convertMutation.error].find(Boolean) as Error | undefined;
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
          <NativeSelect value={assigned} onChange={(event) => setAssigned(event.target.value)} aria-label={t("crm.leads.filters.assigned")}>
            <option value="">{t("crm.leads.filters.any")}</option>
            <option value="unassigned">{t("crm.leads.filters.unassigned")}</option>
          </NativeSelect>
        </div>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {t("crm.leads.actions.import")}
        </Button>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError.message}</p>}

      {leadsQuery.isLoading && <PageSkeleton variant="list" />}
      {leadsQuery.error && <p className="text-sm text-destructive">{leadsQuery.error.message}</p>}

      {leadsQuery.data && leads.length === 0 && (
        <EmptyState icon={UserPlus} message={hasFilters ? t("crm.leads.emptyFiltered") : t("crm.leads.empty")} />
      )}

      {leads.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("crm.leads.columns.name")}</th>
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
                    <td className="px-3 py-2">
                      <Link to={`/leads/${lead.id}`} className="font-medium hover:underline">{leadTitle(lead)}</Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t(`crm.leads.source.${lead.source}`)}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{t(`crm.leads.status.${lead.status}`)}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {lead.priority ? t(`crm.leads.priority.${lead.priority}`) : t("crm.leads.priority.none")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{dateFormat.format(new Date(lead.createdAt))}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/leads/${lead.id}`}>{t("crm.leads.actions.open")}</Link>
                        </Button>
                        {open && lead.status === "new" && (
                          <Button size="sm" variant="ghost" disabled={triageMutation.isPending} onClick={() => triageMutation.mutate(lead)}>
                            {t("crm.leads.actions.triage")}
                          </Button>
                        )}
                        {open && (
                          <Button size="sm" variant="ghost" disabled={convertMutation.isPending} onClick={() => convertMutation.mutate(lead)}>
                            {t("crm.leads.actions.convert")}
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
