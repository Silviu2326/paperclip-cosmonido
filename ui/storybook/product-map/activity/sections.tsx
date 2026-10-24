import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  GanttChart,
  History,
  MessageSquare,
  Play,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, Progress, SectionTitle } from "../parts";
import {
  AGENTS,
  DEMO_AGENT_COSTS,
  DEMO_CUSTOMER_COSTS,
  DEMO_SPEND_DAILY,
  DEMO_TIMELINE,
  NOW_HOUR,
  type ActivityKind,
  type DemoBudget,
  type DemoEvent,
  type DemoRun,
} from "./demo-data";
import type { FailureBurst } from "./scenarios";
import { ClipPill } from "./states";

/** Building blocks of the Actividad proposal, shared by the three design variants. */

export type Tab = "activity" | "runs" | "costs" | "budgets" | "timeline";

export const KIND: Record<ActivityKind, { label: string; icon: LucideIcon; color: string }> = {
  task: { label: "Tareas", icon: CheckCircle2, color: ACCENT.mint },
  approval: { label: "Aprobaciones", icon: ShieldCheck, color: ACCENT.turquoise },
  message: { label: "Mensajes", icon: MessageSquare, color: ACCENT.sky },
  cost: { label: "Costes", icon: CircleDollarSign, color: ACCENT.yellow },
  error: { label: "Errores", icon: AlertOctagon, color: ACCENT.risk },
  agent: { label: "Equipo", icon: Bot, color: ACCENT.lilac },
};

export const RUN_STATUS: Record<DemoRun["status"], { label: string; color: string }> = {
  running: { label: "En curso", color: ACCENT.mint },
  done: { label: "Terminada", color: ACCENT.sky },
  failed: { label: "Fallida", color: ACCENT.risk },
  queued: { label: "Programada", color: ACCENT.muted },
  paused: { label: "Pausada", color: ACCENT.yellow },
};

/** Small amounts keep their cents: 41 cents is "0,41 €", not "0 €". */
export const money = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents < 1000 ? 2 : 0, maximumFractionDigits: cents < 1000 ? 2 : 0 }).format(cents / 100);

export function duration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
}

export function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", active ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
      style={active ? { background: tint(color, 30) } : undefined}
    >
      {children}
    </button>
  );
}

export function TabBar({ tab, onChange, counts }: { tab: Tab; onChange: (tab: Tab) => void; counts: Partial<Record<Tab, number>> }) {
  const tokens = useMotionTokens();
  const items: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "activity", label: "Actividad", icon: History },
    { id: "runs", label: "Ejecuciones", icon: Play },
    { id: "costs", label: "Costes", icon: CircleDollarSign },
    { id: "budgets", label: "Presupuestos", icon: Gauge },
    { id: "timeline", label: "Cronología", icon: GanttChart },
  ];
  return (
    <LayoutGroup id="activity-tabs">
      <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
        {items.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn("relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {active ? <motion.span layoutId="activity-tab-pill" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
              <item.icon className="relative h-3.5 w-3.5" />
              <span className="relative">{item.label}</span>
              {counts[item.id] ? <span className="relative text-xs tabular-nums text-muted-foreground">{counts[item.id]}</span> : null}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export function Feed({ events }: { events: DemoEvent[] }) {
  const tokens = useMotionTokens();
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [agent, setAgent] = useState("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(40);
  const needle = query.trim().toLowerCase();
  const visible = events.filter((event) =>
    (kind === "all" || event.kind === kind)
    && (agent === "all" || event.actor === agent)
    && (!needle || `${event.actor} ${event.text} ${event.customer ?? ""}`.toLowerCase().includes(needle)));
  const limited = visible.slice(0, shown);
  const days = [...new Set(limited.map((event) => event.day))];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar en la actividad" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={kind === "all"} onClick={() => setKind("all")} color={ACCENT.muted}>Todo</Chip>
          {(Object.keys(KIND) as ActivityKind[]).map((key) => <Chip key={key} active={kind === key} onClick={() => setKind(key)} color={KIND[key].color}>{KIND[key].label}</Chip>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Quién:</span>
        <Chip active={agent === "all"} onClick={() => setAgent("all")} color={ACCENT.muted}>Todos</Chip>
        {[...AGENTS, "Tú"].map((name) => <Chip key={name} active={agent === name} onClick={() => setAgent(name)} color={ACCENT.turquoise}>{name}</Chip>)}
      </div>
      {visible.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nada coincide con los filtros.</p> : null}
      {days.map((day) => (
        <section key={day} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</h3>
          <ol className="relative flex flex-col gap-3 pl-1">
            <span aria-hidden="true" className="absolute bottom-3 left-4 top-3 w-px bg-border" />
            <AnimatePresence initial={false}>
              {limited.filter((event) => event.day === day).map((event, index) => {
                const style = KIND[event.kind];
                return (
                  <motion.li key={event.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }} className="relative flex items-start gap-3">
                    <span className="relative z-10 rounded-lg bg-background"><IconTile icon={style.icon} color={style.color} /></span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border p-3">
                      <p className="break-words text-sm"><span className="font-medium">{event.actor}</span> {event.text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{event.at}</span>
                        {event.customer ? <ClipPill color={ACCENT.mint}>{event.customer}</ClipPill> : null}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </section>
      ))}
      {visible.length > shown ? <Button variant="outline" className="self-center" onClick={() => setShown(shown + 40)}>Mostrar 40 más · quedan {visible.length - shown}</Button> : null}
    </div>
  );
}

export function Runs({ runs, burst = null }: { runs: DemoRun[]; burst?: FailureBurst | null }) {
  const [filter, setFilter] = useState<DemoRun["status"] | "all">("all");
  const [open, setOpen] = useState<string | null>(runs.find((run) => run.status === "failed" || run.status === "paused")?.id ?? null);
  const [shown, setShown] = useState(30);
  const [retried, setRetried] = useState<string[]>([]);
  const tokens = useMotionTokens();
  const visible = runs.filter((run) => filter === "all" || run.status === filter);
  const limited = visible.slice(0, shown);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {burst ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle color={ACCENT.risk} icon={TriangleAlert}>{burst.count} fallos desde las {burst.since}, por causa</SectionTitle>
            <Button size="sm" disabled={retried.length === burst.causes.length} onClick={() => setRetried(burst.causes.map((cause) => cause.label))}>Reintentar las {burst.count}</Button>
          </div>
          {burst.causes.map((cause) => (
            <div key={cause.label} className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
              <Pill color={ACCENT.risk} strong>{cause.count}</Pill>
              <span className="min-w-0 flex-1 basis-56 break-words">{cause.label}</span>
              {retried.includes(cause.label) ? <Pill color={ACCENT.mint}>Reintentando…</Pill> : <Button size="sm" variant="outline" onClick={() => setRetried([...retried, cause.label])}>{cause.fix}</Button>}
            </div>
          ))}
        </Panel>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} color={ACCENT.muted}>Todas · {runs.length}</Chip>
        {(Object.keys(RUN_STATUS) as DemoRun["status"][]).filter((status) => status !== "paused" || runs.some((run) => run.status === "paused")).map((status) => (
          <Chip key={status} active={filter === status} onClick={() => setFilter(status)} color={RUN_STATUS[status].color}>{RUN_STATUS[status].label} · {runs.filter((run) => run.status === status).length}</Chip>
        ))}
      </div>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {limited.map((run) => {
          const status = RUN_STATUS[run.status];
          const expanded = open === run.id;
          return (
            <div key={run.id}>
              <button onClick={() => setOpen(expanded ? null : run.id)} aria-expanded={expanded} className="flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/40">
                <Avatar name={run.agent} size="sm" ring={run.status === "running" ? status.color : undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={run.title}>{run.title}</p>
                  <p className="truncate text-xs text-muted-foreground" title={run.customer ?? undefined}>{run.agent} · {run.startedAt}{run.customer ? ` · ${run.customer}` : ""}</p>
                </div>
                <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{run.status === "running" ? "en curso" : duration(run.durationSec)}</span>
                <span className="hidden w-14 text-right text-xs tabular-nums sm:block">{run.costCents ? money(run.costCents) : "—"}</span>
                <Pill color={status.color}>{status.label}</Pill>
              </button>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                    <div className="m-3 mt-0 rounded-xl p-3 text-sm" style={{ background: tint(run.status === "failed" ? ACCENT.risk : status.color, 12) }}>
                      {run.error ? <p className="flex min-w-0 items-start gap-2 break-words"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(run.status === "paused" ? ACCENT.yellow : ACCENT.risk) }} />{run.error}</p> : <p className="text-muted-foreground">Duración {duration(run.durationSec)} · coste {run.costCents ? money(run.costCents) : "—"}.</p>}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      {visible.length > shown ? <Button variant="outline" className="self-center" onClick={() => setShown(shown + 30)}>Mostrar 30 más · quedan {visible.length - shown}</Button> : null}
    </div>
  );
}

export function Bars({ rows, color, valueLabel }: { rows: { label: string; value: number; sub?: string }[]; color: string; valueLabel: (value: number) => string }) {
  const tokens = useMotionTokens();
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <div key={row.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{row.label}{row.sub ? <span className="ml-2 text-xs font-normal text-muted-foreground">{row.sub}</span> : null}</span>
            <span className="tabular-nums">{valueLabel(row.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: tint(color, 14) }}>
            <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${color}, ${tint(color, 60)})` }} initial={{ width: 0 }} animate={{ width: `${(row.value / max) * 100}%` }} transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: index * tokens.stagger }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Costs() {
  const tokens = useMotionTokens();
  const [by, setBy] = useState<"agent" | "customer">("agent");
  const total = DEMO_AGENT_COSTS.reduce((sum, row) => sum + row.cents, 0);
  const max = Math.max(...DEMO_SPEND_DAILY);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel>
        <SectionTitle color={ACCENT.yellow} icon={CircleDollarSign}>Gasto diario · octubre</SectionTitle>
        <div className="flex h-24 items-end gap-1" aria-label="Gasto por día">
          {DEMO_SPEND_DAILY.map((value, index) => (
            <div key={index} className="group relative flex h-full min-w-0 flex-1 items-end">
              <motion.div className="w-full rounded-t-sm" style={{ background: `linear-gradient(180deg, ${ACCENT.yellow}, ${tint(ACCENT.yellow, 40)})` }} initial={{ height: 0 }} animate={{ height: `${(value / max) * 100}%` }} transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: index * tokens.stagger * 0.4 }} />
              <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 text-xs text-background opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100">{euros(value)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle color={ACCENT.sky} icon={by === "agent" ? Bot : Users}>Coste por {by === "agent" ? "agente" : "cliente"}</SectionTitle>
          <div className="flex gap-1.5"><Chip active={by === "agent"} onClick={() => setBy("agent")} color={ACCENT.sky}>Agente</Chip><Chip active={by === "customer"} onClick={() => setBy("customer")} color={ACCENT.sky}>Cliente</Chip></div>
        </div>
        {by === "agent" ? (
          <Bars rows={DEMO_AGENT_COSTS.map((row) => ({ label: row.agent, sub: row.role, value: row.cents }))} color={ACCENT.sky} valueLabel={euros} />
        ) : (
          <>
            <Bars rows={DEMO_CUSTOMER_COSTS.map((row) => ({ label: row.customer, value: row.cents, sub: row.revenueCents ? `factura ${euros(row.revenueCents)}/mes` : "sin servicio" }))} color={ACCENT.mint} valueLabel={euros} />
            <p className="text-xs text-muted-foreground">Coste atribuido directamente por proyecto o tarea. Excluye datos sin vínculo o precio; no es margen ni facturación.</p>
          </>
        )}
        <p className="border-t border-border pt-2 text-sm"><span className="text-muted-foreground">Total del mes: </span><span className="font-semibold tabular-nums">{euros(total)}</span></p>
      </Panel>
    </div>
  );
}

export function Budgets({ budgets }: { budgets: DemoBudget[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {budgets.map((budget, index) => {
        const percent = (budget.spentCents / budget.limitCents) * 100;
        const color = percent >= 95 ? ACCENT.risk : percent >= 85 ? ACCENT.yellow : ACCENT.mint;
        return (
          <motion.div key={budget.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="flex flex-col gap-2 rounded-2xl border border-border p-4" style={percent >= 85 ? { background: `linear-gradient(135deg, ${tint(color, 14)}, transparent 70%)` } : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Pill color={ACCENT.lilac}>{budget.scope}</Pill>
                <span className="truncate text-sm font-medium" title={budget.name}>{budget.name}</span>
              </div>
              <span className="text-sm tabular-nums"><strong>{euros(budget.spentCents)}</strong> <span className="text-muted-foreground">de {euros(budget.limitCents)}</span></span>
            </div>
            <Progress value={percent} color={color} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 break-words">{budget.hardStop ? (percent >= 100 ? "Pausado: se agotó el límite" : "Se pausa al llegar al 100 %") : percent >= 100 ? "Límite alcanzado, solo avisa" : "Solo avisa"}{budget.note ? ` · ${budget.note}` : ""}</span>
              {percent >= 85 ? <Pill color={color} strong={percent >= 95}><TriangleAlert className="h-3 w-3" />{Math.round(percent)} %</Pill> : <span className="tabular-nums">{Math.round(percent)} %</span>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** The timeline shows the first hours of the day, enough for what has happened so far. */
export const AXIS_END = 12;

export function Timeline({ pausedAgents = [] }: { pausedAgents?: string[] }) {
  const tokens = useMotionTokens();
  const hours = [0, 2, 4, 6, 8, 10, 12];
  const pct = (hour: number) => `${(hour / AXIS_END) * 100}%`;
  return (
    <Panel>
      <SectionTitle color={ACCENT.lilac} icon={GanttChart}>Hoy, hora a hora</SectionTitle>
      <div className="overflow-x-auto">
        <div className="relative min-w-xl">
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 text-xs text-muted-foreground">
            <span />
            <div className="relative h-5">{hours.map((hour) => <span key={hour} className={cn("absolute tabular-nums", hour === 0 ? "" : hour === AXIS_END ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: pct(hour) }}>{String(hour).padStart(2, "0")}h</span>)}</div>
          </div>
          {AGENTS.map((agent) => (
            <div key={agent} className="grid grid-cols-[5rem_1fr] items-center gap-x-3 border-t border-border/60 py-2">
              <span className="flex min-w-0 flex-col gap-0.5 text-sm"><span className="flex items-center gap-1.5"><Avatar name={agent} size="xs" />{agent}</span>{pausedAgents.includes(agent) ? <span className="text-xs" style={{ color: readable(ACCENT.yellow) }}>Pausado</span> : null}</span>
              <div className="relative h-7">
                {hours.map((hour) => <span key={hour} aria-hidden="true" className="absolute inset-y-0 w-px bg-border/40" style={{ left: pct(hour) }} />)}
                {DEMO_TIMELINE.filter((bar) => bar.agent === agent).map((bar, index) => {
                  const end = bar.endHour ?? NOW_HOUR;
                  const color = bar.status === "failed" ? ACCENT.risk : bar.status === "running" ? (pausedAgents.includes(agent) ? ACCENT.yellow : ACCENT.mint) : ACCENT.sky;
                  return (
                    <div key={bar.id}>
                      <motion.div title={bar.title} className="absolute top-1 h-5 rounded-md" style={{ left: pct(bar.startHour), width: `${Math.max(((end - bar.startHour) / AXIS_END) * 100, 1.2)}%`, background: tint(color, 45), boxShadow: `inset 0 0 0 1px ${color}`, originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }} />
                      <span className="absolute top-1 flex h-5 items-center whitespace-nowrap pl-1 text-xs" style={{ left: `calc(${pct(end)} + 0.25rem)`, color: readable(color) }}>{bar.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-5" style={{ left: `calc(5rem + 0.75rem + (100% - 5.75rem) * ${NOW_HOUR / AXIS_END})` }}>
            <span className="absolute inset-y-0 w-px" style={{ background: ACCENT.turquoise }} />
            <span className="absolute -top-1 -translate-x-1/2 rounded-full px-1.5 text-xs font-medium" style={{ background: ACCENT.turquoise, color: "var(--background)" }}>ahora</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {[["En curso", ACCENT.mint], ["Terminada", ACCENT.sky], ["Fallida", ACCENT.risk]].map(([label, color]) => <span key={label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>)}
      </div>
    </Panel>
  );
}

