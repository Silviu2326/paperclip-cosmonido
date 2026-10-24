import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, LayoutGrid, Plus, Repeat, Search, Table2, Upload, Users } from "lucide-react";
import type { Customer } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { proposalsApi } from "../../api/proposals";
import { ApiError } from "../../api/client";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { queryKeys } from "../../lib/queryKeys";
import { accentTint } from "../../lib/accent";
import {
  filterCustomers,
  needsAttention,
  isNewCustomer,
  nextCustomerSort,
  sortCustomers,
  type CustomerListFilter,
  type CustomerSort,
} from "../../lib/customers-list";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CustomerCreateDialog } from "../../components/crm/CustomerCreateDialog";
import { CustomerCard, CustomersTable } from "../../components/crm/CustomersTable";
import { LILAC, MINT, SKY, StatCard, YELLOW } from "../../components/crm/CustomerListParts";
import { ServicesDialog, isRunningAgreement, useServiceAgreements } from "../../components/crm/ServicesDialog";

type Layout = "table" | "cards";

const PAGE_SIZE = 50;
const SUMMARY_SIZE = 100;
const OPEN_PROPOSAL_STATUSES = new Set(["sent", "viewed"]);

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function Customers() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CustomerListFilter>("all");
  const [layout, setLayout] = useState<Layout>("table");
  const [sort, setSort] = useState<CustomerSort>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.customers") }]);
  }, [setBreadcrumbs, t]);

  // Debounce the search box so each keystroke does not hit the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const status = filter === "archived" ? "archived" : "active";
  const companyId = selectedCompanyId ?? "";
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.customers.list(companyId), { q, status }],
    enabled: !!selectedCompanyId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      crmApi.customers.list(selectedCompanyId!, {
        q: q || undefined,
        status,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

  // Summary cards always describe the active customers, whatever the list is showing.
  const summary = useQuery({
    queryKey: [...queryKeys.customers.list(companyId), "summary"],
    enabled: !!selectedCompanyId,
    queryFn: () => crmApi.customers.list(selectedCompanyId!, { status: "active", limit: SUMMARY_SIZE }),
  });
  const proposals = useQuery({
    queryKey: ["proposals", selectedCompanyId, "open-summary"],
    enabled: !!selectedCompanyId,
    queryFn: () => proposalsApi.list(selectedCompanyId!),
    retry: false,
  });
  const agreements = useServiceAgreements(selectedCompanyId);

  const restore = useMutation({
    mutationFn: (customer: Customer) => crmApi.customers.update(customer.id, { status: "active" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.list(companyId) });
    },
  });

  const loaded = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const visible = useMemo(() => sortCustomers(filterCustomers(loaded, filter), sort), [loaded, filter, sort]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message={t("crm.customers.selectCompany")} />;
  }

  const activeCustomers = summary.data?.items ?? [];
  const attention = activeCustomers.filter(needsAttention).length;
  const newCount = activeCustomers.filter((customer) => isNewCustomer(customer)).length;
  const openProposals = (proposals.data ?? []).filter((proposal) => OPEN_PROPOSAL_STATUSES.has(proposal.status));
  const proposalCurrency = openProposals[0]?.currency ?? "EUR";
  const proposalTotal = openProposals.reduce((sum, proposal) => sum + proposal.priceCents, 0);
  const runningAgreements = (agreements.data ?? []).filter(isRunningAgreement);
  const countLabel = `${activeCustomers.length}${summary.data?.nextCursor ? "+" : ""}`;
  const error = query.error;
  const forbidden = error instanceof ApiError && error.status === 403;
  const isEmpty = !!query.data && loaded.length === 0 && filter === "all" && !q;

  const filterOptions: readonly (readonly [CustomerListFilter, string, string | null])[] = [
    ["all", t("uxCrm.list.filterAll", { defaultValue: "Todos" }), null],
    ["attention", `${t("uxCrm.list.filterAttention", { defaultValue: "Atención" })}${attention ? ` · ${attention}` : ""}`, YELLOW],
    ["new", t("uxCrm.list.filterNew", { defaultValue: "Nuevos" }), SKY],
    ["archived", t("uxCrm.list.filterArchived", { defaultValue: "Archivados" }), null],
  ];
  const layoutOptions = [
    ["table", t("uxCrm.list.viewTable", { defaultValue: "Tabla" }), Table2],
    ["cards", t("uxCrm.list.viewCards", { defaultValue: "Tarjetas" }), LayoutGrid],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.customers")}</h1>
          {summary.data ? (
            <p className="text-sm text-muted-foreground">
              {t("uxCrm.list.subtitle", { label: countLabel, defaultValue: "{{label}} clientes activos" })}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/customers/contacts/import">
              <Upload className="h-4 w-4" />
              {t("uxCrm.importContacts", { defaultValue: "Importar contactos" })}
            </Link>
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("crm.customers.newCustomer")}
          </Button>
        </div>
      </header>

      {summary.data && activeCustomers.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            index={0}
            label={t("uxCrm.list.statCustomers", { defaultValue: "Clientes activos" })}
            value={countLabel}
            hint={t("uxCrm.list.statCustomersHint", { count: newCount, defaultValue: "{{count}} nuevos en 30 días" })}
            color={MINT}
            icon={Users}
          />
          <StatCard
            index={1}
            label={t("uxCrm.list.statAttention", { defaultValue: "Necesitan atención" })}
            value={String(attention)}
            unit={t("uxCrm.list.statAttentionUnit", { count: activeCustomers.length, defaultValue: "de {{count}} clientes" })}
            hint={t("uxCrm.list.statAttentionHint", { defaultValue: "Salud baja o a vigilar" })}
            color={YELLOW}
            icon={AlertTriangle}
          />
          {proposals.data ? (
            <StatCard
              index={2}
              label={t("uxCrm.list.statProposals", { defaultValue: "Propuestas abiertas" })}
              value={formatMoney(proposalTotal, proposalCurrency)}
              hint={t("uxCrm.list.statProposalsHint", { count: openProposals.length, defaultValue: "{{count}} en curso" })}
              color={SKY}
              icon={FileText}
            />
          ) : null}
          {agreements.data ? (
            <StatCard
              index={3}
              label={t("uxCrm.list.statServices", { defaultValue: "Servicios en marcha" })}
              value={String(runningAgreements.length)}
              hint={t("uxCrm.list.statServicesHint", { defaultValue: "Ver servicios recurrentes" })}
              color={LILAC}
              icon={Repeat}
              onOpen={() => setServicesOpen(true)}
              openLabel={t("uxCrm.list.statServicesOpen", { defaultValue: "Ver servicios recurrentes" })}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            aria-label={t("crm.customers.searchPlaceholder")}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder={t("crm.customers.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("crm.customers.statusLabel")}>
          {filterOptions.map(([id, label, color]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", filter === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
              style={filter === id ? { background: color ? accentTint(color, 30) : "var(--accent)" } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label={t("uxCrm.list.layoutLabel", { defaultValue: "Forma de la lista" })}
          className="ml-auto inline-flex rounded-xl border border-border bg-muted/40 p-1 max-md:hidden"
        >
          {layoutOptions.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={layout === id}
              aria-label={label}
              title={label}
              onClick={() => setLayout(id)}
              className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-(--motion-duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", layout === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {query.isLoading && <PageSkeleton variant="list" />}

      {error && (
        <p className="text-sm text-destructive">
          {forbidden ? t("crm.customers.forbidden") : t("crm.customers.loadError")}
        </p>
      )}

      {isEmpty && (
        <EmptyState
          icon={Users}
          message={t("crm.customers.empty")}
          action={t("crm.customers.newCustomer")}
          onAction={() => setCreateOpen(true)}
        />
      )}

      {query.data && !isEmpty && visible.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: accentTint(SKY, 22) }}>
            <Search className="h-6 w-6" />
          </span>
          <p className="font-medium">
            {q ? t("uxCrm.list.noMatch", { query: q, defaultValue: "Ningún cliente coincide con «{{query}}»" }) : t("crm.customers.emptyFiltered")}
          </p>
          <Button variant="outline" onClick={() => { setSearch(""); setQ(""); setFilter("all"); }}>
            {t("uxCrm.list.clearSearch", { defaultValue: "Limpiar búsqueda" })}
          </Button>
        </div>
      )}

      {visible.length > 0 && (
        <>
          {layout === "table" ? (
            <div className="hidden md:block">
              <CustomersTable
                customers={visible}
                sort={sort}
                onSort={(key) => setSort((current) => nextCustomerSort(current, key))}
                onRestore={(customer) => restore.mutate(customer)}
                restoringId={restore.isPending ? restore.variables?.id ?? null : null}
              />
            </div>
          ) : null}
          {/* Cards: the chosen layout, and the phone fallback when the table is chosen. */}
          <div className={cn("flex flex-col gap-3", layout === "table" && "md:hidden")}>
            {visible.map((customer) => <CustomerCard key={customer.id} customer={customer} />)}
          </div>
        </>
      )}

      {restore.error && <p className="text-sm text-destructive">{t("crm.customers.updateError")}</p>}

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

      <ServicesDialog open={servicesOpen} onOpenChange={setServicesOpen} agreements={runningAgreements} customers={activeCustomers} />
      <CustomerCreateDialog open={createOpen} onOpenChange={setCreateOpen} companyId={selectedCompanyId} />
    </div>
  );
}
