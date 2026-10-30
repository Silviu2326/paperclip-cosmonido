import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, type LucideIcon } from "lucide-react";
import type { Customer } from "@paperclipai/shared";
import { Link, useNavigate } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useMotionTokens } from "@/hooks/useMotionTokens";
import { Button } from "@/components/ui/button";
import { accentTint } from "@/lib/accent";
import type { CustomerSort, CustomerSortKey } from "@/lib/customers-list";
import { cn } from "@/lib/utils";
import { CustomersActionsMenu } from "./CustomersActionsMenu";
import { CrmQuickActions } from "./CrmQuickActions";
import { AccentPill, MUTED, PartyAvatar, formatShortDate, useHealthMeta } from "./CustomerListParts";

function Th({ children, align = "left", className, sort }: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  sort?: { key: CustomerSortKey; state: CustomerSort; onSort: (key: CustomerSortKey) => void };
}) {
  const tokens = useMotionTokens();
  const active = sort && sort.state?.key === sort.key;
  const direction = sort?.state?.direction ?? "asc";
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : sort ? "none" : undefined}
      className={cn("px-3 py-2.5 text-xs font-medium", align === "right" && "text-right", align === "center" && "text-center", align === "left" && "text-left", className)}
    >
      {sort ? (
        <button
          type="button"
          onClick={() => sort.onSort(sort.key)}
          className={cn("inline-flex items-center gap-1 rounded-md transition-colors duration-(--motion-duration-fast) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "text-foreground" : "text-muted-foreground")}
        >
          {children}
          {active ? (
            <motion.span key={direction} initial={{ y: direction === "asc" ? 4 : -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex">
              {direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </motion.span>
          ) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
        </button>
      ) : <span className="text-muted-foreground">{children}</span>}
    </th>
  );
}

export function TableShell({ children, minWidth }: { children: ReactNode; minWidth: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-sm", minWidth)}>{children}</table>
      </div>
    </div>
  );
}

export const tableCell = "px-3 py-3 align-middle";
export const tableRow = "cursor-pointer border-t border-border/70 transition-colors duration-(--motion-duration-fast) first:border-t-0 hover:bg-accent/40";

/** Icon link of a row. Stops the click so it does not also open the row's detail page. */
export function RowLink({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground">
      <Link to={to} aria-label={label} title={label} onClick={(event) => event.stopPropagation()}>
        <Icon className="h-4 w-4" />
      </Link>
    </Button>
  );
}

function domainOf(customer: Customer, fallbackPerson: string, fallbackNone: string) {
  return customer.domain ?? (customer.kind === "person" ? fallbackPerson : fallbackNone);
}

/** Customers as a table. A row opens the customer's page; the buttons on its right act without leaving the list. */
export function CustomersTable({ customers, sort, onSort, onRestore, onEdit, onAddContact, onArchive, restoringId }: {
  customers: Customer[];
  sort: CustomerSort;
  onSort: (key: CustomerSortKey) => void;
  onRestore: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onAddContact: (customer: Customer) => void;
  onArchive: (customer: Customer) => void;
  restoringId: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const healthMeta = useHealthMeta();
  return (
    <TableShell minWidth="min-w-160">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <Th sort={{ key: "name", state: sort, onSort }}>{t("uxCrm.list.colCustomer", { defaultValue: "Cliente" })}</Th>
          <Th sort={{ key: "health", state: sort, onSort }}>{t("uxCrm.list.colHealth", { defaultValue: "Salud" })}</Th>
          <Th className="hidden lg:table-cell">{t("uxCrm.list.colTags", { defaultValue: "Etiquetas" })}</Th>
          <Th className="hidden md:table-cell" sort={{ key: "created", state: sort, onSort }}>{t("uxCrm.list.colCreated", { defaultValue: "Alta" })}</Th>
          <Th align="right"><span className="sr-only">{t("uxCrm.list.colActions", { defaultValue: "Acciones" })}</span></Th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const archived = customer.status === "archived";
          const health = healthMeta(customer.health);
          const accent = archived ? MUTED : health.color;
          return (
            <tr key={customer.id} tabIndex={0} aria-label={t("uxCrm.customers.openCustomer", { name: customer.name, defaultValue: "Open {{name}}" })} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); navigate(`/customers/${customer.id}`); } }} onClick={() => navigate(`/customers/${customer.id}`)} className={cn(tableRow, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", archived && "opacity-70")}>
              <td className={tableCell} style={{ boxShadow: `inset 3px 0 0 ${accentTint(accent, 70)}` }}>
                <div className="flex items-center gap-3">
                  <PartyAvatar name={customer.name} size="sm" />
                  <div className="min-w-0">
                    <Link
                      to={`/customers/${customer.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block max-w-56 truncate rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {customer.name}
                    </Link>
                    <p className="max-w-56 truncate text-xs text-muted-foreground">
                      {domainOf(customer, t("uxCrm.list.person", { defaultValue: "Persona" }), t("crm.customers.noDomain"))}
                    </p>
                  </div>
                </div>
              </td>
              <td className={tableCell}>
                {archived ? <AccentPill color={MUTED}>{t("crm.customers.archivedBadge")}</AccentPill> : <AccentPill color={health.color}>{health.label}</AccentPill>}
              </td>
              <td className={cn(tableCell, "hidden max-w-48 lg:table-cell")}>
                <span className="block truncate text-xs text-muted-foreground">{customer.tags.length ? customer.tags.join(" · ") : "—"}</span>
              </td>
              <td className={cn(tableCell, "hidden text-xs text-muted-foreground md:table-cell")}>{formatShortDate(customer.createdAt)}</td>
              <td className={cn(tableCell, "pr-2")}>
                <div className="flex items-center justify-end gap-0.5">
                  {!archived && <CrmQuickActions target={{ kind: "customer", customer }} onEdit={() => onEdit(customer)} onAddContact={() => onAddContact(customer)} />}
                  <CustomersActionsMenu customer={customer} busy={restoringId === customer.id} onEdit={() => onEdit(customer)} onAddContact={() => onAddContact(customer)} onArchive={() => onArchive(customer)} onRestore={() => onRestore(customer)} onProposal={() => navigate(`/sales/proposals?customerId=${encodeURIComponent(customer.id)}`)} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

/** Card layout: the chosen alternative to the table, and the phone fallback when the table is chosen. */
export function CustomerCard({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const healthMeta = useHealthMeta();
  const archived = customer.status === "archived";
  const health = healthMeta(customer.health);
  const accent = archived ? MUTED : health.color;
  return (
    <Link
      to={`/customers/${customer.id}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border p-4 text-left",
        "transition-[box-shadow,transform] duration-(--motion-duration-fast) ease-(--motion-ease-out-expo)",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        archived && "opacity-70",
      )}
    >
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: accent }} />
      <div className="flex items-start gap-3">
        <PartyAvatar name={customer.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="max-w-full truncate font-semibold">{customer.name}</span>
            {archived ? <AccentPill color={MUTED}>{t("crm.customers.archivedBadge")}</AccentPill> : <AccentPill color={health.color}>{health.label}</AccentPill>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[domainOf(customer, t("uxCrm.list.person", { defaultValue: "Persona" }), t("crm.customers.noDomain")), ...customer.tags].join(" · ")}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
      </div>
      <p className="text-xs text-muted-foreground">{t("uxCrm.list.createdOn", { date: formatShortDate(customer.createdAt), defaultValue: "Alta el {{date}}" })}</p>
    </Link>
  );
}
