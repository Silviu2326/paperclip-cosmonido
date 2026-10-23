import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Plus, Upload, UserRound } from "lucide-react";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { ApiError } from "../../api/client";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { queryKeys } from "../../lib/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ContactCreateDialog } from "../../components/crm/ContactCreateDialog";

type StatusFilter = "active" | "archived" | "all";

export function Contacts() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.contacts") }]);
  }, [setBreadcrumbs, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: [...queryKeys.contacts.list(selectedCompanyId ?? ""), { q, status }],
    enabled: !!selectedCompanyId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      crmApi.contacts.list(selectedCompanyId!, {
        q: q || undefined,
        status: status === "all" ? undefined : status,
        cursor: pageParam ?? undefined,
        limit: 25,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={UserRound} message={t("crm.contacts.selectCompany")} />;
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = q.length > 0 || status !== "active";
  const error = query.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          value={search}
          placeholder={t("crm.contacts.searchPlaceholder")}
          aria-label={t("crm.contacts.searchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
        />
        <NativeSelect
          aria-label={t("crm.contacts.statusLabel")}
          className="w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          <option value="active">{t("crm.contacts.statusActive")}</option>
          <option value="archived">{t("crm.contacts.statusArchived")}</option>
          <option value="all">{t("crm.contacts.statusAll")}</option>
        </NativeSelect>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/customers/contacts/import">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {t("uxCrm.importContacts", { defaultValue: "Import contacts" })}
            </Link>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t("crm.contacts.newContact")}
          </Button>
        </div>
      </div>

      {query.isLoading && <PageSkeleton variant="list" />}

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 403 ? t("crm.customers.forbidden") : t("crm.contacts.loadError")}
        </p>
      )}

      {query.data && items.length === 0 && (
        <EmptyState
          icon={UserRound}
          message={filtered ? t("crm.contacts.emptyFiltered") : t("crm.contacts.empty")}
          action={filtered ? undefined : t("crm.contacts.newContact")}
          onAction={filtered ? undefined : () => setCreateOpen(true)}
        />
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{contact.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {contact.primaryEmail ?? t("crm.contacts.noEmail")}
                  {" · "}
                  {contact.primaryPhone ?? t("crm.contacts.noPhone")}
                </div>
              </div>
              {contact.status === "archived" && <Badge variant="outline">{t("crm.contacts.archivedBadge")}</Badge>}
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? t("crm.contacts.loadingMore") : t("crm.contacts.loadMore")}
          </Button>
        </div>
      )}

      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} companyId={selectedCompanyId} />
    </div>
  );
}
