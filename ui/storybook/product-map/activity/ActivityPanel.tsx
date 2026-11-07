import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, ArrowRight, CheckCircle2, CircleDollarSign, Gauge, GanttChart, History, Play, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, Progress, SectionTitle } from "../parts";
import { DEMO_AGENT_COSTS, DEMO_SPEND_DAILY } from "./demo-data";
import type { ActivityData } from "./scenarios";
import { Bars, Budgets, Costs, Feed, Runs, Timeline, money, type Tab } from "./sections";

/**
 * Variant B — control panel. Answers "is everything fine?" in one screen:
 * figures with a trend, what needs attention, who is working and what it
 * costs. The long lists (activity, runs, timeline…) stay closed until asked for.
 */

function Spark({ values, color }: { values: number[]; color: string }) {
  const tokens = useMotionTokens();
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden="true">
      {values.map((value, index) => (
        <motion.span
          key={index}
          className="min-w-0 flex-1 rounded-t-sm"
          style={{ background: tint(color, index === values.length - 1 ? 90 : 45) }}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max((value / max) * 100, 6)}%` }}
          transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: index * tokens.stagger * 0.3 }}
        />
      ))}
    </div>
  );
}

function Kpi({ label, value, hint, color, icon: Icon, children, index }: { label: string; value: string; hint: string; color: string; icon: typeof Wallet; children?: React.ReactNode; index: number }) {
  const tokens = useMotionTokens();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }} className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-border p-4" style={{ background: `linear-gradient(135deg, ${tint(color, 14)}, transparent 70%)` }}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><IconTile icon={Icon} color={color} size="sm" />{label}</div>
      <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
      {children}
      <p className="break-words text-xs text-muted-foreground">{hint}</p>
    </motion.div>
  );
}

interface Attention { id: string; tone: "risk" | "warn"; title: string; text: string; action: string; target: Tab }

function attentionItems(data: ActivityData): Attention[] {
  const items: Attention[] = [];
  const failed = data.runs.filter((run) => run.status === "failed");
  if (data.failureBurst) items.push({ id: "burst", tone: "risk", title: `${data.failureBurst.count} fallos desde las ${data.failureBurst.since}`, text: data.failureBurst.causes[0]!.label, action: "Ver por causa", target: "runs" });
  else if (failed.length) items.push({ id: "failed", tone: "risk", title: `${failed.length} ${failed.length === 1 ? "ejecución fallida" : "ejecuciones fallidas"}`, text: failed[0]!.error ?? "Revisa el detalle.", action: "Ver ejecuciones", target: "runs" });
  for (const budget of data.budgets) {
    const percent = (budget.spentCents / budget.limitCents) * 100;
    if (percent >= 85) items.push({ id: budget.id, tone: percent >= 95 ? "risk" : "warn", title: `${budget.name.split(/ \(|—/)[0]} al ${Math.round(percent)} %`, text: budget.note ?? (budget.hardStop ? "Se pausará al llegar al 100 %." : "Solo avisa."), action: "Ver presupuestos", target: "budgets" });
  }
  if (data.pausedAgents.length) items.unshift({ id: "paused", tone: "risk", title: `${data.pausedAgents.join(", ")} en pausa`, text: "El presupuesto se agotó. Suben el límite o esperan a la renovación.", action: "Subir presupuesto", target: "budgets" });
  return items.slice(0, 5);
}

const DETAIL: { id: Tab; label: string; icon: typeof Play }[] = [
  { id: "activity", label: "Actividad", icon: History },
  { id: "runs", label: "Ejecuciones", icon: Play },
  { id: "costs", label: "Costes", icon: CircleDollarSign },
  { id: "budgets", label: "Presupuestos", icon: Gauge },
  { id: "timeline", label: "Cronología", icon: GanttChart },
];

export function ActivityPanel({ data, requested = null }: { data: ActivityData; requested?: { tab: Tab; n: number } | null }) {
  const tokens = useMotionTokens();
  const [detail, setDetail] = useState<Tab | null>(null);
  useEffect(() => { if (requested) setDetail(requested.tab); }, [requested]);
  const company = data.budgets[0]!;
  const spentPercent = (company.spentCents / company.limitCents) * 100;
  const forecast = Math.round((company.spentCents / 24) * 31);
  const running = data.runs.filter((run) => run.status === "running");
  const queued = data.runs.filter((run) => run.status === "queued" || run.status === "paused");
  const done = data.runs.filter((run) => run.status === "done").length;
  const failed = data.runs.filter((run) => run.status === "failed").length;
  const success = done + failed ? Math.round((done / (done + failed)) * 100) : 100;
  const attention = attentionItems(data);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi index={0} label="Gasto del mes" value={euros(company.spentCents)} color={spentPercent >= 95 ? ACCENT.risk : ACCENT.lilac} icon={Wallet} hint={spentPercent >= 100 ? `Límite de ${euros(company.limitCents)} alcanzado` : `Al ritmo actual: ${euros(forecast)} a fin de mes (límite ${euros(company.limitCents)})`}>
          <Progress value={spentPercent} color={spentPercent >= 95 ? ACCENT.risk : ACCENT.lilac} />
        </Kpi>
        <Kpi index={1} label="Gasto por día · 30 días" value={money(DEMO_SPEND_DAILY[DEMO_SPEND_DAILY.length - 1]!)} color={ACCENT.yellow} icon={CircleDollarSign} hint="Hoy, frente a la media de 5,10 €"><Spark values={DEMO_SPEND_DAILY} color={ACCENT.yellow} /></Kpi>
        <Kpi index={2} label="Tasa de éxito" value={`${success} %`} color={success >= 95 ? ACCENT.mint : ACCENT.yellow} icon={CheckCircle2} hint={`${done} terminadas · ${failed} fallidas · ${running.length} en curso`}>
          <div className="flex h-2 overflow-hidden rounded-full" style={{ background: tint(ACCENT.muted, 18) }}>
            <span style={{ width: `${success}%`, background: ACCENT.mint }} /><span style={{ width: `${100 - success}%`, background: ACCENT.risk }} />
          </div>
        </Kpi>
        <Kpi index={3} label="Trabajando ahora" value={String(running.length)} color={ACCENT.turquoise} icon={Activity} hint={queued.length ? `${queued.length} en cola o pausadas` : "Nada en cola"} />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle color={ACCENT.yellow} icon={TriangleAlert}>Necesita atención</SectionTitle>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />Todo en orden: sin fallos ni presupuestos al límite.</p>
          ) : attention.map((item, index) => (
            <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }} className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3" style={{ background: tint(item.tone === "risk" ? ACCENT.risk : ACCENT.yellow, 10) }}>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: item.tone === "risk" ? ACCENT.risk : ACCENT.yellow }} />
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.title}</p><p className="break-words text-xs text-muted-foreground">{item.text}</p></div>
              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setDetail(item.target)}>{item.action}<ArrowRight className="h-3.5 w-3.5" /></Button>
            </motion.div>
          ))}
        </Panel>

        <Panel>
          <SectionTitle color={ACCENT.turquoise} icon={Activity}>En curso ahora</SectionTitle>
          {[...running, ...queued].slice(0, 5).map((run) => (
            <div key={run.id} className="flex min-w-0 items-center gap-3">
              <Avatar name={run.agent} size="sm" ring={run.status === "running" ? ACCENT.mint : undefined} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={run.title}>{run.title}</p><p className="truncate text-xs text-muted-foreground">{run.agent} · {run.startedAt}</p></div>
              <Pill color={run.status === "running" ? ACCENT.mint : run.status === "paused" ? ACCENT.yellow : ACCENT.muted}>{run.status === "running" ? "En curso" : run.status === "paused" ? "Pausada" : "En cola"}</Pill>
            </div>
          ))}
          {running.length + queued.length === 0 ? <p className="text-sm text-muted-foreground">Tu equipo no tiene nada en marcha.</p> : null}
        </Panel>
      </div>

      <Panel>
        <SectionTitle color={ACCENT.sky} icon={CircleDollarSign}>Coste por agente este mes</SectionTitle>
        <Bars rows={DEMO_AGENT_COSTS.map((row) => ({ label: row.agent, sub: `de ${euros(row.budgetCents)}`, value: row.cents }))} color={ACCENT.sky} valueLabel={money} />
      </Panel>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold">Detalle bajo demanda</h2><p className="text-xs text-muted-foreground">Las listas largas no se cargan hasta que las abres.</p></div>
          <div role="group" aria-label="Detalle" className="flex flex-wrap gap-1.5">
            {DETAIL.map((item) => (
              <button key={item.id} aria-pressed={detail === item.id} onClick={() => setDetail(detail === item.id ? null : item.id)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", detail === item.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={detail === item.id ? { background: tint(ACCENT.turquoise, 30) } : undefined}>
                <item.icon className="h-3.5 w-3.5" />{item.label}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence initial={false} mode="wait">
          {detail ? (
            <motion.div key={detail} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="min-w-0 overflow-hidden">
              <div className="rounded-2xl border border-border p-3 sm:p-4">
                {detail === "activity" ? <Feed events={data.events} /> : detail === "runs" ? <Runs runs={data.runs} burst={data.failureBurst} /> : detail === "costs" ? <Costs /> : detail === "budgets" ? <Budgets budgets={data.budgets} /> : <Timeline pausedAgents={data.pausedAgents} />}
              </div>
            </motion.div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Elige arriba qué quieres ver al detalle.</p>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
