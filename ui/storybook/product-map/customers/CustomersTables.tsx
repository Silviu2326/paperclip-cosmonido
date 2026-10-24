import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, FileText, Mail, MessageCircle, MessagesSquare, Phone, Plus, Repeat, Star, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BRAND, readable, tint, useMotionTokens } from "../motion";
import type { ActionHandler } from "./CustomerDetail";
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
  children: ReactNode;
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

function TableShell({ children, minWidth }: { children: ReactNode; minWidth: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-sm", minWidth)}>{children}</table>
      </div>
    </div>
  );
}

const cell = "px-3 py-3 align-middle";

/** Icon button of a row. Stops the click so it does not also open the row's detail page. */
function RowButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

const rowClass = "cursor-pointer border-t border-border/70 transition-colors duration-(--motion-duration-fast) first:border-t-0 hover:bg-accent/40";

/** Customers as a table. A row opens the customer's page; the buttons on its right act without leaving the list. */
export function CustomersTable({ customers, sort, onSort, onOpen, onAction, onRestore, canAct = true }: {
  customers: DemoCustomer[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
  onAction: ActionHandler;
  onRestore: (id: string) => void;
  /** Read-only members only see the open button. */
  canAct?: boolean;
}) {
  return (
    <TableShell minWidth="min-w-160">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <Th sort={{ key: "name", state: sort, onSort }}>Cliente</Th>
          <Th sort={{ key: "health", state: sort, onSort }}>Salud</Th>
          <Th className="hidden lg:table-cell">Contacto</Th>
          <Th align="right" sort={{ key: "monthly", state: sort, onSort }}>Mensual</Th>
          <Th align="center" sort={{ key: "tasks", state: sort, onSort }}>Tareas</Th>
          <Th align="center" className="hidden lg:table-cell" sort={{ key: "proposals", state: sort, onSort }}>Propuestas</Th>
          <Th className="hidden xl:table-cell">Última actividad</Th>
          <Th align="right"><span className="sr-only">Acciones</span></Th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const health = HEALTH[customer.health];
          const accent = customer.archived ? MUTED : health.color;
          const primary = customer.contacts.find((person) => person.primary) ?? customer.contacts[0];
          const monthly = monthlyOf(customer);
          return (
            <tr key={customer.id} onClick={() => onOpen(customer.id)} className={cn(rowClass, customer.archived && "opacity-70")}>
              <td className={cell} style={{ boxShadow: `inset 3px 0 0 ${tint(accent, 70)}` }}>
                <div className="flex items-center gap-3">
                  <Avatar name={customer.name} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button onClick={(event) => { event.stopPropagation(); onOpen(customer.id); }} className="max-w-56 truncate rounded text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{customer.name}</button>
                      {customer.unreadConversations ? <Pill color={SKY} strong><MessagesSquare className="h-3 w-3" />{customer.unreadConversations}</Pill> : null}
                    </div>
                    <p className="max-w-56 truncate text-xs text-muted-foreground">{customer.domain ?? (customer.kind === "person" ? "Persona" : "Sin web")}</p>
                  </div>
                </div>
              </td>
              <td className={cell}>{customer.archived ? <Pill color={MUTED}>Archivado</Pill> : <Pill color={health.color}>{health.label}</Pill>}</td>
              <td className={cn(cell, "hidden lg:table-cell")}>
                {primary ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground"><span className="max-w-40 truncate text-foreground">{primary.name}</span><ChannelIcon channel={primary.channel} /></span>
                ) : <span className="text-muted-foreground">Sin contacto</span>}
              </td>
              <td className={cn(cell, "text-right tabular-nums")}>{monthly ? <>{euros(monthly)}<span className="text-xs text-muted-foreground">/mes</span></> : <span className="text-muted-foreground">—</span>}</td>
              <td className={cn(cell, "text-center tabular-nums", customer.activeTasks === 0 && "text-muted-foreground")}>{customer.activeTasks}</td>
              <td className={cn(cell, "hidden text-center tabular-nums lg:table-cell", customer.openProposals.length === 0 && "text-muted-foreground")}>{customer.openProposals.length}</td>
              <td className={cn(cell, "hidden text-xs text-muted-foreground xl:table-cell")}>{customer.lastActivityLabel}</td>
              <td className={cn(cell, "pr-2")}>
                <div className="flex items-center justify-end gap-0.5">
                  {customer.archived && canAct ? (
                    <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); onRestore(customer.id); }}>Restaurar</Button>
                  ) : canAct ? <>
                    <RowButton icon={MessageCircle} label={`Escribir a ${primary?.name ?? customer.name}`} onClick={() => onAction("message", customer, primary)} />
                    <RowButton icon={Plus} label={`Nueva tarea para ${customer.name}`} onClick={() => onAction("task", customer)} />
                    <RowButton icon={FileText} label={`Nueva propuesta para ${customer.name}`} onClick={() => onAction("proposal", customer)} />
                  </> : null}
                  <RowButton icon={ArrowRight} label={`Abrir ${customer.name}`} onClick={() => onOpen(customer.id)} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

/** Every person across customers. A row opens the person's page; their customer opens from its pill. */
export function PeopleTable({ people, onOpenPerson, onOpenCustomer, onAction, canAct = true }: {
  people: { person: DemoContact; customer: DemoCustomer }[];
  onOpenPerson: (personId: string, customerId: string) => void;
  onOpenCustomer: (id: string) => void;
  onAction: ActionHandler;
  canAct?: boolean;
}) {
  return (
    <TableShell minWidth="min-w-136">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <Th>Persona</Th>
          <Th className="hidden md:table-cell">Cargo</Th>
          <Th>Cliente</Th>
          <Th className="hidden lg:table-cell">Contacto</Th>
          <Th align="right"><span className="sr-only">Acciones</span></Th>
        </tr>
      </thead>
      <tbody>
        {people.map(({ person, customer }) => {
          const ChannelButton = person.channel === "phone" ? Phone : person.channel === "email" ? Mail : MessageCircle;
          return (
            <tr key={person.id} onClick={() => onOpenPerson(person.id, customer.id)} className={rowClass}>
              <td className={cell}>
                <div className="flex items-center gap-3">
                  <Avatar name={person.name} size="sm" />
                  <button onClick={(event) => { event.stopPropagation(); onOpenPerson(person.id, customer.id); }} className="flex items-center gap-1 rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="max-w-48 truncate">{person.name}</span>
                    {person.primary ? <Star className="h-3 w-3 shrink-0 fill-current" style={{ color: YELLOW }} aria-label="Contacto principal" /> : null}
                  </button>
                </div>
              </td>
              <td className={cn(cell, "hidden text-muted-foreground md:table-cell")}>{person.title ?? "Sin cargo"}</td>
              <td className={cell}>
                <button onClick={(event) => { event.stopPropagation(); onOpenCustomer(customer.id); }} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Abrir ${customer.name}`}>
                  <Pill color={customer.archived ? MUTED : HEALTH[customer.health].color}>{customer.name}</Pill>
                </button>
              </td>
              <td className={cn(cell, "hidden max-w-60 lg:table-cell")}>
                <span className="flex items-center gap-1.5 text-muted-foreground"><ChannelIcon channel={person.channel} /><span className="truncate">{person.email ?? person.phone}</span></span>
              </td>
              <td className={cn(cell, "pr-2")}>
                <div className="flex items-center justify-end gap-0.5">
                  {canAct ? <>
                    <RowButton icon={ChannelButton} label={`${person.channel === "phone" ? "Llamar a" : "Escribir a"} ${person.name}`} onClick={() => onAction("message", customer, person)} />
                    <RowButton icon={Plus} label={`Nueva tarea con ${person.name}`} onClick={() => onAction("task", customer, person)} />
                  </> : null}
                  <RowButton icon={ArrowRight} label={`Abrir ${person.name}`} onClick={() => onOpenPerson(person.id, customer.id)} />
                </div>
              </td>
            </tr>
          );
        })}
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
