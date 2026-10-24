import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Mail, Phone, Plus, Search, Upload, UserRound } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { accentTint } from "../../lib/accent";
import { ContactCreateDialog } from "../../components/crm/ContactCreateDialog";
import { AccentPill, MUTED, PartyAvatar, SKY } from "../../components/crm/CustomerListParts";
import { TableShell, tableCell } from "../../components/crm/CustomersTable";

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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("uxCrm.list.people", { defaultValue: "Personas" })}</h1>
          <p className="text-sm text-muted-foreground">{t("uxCrm.list.peopleHint", { defaultValue: "Las personas con las que hablas, de todos tus clientes." })}</p>
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
            {t("crm.contacts.newContact")}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            aria-label={t("crm.contacts.searchPlaceholder")}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder={t("crm.contacts.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("crm.contacts.statusLabel")}>
          {([["active", t("crm.contacts.statusActive")], ["archived", t("crm.contacts.statusArchived")], ["all", t("crm.contacts.statusAll")]] as [StatusFilter, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={status === id}
              onClick={() => setStatus(id)}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", status === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
              style={status === id ? { background: accentTint(SKY, 30) } : undefined}
            >
              {label}
            </button>
          ))}
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
        <TableShell minWidth="min-w-136">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{t("uxCrm.list.colPerson", { defaultValue: "Persona" })}</th>
              <th scope="col" className="hidden px-3 py-2.5 text-left text-xs font-medium text-muted-foreground md:table-cell">{t("uxCrm.list.colRole", { defaultValue: "Cargo" })}</th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{t("uxCrm.list.colContact", { defaultValue: "Contacto" })}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((contact) => {
              const archived = contact.status === "archived";
              return (
                <tr key={contact.id} className={cn("border-t border-border/70 first:border-t-0", archived && "opacity-70")}>
                  <td className={tableCell}>
                    <div className="flex items-center gap-3">
                      <PartyAvatar name={contact.displayName} size="sm" />
                      <span className="max-w-56 truncate font-medium">{contact.displayName}</span>
                      {archived && <AccentPill color={MUTED}>{t("crm.contacts.archivedBadge")}</AccentPill>}
                    </div>
                  </td>
                  <td className={cn(tableCell, "hidden text-muted-foreground md:table-cell")}>{contact.title ?? t("uxCrm.list.noRole", { defaultValue: "Sin cargo" })}</td>
                  <td className={cn(tableCell, "max-w-72")}>
                    <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.primaryEmail ?? t("crm.contacts.noEmail")}</span></span>
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.primaryPhone ?? t("crm.contacts.noPhone")}</span></span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
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
