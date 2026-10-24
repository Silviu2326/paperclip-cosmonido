import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, Archive, Plus, Search, Upload, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, readable, tint, useMotionTokens } from "../motion";
import { Avatar, CustomerPanel, HEALTH } from "./CustomersProposal";
import { euros, type DemoCustomer } from "./demo-data";
import { LoadMoreButton, useLoadMore } from "./scenario-parts";

const OWNERS = ["Tú", "Marta (agente de cuentas)", "Diego (agente comercial)"];
const HEALTH_ORDER: Record<DemoCustomer["health"], number> = { risk: 0, watch: 1, good: 2 };
const monthlyOf = (customer: DemoCustomer) => customer.services.filter((service) => service.status !== "paused").reduce((sum, service) => sum + service.monthlyCents, 0);

type SortKey = "name" | "health" | "monthly" | "tasks" | "proposals";
const SORTERS: Record<SortKey, (a: DemoCustomer, b: DemoCustomer) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, "es"),
  health: (a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health],
  monthly: (a, b) => monthlyOf(a) - monthlyOf(b),
  tasks: (a, b) => a.activeTasks - b.activeTasks,
  proposals: (a, b) => a.openProposals.length - b.openProposals.length,
};

function SortHeader({ label, sortKey, active, direction, onSort, align = "left" }: {
  label: string; sortKey: SortKey; active: boolean; direction: "asc" | "desc"; onSort: (key: SortKey) => void; align?: "left" | "right";
}) {
  const tokens = useMotionTokens();
  return (
    <th scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 rounded-md transition-colors duration-(--motion-duration-fast) hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
        {active ? (
          <motion.span key={direction} initial={{ y: direction === "asc" ? 4 : -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex">
            {direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </motion.span>
        ) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
      </button>
    </th>
  );
}

/** Variant B: a dense spreadsheet-style table. Sort by column, edit health and owner in place, act on many rows at once. */
export function CustomersTable({ customers, initialQuery = "", pageSize, canCreate = true }: {
  customers: DemoCustomer[];
  initialQuery?: string;
  pageSize?: number;
  canCreate?: boolean;
}) {
  const tokens = useMotionTokens();
  const [rows, setRows] = useState(customers);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "health", direction: "asc" });
  const [query, setQuery] = useState(initialQuery);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const active = rows.filter((customer) => !customer.archived);
  const needle = query.trim().toLowerCase();
  const sorted = useMemo(() => {
    const filtered = active.filter((customer) => !needle || `${customer.name} ${customer.domain ?? ""} ${customer.tags.join(" ")} ${customer.contacts.map((person) => person.name).join(" ")}`.toLowerCase().includes(needle));
    const ordered = [...filtered].sort(SORTERS[sort.key]);
    return sort.direction === "asc" ? ordered : ordered.reverse();
  }, [active, needle, sort]);
  const page = useLoadMore(sorted, pageSize);
  const opened = rows.find((customer) => customer.id === openId) ?? null;
  const monthly = active.reduce((sum, customer) => sum + monthlyOf(customer), 0);
  const allChecked = page.visible.length > 0 && page.visible.every((customer) => checked.has(customer.id));

  const update = (id: string, patch: Partial<DemoCustomer>) => setRows((current) => current.map((customer) => customer.id === id ? { ...customer, ...patch } : customer));
  const toggle = (id: string) => setChecked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const say = (text: string) => { setToast(text); window.setTimeout(() => setToast(null), 2500); };
  const sortBy = (key: SortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" || key === "health" ? "asc" : "desc" });

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{active.length} clientes · {euros(monthly)}/mes · {active.filter((customer) => customer.health !== "good").length} necesitan atención</p>
        </div>
        {canCreate ? (
          <div className="flex gap-2">
            <Button variant="outline"><Upload className="h-4 w-4" />Importar</Button>
            <Button><Plus className="h-4 w-4" />Nuevo cliente</Button>
          </div>
        ) : null}
      </header>

      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar por nombre, web, etiqueta o persona" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query ? <button aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><X className="h-4 w-4 text-muted-foreground" /></button> : null}
      </div>

      <div className={cn("grid min-w-0 gap-4", opened ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
        <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-200 text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs">
              <tr>
                <th scope="col" className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label="Seleccionar todos" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(page.visible.map((customer) => customer.id)))} />
                </th>
                <SortHeader label="Cliente" sortKey="name" active={sort.key === "name"} direction={sort.direction} onSort={sortBy} />
                <SortHeader label="Salud" sortKey="health" active={sort.key === "health"} direction={sort.direction} onSort={sortBy} />
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Responsable</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Contacto</th>
                <SortHeader label="€/mes" sortKey="monthly" active={sort.key === "monthly"} direction={sort.direction} onSort={sortBy} align="right" />
                <SortHeader label="Tareas" sortKey="tasks" active={sort.key === "tasks"} direction={sort.direction} onSort={sortBy} align="right" />
                <SortHeader label="Propuestas" sortKey="proposals" active={sort.key === "proposals"} direction={sort.direction} onSort={sortBy} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.visible.map((customer) => {
                const health = HEALTH[customer.health];
                const primary = customer.contacts.find((person) => person.primary) ?? customer.contacts[0];
                return (
                  <motion.tr
                    key={customer.id}
                    layout="position"
                    transition={{ duration: tokens.base, ease: tokens.easeOut }}
                    onClick={() => setOpenId(customer.id === openId ? null : customer.id)}
                    className={cn("cursor-pointer transition-colors duration-(--motion-duration-fast) hover:bg-accent/40", customer.id === openId && "bg-accent/60")}
                  >
                    <td className="px-3 py-1.5" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" aria-label={`Seleccionar ${customer.name}`} checked={checked.has(customer.id)} onChange={() => toggle(customer.id)} />
                    </td>
                    <td className="max-w-64 px-3 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={customer.name} size="sm" />
                        <div className="min-w-0"><p className="truncate font-medium">{customer.name}</p><p className="truncate text-xs text-muted-foreground">{customer.domain ?? customer.tags.join(" · ") ?? ""}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5" onClick={(event) => event.stopPropagation()}>
                      <label className="relative inline-flex items-center">
                        <span className="sr-only">Salud de {customer.name}</span>
                        <select
                          value={customer.health}
                          onChange={(event) => { update(customer.id, { health: event.target.value as DemoCustomer["health"] }); say(`${customer.name}: ahora «${HEALTH[event.target.value as DemoCustomer["health"]].label}»`); }}
                          className="cursor-pointer appearance-none rounded-full py-0.5 pl-2.5 pr-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ background: tint(health.color, 22), color: readable(health.color) }}
                        >
                          <option value="good">Bien</option><option value="watch">Vigilar</option><option value="risk">En riesgo</option>
                        </select>
                      </label>
                    </td>
                    <td className="px-3 py-1.5" onClick={(event) => event.stopPropagation()}>
                      <select
                        aria-label={`Responsable de ${customer.name}`}
                        value={customer.owner}
                        onChange={(event) => update(customer.id, { owner: event.target.value })}
                        className="max-w-40 cursor-pointer truncate rounded-md border border-transparent bg-transparent py-0.5 text-xs text-muted-foreground outline-none transition-colors duration-(--motion-duration-fast) hover:border-border focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {OWNERS.includes(customer.owner) ? null : <option>{customer.owner}</option>}
                        {OWNERS.map((owner) => <option key={owner}>{owner}</option>)}
                      </select>
                    </td>
                    <td className="max-w-44 truncate px-3 py-1.5 text-xs text-muted-foreground">{primary?.name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{monthlyOf(customer) ? euros(monthlyOf(customer)) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{customer.activeTasks}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{customer.openProposals.length || <span className="text-muted-foreground">—</span>}</td>
                  </motion.tr>
                );
              })}
              {sorted.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">Ningún cliente coincide con «{query}». <button className="underline" onClick={() => setQuery("")}>Limpiar búsqueda</button></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AnimatePresence>
          {opened ? (
            <motion.div key={opened.id} className="min-w-0 lg:sticky lg:top-4 lg:self-start" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}>
              <CustomerPanel customer={opened} onClose={() => setOpenId(null)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="clientes" />

      <AnimatePresence>
        {checked.size > 0 ? (
          <motion.div
            role="toolbar"
            aria-label="Acciones sobre la selección"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-40 flex max-w-full -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 shadow-lg"
          >
            <span className="text-sm font-medium tabular-nums">{checked.size} seleccionados</span>
            <label className="flex items-center gap-1.5 text-sm">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Asignar a</span>
              <select
                defaultValue=""
                onChange={(event) => { if (!event.target.value) return; checked.forEach((id) => update(id, { owner: event.target.value })); say(`Asignados a ${event.target.value}`); setChecked(new Set()); }}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="" disabled>Asignar a…</option>
                {OWNERS.map((owner) => <option key={owner}>{owner}</option>)}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={() => { checked.forEach((id) => update(id, { archived: true })); say(`${checked.size} clientes archivados`); setChecked(new Set()); }}><Archive className="h-3.5 w-3.5" />Archivar</Button>
            <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>Quitar selección</Button>
          </motion.div>
        ) : null}
        {toast ? (
          <motion.div role="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base }} className="fixed right-6 top-6 z-50 rounded-xl border border-border bg-background px-4 py-2 text-sm shadow-lg" style={{ boxShadow: `0 0 0 2px ${tint(BRAND(8), 60)}` }}>
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
