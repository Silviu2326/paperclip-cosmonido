import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
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
import { CustomerCreateDialog } from "../../components/crm/CustomerCreateDialog";

type StatusFilter = "active" | "archived" | "all";

export function Customers() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.customers") }]);
  }, [setBreadcrumbs, t]);

  // Debounce the search box so each keystroke does not hit the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = { q, status };
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.customers.list(selectedCompanyId ?? ""), filters],
    enabled: !!selectedCompanyId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      crmApi.customers.list(selectedCompanyId!, {
        q: q || undefined,
        status: status === "all" ? undefined : status,
        cursor: pageParam ?? undefined,
        limit: 25,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message={t("crm.customers.selectCompany")} />;
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
          placeholder={t("crm.customers.searchPlaceholder")}
          aria-label={t("crm.customers.searchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
        />
        <NativeSelect
          aria-label={t("crm.customers.statusLabel")}
          className="w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          <option value="active">{t("crm.customers.statusActive")}</option>
          <option value="archived">{t("crm.customers.statusArchived")}</option>
          <option value="all">{t("crm.customers.statusAll")}</option>
        </NativeSelect>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t("crm.customers.newCustomer")}
          </Button>
        </div>
      </div>

      {query.isLoading && <PageSkeleton variant="list" />}

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 403
            ? t("crm.customers.forbidden")
            : t("crm.customers.loadError")}
        </p>
      )}

      {query.data && items.length === 0 && (
        <EmptyState
          icon={Users}
          message={filtered ? t("crm.customers.emptyFiltered") : t("crm.customers.empty")}
          action={filtered ? undefined : t("crm.customers.newCustomer")}
          onAction={filtered ? undefined : () => setCreateOpen(true)}
        />
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((customer) => (
            <li key={customer.id}>
              <Link
                to={`/customers/${customer.id}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{customer.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {customer.domain ?? t("crm.customers.noDomain")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {customer.status === "archived" && (
                    <Badge variant="outline">{t("crm.customers.archivedBadge")}</Badge>
                  )}
                </div>
              </Link>
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
            {query.isFetchingNextPage ? t("crm.customers.loadingMore") : t("crm.customers.loadMore")}
          </Button>
        </div>
      )}

      <CustomerCreateDialog open={createOpen} onOpenChange={setCreateOpen} companyId={selectedCompanyId} />
    </div>
  );
}
