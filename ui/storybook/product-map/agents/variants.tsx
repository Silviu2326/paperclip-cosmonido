import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, GripVertical, Move, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Pill } from "../parts";
import { AgentAvatar, AgentPanel, STATUS, euros, AutonomyBadge } from "./AgentsProposal";
import type { Autonomy, TeamAgent } from "./demo-data";
import { performanceOf } from "./performance";

function useAgents(initial: TeamAgent[]) {
  const [agents, setAgents] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const update = (id: string, patch: Partial<TeamAgent>) => setAgents((current) => current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)));
  return { agents, setAgents, selectedId, setSelectedId, update };
}

function PanelFor({ agent, update, onClose }: { agent: TeamAgent; update: (id: string, patch: Partial<TeamAgent>) => void; onClose: () => void }) {
  return (
    <AgentPanel
      agent={agent}
      onClose={onClose}
      onAutonomy={(level: Autonomy) => update(agent.id, { autonomy: level })}
      onTogglePause={() => update(agent.id, agent.status === "paused" ? { status: "idle", pausedBy: undefined } : { status: "paused", pausedBy: "user", task: null, progress: 0 })}
      onRetry={agent.problem ? () => update(agent.id, { status: "running", problem: undefined, task: "Reenviando la tarea…", progress: 15 }) : undefined}
      onRaiseBudget={agent.pausedBy === "budget" ? () => update(agent.id, { budgetCents: agent.budgetCents + 2000, status: "idle", pausedBy: undefined }) : undefined}
    />
  );
}

const descendantsOf = (agents: TeamAgent[], id: string): Set<string> => {
  const found = new Set<string>();
  const walk = (parent: string) => agents.filter((agent) => agent.reportsTo === parent).forEach((child) => { found.add(child.id); walk(child.id); });
  walk(id);
  return found;
};

/**
 * Variant B — the org chart is the page. Focus on structure: who reports to
 * whom, with each card showing live status and load. Drag a card onto another
 * to change its manager; the select in the bar does the same without a mouse.
 */
export function AgentsOrgBoard({ agents: initial }: { agents: TeamAgent[] }) {
  const tokens = useMotionTokens();
  const { agents, setAgents, selectedId, setSelectedId, update } = useAgents(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | "root" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const blocked = dragId ? new Set([dragId, ...descendantsOf(agents, dragId)]) : new Set<string>();

  function move(id: string, managerId: string | null) {
    const agent = agents.find((item) => item.id === id);
    if (!agent || agent.reportsTo === managerId) return;
    if (managerId && (managerId === id || descendantsOf(agents, id).has(managerId))) return;
    setAgents((current) => current.map((item) => (item.id === id ? { ...item, reportsTo: managerId } : item)));
    const manager = managerId ? agents.find((item) => item.id === managerId)?.name : "ti";
    setToast(`${agent.name} ahora reporta a ${manager}`);
    window.setTimeout(() => setToast(null), 3200);
  }

  // A plain function, not a component: a component declared here would remount on every render and cancel the drag.
  function renderNode(agent: TeamAgent): ReactNode {
    const children = agents.filter((candidate) => candidate.reportsTo === agent.id);
    const status = STATUS[agent.status];
    const isOver = overId === agent.id && !blocked.has(agent.id);
    const budgetPercent = Math.round((agent.spentCents / Math.max(agent.budgetCents, 1)) * 100);
    return (
      <li key={agent.id} className={cn("relative flex min-w-0 flex-col items-center gap-3", agent.reportsTo ? "md:before:absolute md:before:-top-3 md:before:left-1/2 md:before:h-3 md:before:w-px md:before:bg-border" : "")}>
        <motion.button
          layout
          draggable
          onDragStart={(event) => { setDragId(agent.id); (event as unknown as DragEvent).dataTransfer?.setData("text/plain", agent.id); }}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          onDragOver={(event) => { if (dragId && !blocked.has(agent.id)) { event.preventDefault(); setOverId(agent.id); } }}
          onDrop={(event) => { event.preventDefault(); if (dragId) move(dragId, agent.id); setDragId(null); setOverId(null); }}
          onClick={() => setSelectedId(agent.id === selectedId ? null : agent.id)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: dragId === agent.id ? 0.45 : 1, y: 0, scale: isOver ? 1.04 : 1 }}
          transition={{ duration: tokens.base, ease: tokens.easeOut }}
          className="group flex w-48 min-w-0 cursor-grab flex-col gap-2 rounded-2xl border bg-background p-3 text-left shadow-sm active:cursor-grabbing"
          style={{ borderColor: isOver ? ACCENT.turquoise : "var(--border)", boxShadow: selectedId === agent.id ? `0 0 0 2px ${status.color}` : isOver ? `0 0 0 3px ${tint(ACCENT.turquoise, 50)}` : undefined }}
          aria-label={`${agent.name}, ${agent.role}`}
        >
          <span className="flex items-center gap-2">
            <AgentAvatar agent={agent} size="sm" live />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{agent.name}</span><span className="block truncate text-xs text-muted-foreground">{agent.role}</span></span>
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" aria-hidden="true" />
          </span>
          <span className="flex items-center justify-between gap-1 text-xs"><span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tint(status.color, 18), color: readable(status.color) }}>{status.label}</span><span className="whitespace-nowrap tabular-nums text-muted-foreground">{agent.openTasks} abiertas</span></span>
          <span className="block h-1 w-full overflow-hidden rounded-full" title={`Presupuesto del mes usado: ${budgetPercent} %`} style={{ background: tint(ACCENT.lilac, 18) }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, budgetPercent)}%`, background: budgetPercent > 85 ? ACCENT.yellow : ACCENT.lilac }} /></span>
        </motion.button>
        {children.length ? (
          <ul className="relative flex min-w-0 flex-col gap-3 border-l border-border pl-4 md:flex-row md:items-start md:gap-4 md:border-l-0 md:border-t md:pl-0 md:pt-3 md:before:absolute md:before:-top-3 md:before:left-1/2 md:before:h-3 md:before:w-px md:before:bg-border">
            {children.map((child) => renderNode(child))}
          </ul>
        ) : null}
      </li>
    );
  }

  const roots = agents.filter((agent) => !agent.reportsTo);
  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Equipo</h1><p className="text-sm text-muted-foreground">Arrastra un agente sobre otro para cambiar quién lo dirige</p></div>
        <Button><Users className="h-4 w-4" />Contratar agente</Button>
      </header>
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
          <Move className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="org-manager" className="font-medium">{selected.name} reporta a</label>
          <select id="org-manager" value={selected.reportsTo ?? ""} onChange={(event) => move(selected.id, event.target.value || null)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Silviu (tú)</option>
            {agents.filter((agent) => !descendantsOf(agents, selected.id).has(agent.id) && agent.id !== selected.id).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </div>
      ) : null}
      <div className={cn("grid min-w-0 gap-6", selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-border p-6">
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4">
            <div
              onDragOver={(event) => { if (dragId) { event.preventDefault(); setOverId("root"); } }}
              onDrop={(event) => { event.preventDefault(); if (dragId) move(dragId, null); setDragId(null); setOverId(null); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-transform duration-(--motion-duration-fast)"
              style={{ background: `linear-gradient(135deg, ${ACCENT.turquoise}, ${ACCENT.sky})`, color: ink(ACCENT.sky), transform: overId === "root" ? "scale(1.06)" : undefined }}
            >
              <Users className="h-4 w-4" />Silviu · tú
            </div>
            <ul className="relative flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:gap-6">
              {roots.map((agent) => renderNode(agent))}
            </ul>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {selected ? <div key={selected.id} className="min-w-0 lg:sticky lg:top-4 lg:self-start"><PanelFor agent={selected} update={update} onClose={() => setSelectedId(null)} /></div> : null}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {toast ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />{toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type SortKey = "name" | "tasksDone" | "avgMinutes" | "successRate" | "costPerTaskCents" | "spent";

function Spark({ values, color }: { values: number[]; color: string }) {
  const tokens = useMotionTokens();
  const max = Math.max(...values, 1);
  return (
    <span className="flex h-6 items-end gap-0.5" aria-hidden="true">
      {values.map((value, index) => (
        <motion.span key={index} className="w-1 rounded-t-sm" style={{ background: color }} initial={{ height: 0 }} animate={{ height: `${Math.max(8, (value / max) * 100)}%` }} transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: index * tokens.stagger * 0.3 }} />
      ))}
    </span>
  );
}

/**
 * Variant C — performance table. Focus on comparing: tasks done, time per
 * task, success rate and cost per task for each agent, sortable, with the best
 * and worst value of each column highlighted.
 */
export function AgentsPerformanceTable({ agents: initial }: { agents: TeamAgent[] }) {
  const { agents, selectedId, setSelectedId, update } = useAgents(initial);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "tasksDone", dir: "desc" });
  const rows = useMemo(() => agents.map((agent) => ({ agent, perf: performanceOf(agent) })), [agents]);
  const value = (row: (typeof rows)[number], key: SortKey) => key === "name" ? row.agent.name : key === "spent" ? row.agent.spentCents : row.perf[key];
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const left = value(a, sort.key), right = value(b, sort.key);
    const order = typeof left === "string" ? left.localeCompare(String(right), "es") : Number(left) - Number(right);
    return sort.dir === "asc" ? order : -order;
  }), [rows, sort]);
  const best = (key: Exclude<SortKey, "name">, lowerIsBetter = false) => {
    const values = rows.map((row) => Number(value(row, key)));
    return { best: lowerIsBetter ? Math.min(...values) : Math.max(...values), worst: lowerIsBetter ? Math.max(...values) : Math.min(...values) };
  };
  const marks = { tasksDone: best("tasksDone"), avgMinutes: best("avgMinutes", true), successRate: best("successRate"), costPerTaskCents: best("costPerTaskCents", true) };
  const toggle = (key: SortKey) => setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const top = [...rows].sort((a, b) => b.perf.successRate - a.perf.successRate)[0];

  const Head = ({ k, children, align = "right" }: { k: SortKey; children: string; align?: "left" | "right" }) => {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}><button onClick={() => toggle(k)} className={cn("inline-flex items-center gap-1 text-xs uppercase tracking-wide transition-colors duration-(--motion-duration-fast)", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>{children}<Icon className="h-3 w-3" /></button></th>;
  };
  const cell = (current: number, mark: { best: number; worst: number }) => current === mark.best ? { color: readable(ACCENT.mint), fontWeight: 600 } : current === mark.worst && mark.best !== mark.worst ? { color: readable(ACCENT.yellow) } : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Equipo</h1><p className="text-sm text-muted-foreground">Rendimiento de los últimos 30 días</p></div>
        {top ? <Pill color={ACCENT.mint}><Trophy className="h-3 w-3" />Mejor acierto: {top.agent.name} · {top.perf.successRate} %</Pill> : null}
      </header>
      <div className={cn("grid min-w-0 gap-6", selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted/30"><tr>
              <Head k="name" align="left">Agente</Head><Head k="tasksDone">Tareas</Head><Head k="avgMinutes">Tiempo medio</Head><Head k="successRate">Acierto</Head><Head k="costPerTaskCents">Coste / tarea</Head><Head k="spent">Gasto</Head>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">14 días</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {sorted.map(({ agent, perf }) => {
                const status = STATUS[agent.status];
                return (
                  <motion.tr layout key={agent.id} onClick={() => setSelectedId(agent.id === selectedId ? null : agent.id)} className={cn("cursor-pointer transition-colors duration-(--motion-duration-fast) hover:bg-accent/40", agent.id === selectedId && "bg-accent/60")}>
                    <td className="px-3 py-2"><span className="flex min-w-0 items-center gap-2"><AgentAvatar agent={agent} size="sm" live /><span className="min-w-0"><span className="block truncate font-medium">{agent.name}</span><span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status.color }} />{agent.role}</span></span></span></td>
                    <td className="px-3 py-2 text-right tabular-nums" style={cell(perf.tasksDone, marks.tasksDone)}>{perf.tasksDone}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={cell(perf.avgMinutes, marks.avgMinutes)}>{perf.avgMinutes} min</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={cell(perf.successRate, marks.successRate)}>{perf.successRate} %</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={cell(perf.costPerTaskCents, marks.costPerTaskCents)}>{(perf.costPerTaskCents / 100).toFixed(2).replace(".", ",")} €</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euros(agent.spentCents)}<span className="text-xs text-muted-foreground"> / {euros(agent.budgetCents)}</span></td>
                    <td className="px-3 py-2"><Spark values={perf.trend} color={status.color} /></td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <AnimatePresence mode="wait">
          {selected ? <div key={selected.id} className="min-w-0 xl:sticky xl:top-4 xl:self-start"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><AutonomyBadge level={selected.autonomy} /></div><PanelFor agent={selected} update={update} onClose={() => setSelectedId(null)} /></div> : null}
        </AnimatePresence>
      </div>
      <p className="text-xs text-muted-foreground">Verde: mejor valor de la columna. Ámbar: el que más puede mejorar. Cada cifra sale de las tareas cerradas y aceptadas en 30 días.</p>
    </div>
  );
}
