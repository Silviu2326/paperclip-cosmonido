import { useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Gavel, MessageSquare, Pause, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { LoadMoreButton, ScenarioBanner, useLoadMore } from "../customers/scenario-parts";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, Pill, Progress } from "../parts";
import type { DemoAgent } from "./demo-data";
import { HomeDataContext } from "./home-data";
import { LiveDot, STATUS } from "./HomeProposal";

const hash = (text: string) => [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);

/** Seven deterministic bars per agent: its runs in the last week. */
function spark(name: string): number[] {
  const seed = hash(name);
  return Array.from({ length: 7 }, (_, index) => 2 + (((seed + index * 13) * (index + 5) * 31) % 9));
}

const RECENT = ["Terminó la tarea «Calendario de noviembre»", "Envió 3 entregables a revisión", "Respondió una conversación de un cliente"];

function Spark({ values, color }: { values: number[]; color: string }) {
  const tokens = useMotionTokens();
  const max = Math.max(...values);
  return (
    <div className="flex h-8 items-end gap-1" aria-label="Ejecuciones de los últimos 7 días">
      {values.map((value, index) => (
        <motion.span key={index} className="w-2 rounded-t-sm" style={{ background: color }} initial={{ height: 0 }} animate={{ height: `${(value / max) * 100}%` }} transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: index * tokens.stagger * 0.6 }} />
      ))}
    </div>
  );
}

function AgentCard({ agent, index, canSeeMoney }: { agent: DemoAgent; index: number; canSeeMoney: boolean }) {
  const tokens = useMotionTokens();
  const [paused, setPaused] = useState(agent.status === "paused");
  const [open, setOpen] = useState(false);
  const status = agent.status === "running" && paused ? STATUS.paused : agent.status === "paused" && !paused ? STATUS.running : STATUS[agent.status];
  const live = status === STATUS.running;
  const cost = 20 + (hash(agent.name) % 90) + (hash(agent.name) % 7) / 10;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-background p-4"
      style={live ? { background: `linear-gradient(135deg, ${tint(status.color, 10)}, transparent 60%)` } : undefined}
    >
      <div className="flex items-start gap-3">
        <Avatar name={agent.name} size="lg" ring={live ? status.color : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
          <div className="mt-1.5"><Pill color={status.color}>{live ? <LiveDot color={status.color} /> : null}{status.label}</Pill></div>
        </div>
        <Spark values={spark(agent.name)} color={status.color} />
      </div>
      <p className="min-h-10 break-words text-sm" style={{ color: agent.status === "error" ? readable(ACCENT.risk) : undefined }}>
        {agent.task ?? <span className="text-muted-foreground">Sin tareas ahora. Disponible para lo que necesites.</span>}
      </p>
      {live && agent.progress ? <Progress value={agent.progress} color={status.color} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{canSeeMoney ? `${euros(Math.round(cost * 100))} este mes` : "Coste oculto"}</span>
        <div className="flex gap-1.5">
          {agent.status === "error" ? <Button size="sm" variant="outline">Revisar</Button> : agent.status === "idle" ? <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Asignar tarea</Button> : (
            <Button size="sm" variant="outline" onClick={() => setPaused((value) => !value)}>{status === STATUS.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{status === STATUS.paused ? "Reanudar" : "Pausar"}</Button>
          )}
          <Button size="sm" variant="ghost"><MessageSquare className="h-3.5 w-3.5" />Hablar</Button>
        </div>
      </div>
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: tokens.fast }} className="flex"><ChevronDown className="h-3.5 w-3.5" /></motion.span>Últimas acciones
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-col gap-1 overflow-hidden text-xs text-muted-foreground">
            {RECENT.map((line) => <li key={line} className="break-words">· {line}</li>)}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

/** Variant C: the team is the protagonist. Big cards per agent with live status, trend and quick controls; what needs you sits in a strip on top. */
export function HomeTeam() {
  const data = useContext(HomeDataContext);
  const { agents, decisions, metrics } = data;
  const page = useLoadMore(agents, data.pageSize);
  const working = agents.filter((agent) => agent.status === "running").length;
  const spend = (metrics.spendCents / metrics.budgetCents) * 100;

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Viernes, 24 de octubre</p>
          <h1 className="text-2xl font-semibold">Tu equipo</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">{working ? <LiveDot color={ACCENT.mint} /> : null}{agents.length ? `${working} de ${agents.length} trabajando ahora` : "Todavía no hay agentes"}</p>
        </div>
        <div className="flex gap-2"><Button variant="outline"><MessageSquare className="h-4 w-4" />Hablar con el equipo</Button><Button><Plus className="h-4 w-4" />Contratar agente</Button></div>
      </header>

      {data.banner ? <ScenarioBanner tone={data.banner.tone} action={<Button size="sm" variant="outline">{data.banner.action}</Button>}>{data.banner.text}</ScenarioBanner> : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border px-4 py-3 text-sm" style={{ background: tint(decisions.length ? ACCENT.yellow : ACCENT.mint, 14) }}>
        <button className="flex items-center gap-2 font-medium"><Gavel className="h-4 w-4" style={{ color: readable(ACCENT.yellow) }} />{decisions.length ? `${decisions.length > 99 ? "99+" : decisions.length} decisiones te esperan` : "Nada pendiente"}</button>
        <span className="text-muted-foreground tabular-nums">{metrics.tasksOpen} tareas en curso · {metrics.doneThisWeek} hechas esta semana</span>
        {data.canSeeMoney ? <span className={cn("tabular-nums", spend >= 100 ? "font-medium" : "text-muted-foreground")} style={spend >= 100 ? { color: readable(ACCENT.risk) } : undefined}>{euros(metrics.spendCents)} de {euros(metrics.budgetCents)}</span> : null}
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-lg font-semibold">Aquí verás a tu equipo trabajar</p>
          <p className="max-w-sm text-sm text-muted-foreground">Contrata un agente, dale un rol y míralo avanzar en directo.</p>
          <Button style={{ background: `linear-gradient(135deg, ${ACCENT.turquoise}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><Plus className="h-4 w-4" />Contratar el primero</Button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {page.visible.map((agent, index) => <AgentCard key={agent.name} agent={agent} index={index} canSeeMoney={data.canSeeMoney} />)}
        </div>
      )}
      <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="agentes" />
    </div>
  );
}
