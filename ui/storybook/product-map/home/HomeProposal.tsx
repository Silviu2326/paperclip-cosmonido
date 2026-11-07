import { useContext, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Eye,
  Gavel,
  Lock,
  MessageSquare,
  Phone,
  Plus,
  Repeat,
  Sparkles,
  Target,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { LoadMoreButton, ScenarioBanner, useLoadMore } from "../customers/scenario-parts";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, Progress, SectionTitle, Stat } from "../parts";
import { LOWER_IS_BETTER, type DemoAgent, type OutcomePath } from "./demo-data";
import { HomeDataContext } from "./home-data";

export const STATUS: Record<DemoAgent["status"], { label: string; color: string }> = {
  running: { label: "Trabajando", color: ACCENT.mint },
  idle: { label: "Libre", color: ACCENT.muted },
  paused: { label: "En pausa", color: ACCENT.yellow },
  error: { label: "Con un problema", color: ACCENT.risk },
};

const ACTIVITY_ICON = {
  done: { icon: CircleCheck, color: ACCENT.mint },
  approved: { icon: CheckCircle2, color: ACCENT.turquoise },
  question: { icon: CircleHelp, color: ACCENT.sky },
  error: { icon: CircleAlert, color: ACCENT.risk },
  view: { icon: Eye, color: ACCENT.lilac },
} as const;

export function LiveDot({ color }: { color: string }) {
  const tokens = useMotionTokens();
  return (
    <span className="relative flex h-2 w-2">
      {tokens.base > 0 ? (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
      <span className="relative h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function NeedsYou() {
  const tokens = useMotionTokens();
  const { decisions } = useContext(HomeDataContext);
  const top = decisions.slice(0, 3);
  return (
    <Panel className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.yellow, 20)}, transparent 55%)` }} />
      <div className="relative flex min-w-0 flex-col gap-3">
        <SectionTitle color={ACCENT.yellow} icon={Gavel} action={<Button size="sm" variant="ghost">{decisions.length > 3 ? `Ver las ${decisions.length > 99 ? "99+" : decisions.length}` : "Ver todas"}<ArrowRight className="h-3.5 w-3.5" /></Button>}>
          Te necesitan
        </SectionTitle>
        {top.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />Nada pendiente: nadie espera una decisión tuya.</p>
        ) : null}
        {top.map((decision, index) => (
          <motion.button
            key={decision.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger }}
            className="group flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-background/70 p-3 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: decision.severity === "critical" ? ACCENT.risk : decision.severity === "high" ? ACCENT.yellow : ACCENT.sky }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{decision.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{decision.whyNow}</span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
          </motion.button>
        ))}
      </div>
    </Panel>
  );
}

function TeamNow() {
  const tokens = useMotionTokens();
  const { agents, pageSize } = useContext(HomeDataContext);
  const page = useLoadMore(agents, pageSize);
  const working = agents.filter((agent) => agent.status === "running").length;
  return (
    <Panel>
      <SectionTitle color={ACCENT.turquoise} icon={Users} action={<span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LiveDot color={ACCENT.mint} />{working} trabajando</span>}>
        Tu equipo ahora
      </SectionTitle>
      {agents.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p>Aún no tienes agentes. Contrata el primero para empezar a delegar.</p>
          <Button size="sm"><Plus className="h-3.5 w-3.5" />Contratar agente</Button>
        </div>
      ) : null}
      {page.visible.map((agent, index) => {
        const status = STATUS[agent.status];
        return (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + Math.min(index, 8) * tokens.stagger }}
            className="flex items-center gap-3"
          >
            <Avatar name={agent.name} size="sm" ring={agent.status === "running" ? status.color : undefined} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{agent.name}</span>
                <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">{agent.role}</span>
              </div>
              <p className="truncate text-xs" style={{ color: agent.status === "error" ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>
                {agent.task ?? "Sin tareas ahora"}
              </p>
              {agent.status === "running" ? <div className="mt-1"><Progress value={agent.progress} color={status.color} /></div> : null}
            </div>
            <span className="shrink-0"><Pill color={status.color}>{agent.status === "running" ? <LiveDot color={status.color} /> : null}{status.label}</Pill></span>
          </motion.div>
        );
      })}
      <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="agentes" />
    </Panel>
  );
}

function ActivityChart({ values }: { values: number[] }) {
  const tokens = useMotionTokens();
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-28 items-end gap-1.5" aria-label="Ejecuciones por día, últimos 14 días">
      {values.map((value, index) => (
        <div key={index} className="group relative flex h-full flex-1 items-end">
          <motion.div
            className="w-full rounded-t-md"
            style={{ background: `linear-gradient(180deg, ${ACCENT.turquoise}, ${tint(ACCENT.turquoise, 45)})` }}
            initial={{ height: 0 }}
            animate={{ height: `${(value / max) * 100}%` }}
            transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: index * tokens.stagger * 0.6 }}
          />
          <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 text-xs text-background opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Outcomes() {
  const tokens = useMotionTokens();
  const { outcomes, runActivity } = useContext(HomeDataContext);
  const [path, setPath] = useState<OutcomePath>("agency");
  const [days, setDays] = useState(30);
  const paths: { id: OutcomePath; label: string }[] = [
    { id: "entrepreneur", label: "Emprendedor" }, { id: "agency", label: "Agencia" }, { id: "commercial", label: "Comercial" },
  ];
  const format = (value: number, unit?: "h" | "€") => unit === "€" ? `${value.toFixed(2).replace(".", ",")} €` : unit === "h" ? `${value.toString().replace(".", ",")} h` : String(value);
  return (
    <Panel>
      <SectionTitle color={ACCENT.lilac} icon={Target}>Resultados del negocio</SectionTitle>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LayoutGroup id="outcome-path">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {paths.map((option) => (
              <button key={option.id} onClick={() => setPath(option.id)} className={cn("relative rounded-md px-2.5 py-1 text-xs transition-colors duration-(--motion-duration-fast)", path === option.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {path === option.id ? <motion.span layoutId="outcome-path-pill" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                <span className="relative">{option.label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
        <div className="flex gap-1">
          {[7, 30, 90].map((value) => (
            <button key={value} onClick={() => setDays(value)} className={cn("rounded-full border px-2 py-0.5 text-xs transition-colors duration-(--motion-duration-fast)", days === value ? "border-transparent font-medium" : "border-border text-muted-foreground")} style={days === value ? { background: tint(ACCENT.lilac, 30) } : undefined}>
              {value} días
            </button>
          ))}
        </div>
      </div>
      <motion.div key={`${path}-${days}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="grid gap-2 sm:grid-cols-2">
        {outcomes[path].length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2">Aún no hay datos para este camino. Cuando tu equipo cierre sus primeras tareas verás aquí cómo evoluciona.</p> : null}
        {outcomes[path].map((metric) => {
          const better = LOWER_IS_BETTER.has(metric.label) ? metric.current < metric.previous : metric.current > metric.previous;
          const same = metric.current === metric.previous;
          const change = metric.previous ? Math.round(((metric.current - metric.previous) / metric.previous) * 100) : 0;
          const color = same ? ACCENT.muted : better ? ACCENT.mint : ACCENT.risk;
          const Arrow = metric.current >= metric.previous ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={metric.label} className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold tabular-nums">{format(metric.current, metric.unit)}</span>
                {!same ? <Pill color={color}><Arrow className="h-3 w-3" />{Math.abs(change)} %</Pill> : <Pill color={color}>igual</Pill>}
              </div>
              <p className="text-xs text-muted-foreground">Antes: {format(metric.previous, metric.unit)}</p>
            </div>
          );
        })}
      </motion.div>
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5" />Ejecuciones de tu equipo · 14 días</p>
        <ActivityChart values={runActivity} />
      </div>
    </Panel>
  );
}

function Today() {
  const { agenda } = useContext(HomeDataContext);
  return (
    <Panel>
      <SectionTitle color={ACCENT.sky} icon={CalendarDays}>Hoy</SectionTitle>
      {agenda.length === 0 ? <p className="text-sm text-muted-foreground">Sin reuniones ni llamadas hoy.</p> : null}
      {agenda.map((event, index) => (
        <div key={`${event.time}-${index}`} className="flex min-w-0 items-center gap-3">
          <span className="w-12 shrink-0 text-sm font-semibold tabular-nums" style={{ color: readable(ACCENT.sky) }}>{event.time}</span>
          <IconTile icon={event.kind === "call" ? Phone : Video} color={ACCENT.sky} size="sm" />
          <div className="min-w-0"><p className="truncate text-sm font-medium">{event.title}</p><p className="truncate text-xs text-muted-foreground">{event.with}</p></div>
        </div>
      ))}
    </Panel>
  );
}

function CustomersToWatch() {
  const { watch, pageSize } = useContext(HomeDataContext);
  const page = useLoadMore(watch, pageSize ? 4 : undefined);
  return (
    <Panel>
      <SectionTitle color={ACCENT.yellow} icon={Users}>Clientes que vigilar</SectionTitle>
      {watch.length === 0 ? (
        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground"><p>Aún no hay clientes. Añade el primero para ver aquí a quién cuidar.</p><Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Nuevo cliente</Button></div>
      ) : null}
      {page.visible.map((customer) => (
        <div key={customer.id} className="flex min-w-0 items-center gap-3">
          <Avatar name={customer.name} size="sm" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{customer.name}</p><p className="truncate text-xs text-muted-foreground">{customer.nextAction}</p></div>
          <span className="shrink-0"><Pill color={customer.health === "risk" ? ACCENT.risk : ACCENT.yellow}>{customer.health === "risk" ? "En riesgo" : "Vigilar"}</Pill></span>
        </div>
      ))}
      <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="clientes" />
    </Panel>
  );
}

function RecentActivity() {
  const tokens = useMotionTokens();
  const { activity, pageSize } = useContext(HomeDataContext);
  const page = useLoadMore(activity, pageSize ? pageSize + 2 : undefined);
  return (
    <Panel>
      <SectionTitle color={ACCENT.mint} icon={MessageSquare}>Lo último</SectionTitle>
      {activity.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no ha pasado nada. Cuando tu equipo trabaje, lo verás aquí en directo.</p> : null}
      <ol className="relative flex flex-col gap-3 pl-1">
        <span aria-hidden="true" className="absolute bottom-2 left-3.5 top-2 w-px bg-border" />
        {page.visible.map((item, index) => {
          const style = ACTIVITY_ICON[item.kind];
          return (
            <motion.li key={index} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.15 + Math.min(index, 8) * tokens.stagger }} className="relative flex min-w-0 items-start gap-3">
              <span className="relative z-10 rounded-lg bg-background"><IconTile icon={style.icon} color={style.color} size="sm" /></span>
              <p className="min-w-0 break-words text-sm"><span className="font-medium">{item.who}</span> {item.what}<span className="block text-xs text-muted-foreground">{item.when}</span></p>
            </motion.li>
          );
        })}
      </ol>
      <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="eventos" />
    </Panel>
  );
}

function FirstSteps() {
  const tokens = useMotionTokens();
  const { onboarding } = useContext(HomeDataContext);
  const done = onboarding.filter((step) => step.done).length;
  const percent = (done / onboarding.length) * 100;
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border p-6" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.turquoise, 14)}, transparent 60%)` }}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" style={{ stroke: tint(ACCENT.turquoise, 25) }} />
            <motion.circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: ACCENT.turquoise }}
              initial={{ pathLength: 0 }} animate={{ pathLength: percent / 100 }} transition={{ duration: tokens.slow * 2, ease: tokens.easeOut }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{done}/{onboarding.length}</span>
        </div>
        <div><h2 className="text-lg font-semibold">Pon en marcha tu negocio</h2><p className="text-sm text-muted-foreground">Cuatro pasos y tu equipo empieza a trabajar por ti.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {onboarding.map((step, index) => (
          <motion.div key={step.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger }}
            className={cn("flex items-start gap-3 rounded-xl border p-4", step.done ? "border-transparent" : "border-border bg-background")}
            style={step.done ? { background: tint(ACCENT.mint, 16) } : undefined}>
            {step.done ? <IconTile icon={CheckCircle2} color={ACCENT.mint} /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">{index + 1}</span>}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.text}</p>
            </div>
            {!step.done ? <Button size="sm" variant="outline">Empezar</Button> : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Inicio: what needs you, what your team is doing now, how the business is going and what is next today. */
export function HomeProposal({ mode = "active" }: { mode?: "active" | "new" }) {
  const data = useContext(HomeDataContext);
  const { metrics, decisions } = data;
  const spendPercent = (metrics.spendCents / metrics.budgetCents) * 100;
  const weekChange = metrics.doneLastWeek ? Math.round(((metrics.doneThisWeek - metrics.doneLastWeek) / metrics.doneLastWeek) * 100) : null;
  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Viernes, 24 de octubre</p>
          <h1 className="text-2xl font-semibold">Buenos días, Silviu</h1>
          {mode === "active" ? (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" style={{ color: readable(ACCENT.turquoise) }} />
              {metrics.doneThisWeek ? <>Tu equipo cerró <strong className="text-foreground">{metrics.doneThisWeek} tareas</strong> esta semana y </> : "Tu equipo aún no ha cerrado tareas esta semana. "}
              {decisions.length ? <><strong className="text-foreground">{decisions.length > 99 ? "99+" : decisions.length} decisiones</strong> te esperan.</> : (metrics.doneThisWeek ? "no hay decisiones pendientes." : "No hay decisiones pendientes.")}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><MessageSquare className="h-4 w-4" />Hablar con el equipo</Button>
          <Button style={{ background: `linear-gradient(135deg, ${ACCENT.turquoise}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><Plus className="h-4 w-4" />Nueva tarea</Button>
        </div>
      </header>

      {data.banner && mode === "active" ? (
        <ScenarioBanner tone={data.banner.tone} action={<Button size="sm" variant="outline">{data.banner.action}</Button>}>{data.banner.text}</ScenarioBanner>
      ) : null}

      {mode === "new" ? <FirstSteps /> : <>
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <NeedsYou />
          <TeamNow />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat index={0} label="Tareas en curso" value={String(metrics.tasksOpen)} hint={`${metrics.tasksBlocked} bloqueadas`} color={ACCENT.sky} icon={BarChart3} />
          <Stat index={1} label="Hechas esta semana" value={String(metrics.doneThisWeek)} hint={weekChange === null ? "Aún sin semana anterior para comparar" : `${weekChange > 0 ? "+" : ""}${weekChange} % que la anterior`} color={ACCENT.mint} icon={CheckCircle2} />
          {data.canSeeMoney ? <>
            <Stat index={2} label="Gasto del mes" value={euros(metrics.spendCents)} hint={spendPercent >= 100 ? "Presupuesto agotado" : `de ${euros(metrics.budgetCents)} de presupuesto`} color={spendPercent >= 100 ? ACCENT.risk : ACCENT.lilac} icon={Wallet}>
              <div className="mt-1"><Progress value={spendPercent} color={spendPercent >= 100 ? ACCENT.risk : spendPercent > 85 ? ACCENT.yellow : ACCENT.lilac} /></div>
            </Stat>
            <Stat index={3} label="Ingresos recurrentes" value={`${euros(metrics.recurringCents)}/mes`} hint={metrics.recurringCents ? "De tus clientes con servicio" : "Cuando tus clientes contraten servicios"} color={ACCENT.turquoise} icon={Repeat} />
          </> : <>
            <Stat index={2} label="Gasto del mes" value="—" hint="Solo administradores y facturación" color={ACCENT.muted} icon={Lock} />
            <Stat index={3} label="Ingresos recurrentes" value="—" hint="Solo administradores y facturación" color={ACCENT.muted} icon={Lock} />
          </>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="flex min-w-0 flex-col gap-4">
            {data.canSeeResults ? <Outcomes /> : (
              <Panel>
                <SectionTitle color={ACCENT.muted} icon={Lock}>Resultados del negocio</SectionTitle>
                <p className="text-sm text-muted-foreground">Los resultados del negocio los ven los propietarios y administradores. Pídeles acceso si los necesitas.</p>
              </Panel>
            )}
            <RecentActivity />
          </div>
          <div className="flex flex-col gap-4">
            <Today />
            <CustomersToWatch />
          </div>
        </div>
      </>}
    </div>
  );
}
