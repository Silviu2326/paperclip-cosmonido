import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, MessagesSquare, Repeat, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BRAND, readable, tint, useMotionTokens } from "../motion";
import { Avatar, ChannelIcon, HEALTH, Pill } from "./CustomersProposal";
import { euros, type DemoContact, type DemoCustomer, type DemoService } from "./demo-data";

const MINT = BRAND(8);
const SKY = BRAND(7);
const YELLOW = BRAND(10);
const RISK = "var(--destructive)";
const MUTED = "var(--muted-foreground)";

export type SortKey = "name" | "health" | "monthly" | "tasks" | "proposals";
/** null keeps the natural order of the list. */
export type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

const HEALTH_ORDER: Record<DemoCustomer["health"], number> = { risk: 0, watch: 1, good: 2 };
const monthlyOf = (customer: DemoCustomer) => customer.services.filter((service) => service.status !== "paused").reduce((sum, service) => sum + service.monthlyCents, 0);
const SORTERS: Record<SortKey, (a: DemoCustomer, b: DemoCustomer) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, "es"),
  health: (a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health],
  monthly: (a, b) => monthlyOf(a) - monthlyOf(b),
  tasks: (a, b) => a.activeTasks - b.activeTasks,
  proposals: (a, b) => a.openProposals.length - b.openProposals.length,
};

export function sortCustomers(customers: DemoCustomer[], sort: SortState): DemoCustomer[] {
  if (!sort) return customers;
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...customers].sort((a, b) => sign * SORTERS[sort.key](a, b));
}

/** Click cycle: first click is the natural direction (numbers start high to low), second reverses it, third clears. */
export function nextSort(current: SortState, key: SortKey): SortState {
  const first = key === "name" || key === "health" ? "asc" : "desc";
  if (!current || current.key !== key) return { key, direction: first };
  return current.direction === first ? { key, direction: first === "asc" ? "desc" : "asc" } : null;
}

function Th({ children, align = "left", className, sort }: {
  children: string;
  align?: "left" | "right" | "center";
  className?: string;
  sort?: { key: SortKey; state: SortState; onSort: (key: SortKey) => void };
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

function TableShell({ children, minWidth }: { children: React.ReactNode; minWidth: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-sm", minWidth)}>{children}</table>
      </div>
    </div>
  );
}

const cell = "px-3 py-3 align-middle";

/** Customers as a table. With the side panel open (compact) the secondary columns step aside so the row stays readable. */
export function CustomersTable({ customers, selectedId, onSelect, sort, onSort, compact }: {
  customers: DemoCustomer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  compact: boolean;
}) {
  const secondary = compact ? "hidden" : "hidden lg:table-cell";
  const tertiary = compact ? "hidden" : "hidden xl:table-cell";
  return (
    <TableShell minWidth="min-w-136">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <Th sort={{ key: "name", state: sort, onSort }}>Cliente</Th>
          <Th sort={{ key: "health", state: sort, onSort }}>Salud</Th>
          <Th className={secondary}>Contacto</Th>
          <Th align="right" sort={{ key: "monthly", state: sort, onSort }}>Mensual</Th>
          <Th align="center" sort={{ key: "tasks", state: sort, onSort }}>Tareas</Th>
          <Th align="center" className={secondary} sort={{ key: "proposals", state: sort, onSort }}>Propuestas</Th>
          <Th className={tertiary}>Última actividad</Th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const health = HEALTH[customer.health];
          const accent = customer.archived ? MUTED : health.color;
          const selected = customer.id === selectedId;
          const primary = customer.contacts.find((person) => person.primary) ?? customer.contacts[0];
          const monthly = monthlyOf(customer);
          return (
            <tr
              key={customer.id}
              aria-selected={selected}
              onClick={() => onSelect(selected ? null : customer.id)}
              className={cn("cursor-pointer border-t border-border/70 transition-colors duration-(--motion-duration-fast) first:border-t-0 hover:bg-accent/40", customer.archived && "opacity-70")}
              style={selected ? { background: tint(accent, 10) } : undefined}
            >
              <td className={cell} style={{ boxShadow: `inset 3px 0 0 ${selected ? accent : tint(accent, 55)}` }}>
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button className="max-w-56 truncate rounded text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{customer.name}</button>
                      {customer.unreadConversations ? <Pill color={SKY} strong><MessagesSquare className="h-3 w-3" />{customer.unreadConversations}</Pill> : null}
                    </div>
                    <p className="max-w-56 truncate text-xs text-muted-foreground">{customer.domain ?? (customer.kind === "person" ? "Persona" : "Sin web")}</p>
                  </div>
                </div>
              </td>
              <td className={cell}>{customer.archived ? <Pill color={MUTED}>Archivado</Pill> : <Pill color={health.color}>{health.label}</Pill>}</td>
              <td className={cn(cell, secondary)}>
                {primary ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground"><span className="max-w-40 truncate text-foreground">{primary.name}</span><ChannelIcon channel={primary.channel} /></span>
                ) : <span className="text-muted-foreground">Sin contacto</span>}
              </td>
              <td className={cn(cell, "text-right tabular-nums")}>{monthly ? <>{euros(monthly)}<span className="text-xs text-muted-foreground">/mes</span></> : <span className="text-muted-foreground">—</span>}</td>
              <td className={cn(cell, "text-center tabular-nums", customer.activeTasks === 0 && "text-muted-foreground")}>{customer.activeTasks}</td>
              <td className={cn(cell, secondary, "text-center tabular-nums", customer.openProposals.length === 0 && "text-muted-foreground")}>{customer.openProposals.length}</td>
              <td className={cn(cell, tertiary, "text-xs text-muted-foreground")}>{customer.lastActivityLabel}</td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

/** Every person across customers. Opening one takes you to their customer. */
export function PeopleTable({ people, onOpenCustomer }: {
  people: { person: DemoContact; customer: DemoCustomer }[];
  onOpenCustomer: (id: string) => void;
}) {
  return (
    <TableShell minWidth="min-w-120">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <Th>Persona</Th>
          <Th className="hidden md:table-cell">Cargo</Th>
          <Th>Cliente</Th>
          <Th className="hidden lg:table-cell">Contacto</Th>
          <Th align="center">Canal</Th>
        </tr>
      </thead>
      <tbody>
        {people.map(({ person, customer }) => (
          <tr key={person.id} onClick={() => onOpenCustomer(customer.id)} className="cursor-pointer border-t border-border/70 transition-colors duration-(--motion-duration-fast) first:border-t-0 hover:bg-accent/40">
            <td className={cell}>
              <div className="flex items-center gap-3">
                <Avatar name={person.name} size="sm" />
                <button className="flex items-center gap-1 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="max-w-48 truncate">{person.name}</span>
                  {person.primary ? <Star className="h-3 w-3 shrink-0 fill-current" style={{ color: YELLOW }} aria-label="Contacto principal" /> : null}
                </button>
              </div>
            </td>
            <td className={cn(cell, "hidden text-muted-foreground md:table-cell")}>{person.title ?? "Sin cargo"}</td>
            <td className={cell}><Pill color={customer.archived ? MUTED : HEALTH[customer.health].color}>{customer.name}</Pill></td>
            <td className={cn(cell, "hidden max-w-60 truncate text-muted-foreground lg:table-cell")}>{person.email ?? person.phone}</td>
            <td className={cn(cell, "text-center text-muted-foreground")}><span className="inline-flex"><ChannelIcon channel={person.channel} /></span></td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

const SERVICE_STATUS: Record<DemoService["status"], { label: string; color: string } | null> = {
  active: null,
  renewing: { label: "Renovando", color: YELLOW },
  paused: { label: "En pausa", color: RISK },
};

/** Recurring services of every customer, in a popup. Choosing one opens its customer. */
export function ServicesDialog({ open, onOpenChange, services, monthly, onOpenCustomer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: { service: DemoService; customer: DemoCustomer }[];
  monthly: number;
  onOpenCustomer: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `linear-gradient(135deg, ${tint(MINT, 34)}, ${tint(MINT, 16)})`, boxShadow: `inset 0 0 0 1px ${tint(MINT, 32)}`, color: readable(MINT) }}>
              <Repeat className="h-5 w-5" />
            </span>
            <div className="min-w-0 text-left">
              <DialogTitle>Servicios recurrentes</DialogTitle>
              <DialogDescription>{services.length} servicios · {euros(monthly)}/mes entre todos tus clientes</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {services.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay servicios recurrentes.</p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {services.map(({ service, customer }) => {
              const status = SERVICE_STATUS[service.status];
              return (
                <button key={service.id} onClick={() => { onOpenChange(false); onOpenCustomer(customer.id); }} className="flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <Avatar name={customer.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{service.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{customer.name} · renueva {new Date(service.nextRenewal).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p>
                  </div>
                  {status ? <Pill color={status.color}>{status.label}</Pill> : null}
                  <span className="w-20 text-right font-semibold tabular-nums">{euros(service.monthlyCents)}</span>
                </button>
              );
            })}
            <div className="flex justify-between bg-muted/40 p-3 text-sm font-semibold"><span>Total mensual</span><span className="tabular-nums">{euros(monthly)}</span></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
