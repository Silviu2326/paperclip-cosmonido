import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarX2, Clock, History, Play, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { euros } from "../customers/demo-data";
import { useMotionTokens } from "../motion";
import { ACCENT, IconTile, Progress, Stat } from "../parts";
import { ActivityAudit } from "./ActivityAudit";
import { ActivityPanel } from "./ActivityPanel";
import { buildActivityData, type ActivityData, type ActivityRange, type ActivityScenario, type ActivityVariant } from "./scenarios";
import { Budgets, Costs, Feed, Runs, TabBar, Timeline, type Tab } from "./sections";
import { ActivitySkeleton, AlertBanner, ExportBanner, LoadError, NoPermission, RangeBar } from "./states";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Variant A — tabs: Actividad, Ejecuciones, Costes, Presupuestos and Cronología in one page. */
function ActivityTabs({ data, tab, setTab }: { data: ActivityData; tab: Tab; setTab: (tab: Tab) => void }) {
  const tokens = useMotionTokens();
  const spent = data.budgets[0]!;
  const alerts = useMemo(() => data.budgets.filter((budget) => budget.spentCents / budget.limitCents >= 0.85), [data.budgets]);
  const failed = data.runs.filter((run) => run.status === "failed").length;
  const percent = (spent.spentCents / spent.limitCents) * 100;
  return (
    <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} label="Ejecuciones" value={String(data.runs.length)} hint={`${data.runs.filter((run) => run.status === "running").length} en curso · ${failed} ${failed === 1 ? "fallida" : "fallidas"}`} color={ACCENT.mint} icon={Play} />
        <Stat index={1} label="Gasto del mes" value={euros(spent.spentCents)} hint={`de ${euros(spent.limitCents)}`} color={percent >= 100 ? ACCENT.risk : ACCENT.lilac} icon={Wallet}><div className="mt-1"><Progress value={percent} color={percent >= 100 ? ACCENT.risk : ACCENT.lilac} /></div></Stat>
        <Stat index={2} label="Alertas de presupuesto" value={String(alerts.length)} hint={alerts.map((alert) => clip(alert.name.split(/ \(|—/)[0]!, 22)).join(" · ")} color={ACCENT.yellow} icon={TriangleAlert} />
        <Stat index={3} label="Tiempo medio por ejecución" value="12 min" hint="Últimas 7 ejecuciones" color={ACCENT.sky} icon={Clock} />
      </div>
      <TabBar tab={tab} onChange={setTab} counts={{ activity: data.events.length, runs: data.runs.length, budgets: alerts.length }} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="min-w-0">
          {tab === "activity" ? <Feed events={data.events} /> : tab === "runs" ? <Runs runs={data.runs} burst={data.failureBurst} /> : tab === "costs" ? <Costs /> : tab === "budgets" ? <Budgets budgets={data.budgets} /> : <Timeline pausedAgents={data.pausedAgents} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function NoDataInRange({ onWiden }: { onWiden: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
      <IconTile icon={CalendarX2} color={ACCENT.sky} />
      <h2 className="text-lg font-semibold">No hay actividad entre el 1 y el 7 de septiembre</h2>
      <p className="max-w-md text-sm text-muted-foreground">Tu empresa empezó a trabajar el 14 de septiembre, así que ese rango no tiene datos. Prueba con un periodo más amplio.</p>
      <div className="flex gap-2"><Button onClick={onWiden}>Ver los últimos 30 días</Button><Button variant="outline">Elegir otras fechas</Button></div>
    </div>
  );
}

function EmptyCompany() {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
      <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }}><IconTile icon={History} color={ACCENT.turquoise} /></motion.span>
      <h2 className="text-lg font-semibold">Aquí verás todo lo que pasa</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Cuando tus agentes empiecen a trabajar verás sus tareas, ejecuciones, costes y presupuestos en una sola línea de tiempo.</p>
    </div>
  );
}

const SUBTITLE: Record<ActivityScenario, string> = {
  normal: "Lo que ha hecho tu equipo, lo que ha costado y cómo va el presupuesto",
  empty: "Todavía no ha pasado nada",
  loading: "Cargando…",
  error: "No se pudo cargar",
  many: "12.660 eventos en el historial · se cargan por páginas",
  "long-text": "Lo que ha hecho tu equipo, lo que ha costado y cómo va el presupuesto",
  "no-permission": "Sin acceso",
  "budget-exhausted": "El presupuesto mensual se agotó: tu equipo está en pausa",
  "failure-spike": "Hay un pico de fallos: revisa las causas",
  "no-data-range": "Sin datos en el periodo elegido",
  exporting: "Lo que ha hecho tu equipo, lo que ha costado y cómo va el presupuesto",
};

/**
 * Actividad. `variant` picks one of three designs (a: tabs, b: control panel,
 * c: audit log) and `scenario` the situation it is shown in.
 */
export function ActivityProposal({ variant = "a", scenario = "normal" }: { variant?: ActivityVariant; scenario?: ActivityScenario }) {
  const data = useMemo(() => buildActivityData(scenario), [scenario]);
  const [tab, setTab] = useState<Tab>("activity");
  const [range, setRange] = useState<ActivityRange>(scenario === "no-data-range" ? "custom" : "7d");
  const [exportRun, setExportRun] = useState<number | null>(scenario === "exporting" ? 0 : null);
  const exporting = exportRun !== null;
  const blocked = scenario === "loading" || scenario === "error" || scenario === "no-permission";
  const noData = scenario === "no-data-range" && range === "custom";

  const topAgent = [...data.budgets].filter((budget) => budget.scope === "Agente").sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents)[0];
  const topPercent = topAgent ? Math.round((topAgent.spentCents / topAgent.limitCents) * 100) : 0;
  const [requested, setRequested] = useState<{ tab: Tab; n: number } | null>(null);
  const request = (next: Tab) => { setTab(next); setRequested({ tab: next, n: Date.now() }); };
  const canNavigate = variant !== "c";
  // The control panel already lists what needs attention, so it skips the banners.
  const showBanners = variant !== "b";
  const startExport = () => setExportRun((current) => (current ?? 0) + 1);

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Actividad</h1>
          <p className="text-sm text-muted-foreground">{SUBTITLE[scenario]}</p>
        </div>
        {!blocked && scenario !== "empty" ? <RangeBar range={range} onRange={setRange} exporting={exporting} onExport={startExport} /> : null}
      </header>

      {scenario === "loading" ? <ActivitySkeleton /> : scenario === "error" ? <LoadError /> : scenario === "no-permission" ? <NoPermission /> : scenario === "empty" ? <EmptyCompany /> : noData ? <NoDataInRange onWiden={() => setRange("30d")} /> : <>
        <AnimatePresence>
          {exportRun !== null ? <ExportBanner key={exportRun} initialProgress={scenario === "exporting" && exportRun === 0 ? 42 : 4} onClose={() => setExportRun(null)} rows={data.total} /> : null}
        </AnimatePresence>

        {!showBanners ? null : scenario === "budget-exhausted" ? (
          <AlertBanner tone="risk" action={canNavigate ? <div className="flex gap-2"><Button size="sm" onClick={() => request("budgets")}>Subir presupuesto</Button><Button size="sm" variant="outline" onClick={() => request("budgets")}>Ver presupuestos</Button></div> : undefined}>
            Se agotó el presupuesto de la empresa: <strong>Marta, Leo y Diego están en pausa</strong> y 4 publicaciones de noviembre no se programarán. Se renueva el 1 de noviembre.
          </AlertBanner>
        ) : scenario === "failure-spike" && data.failureBurst ? (
          <AlertBanner tone="risk" action={<div className="flex gap-2">{canNavigate ? <Button size="sm" onClick={() => request("runs")}>Ver por causa</Button> : null}<Button size="sm" variant="outline">Reconectar Email</Button></div>}>
            <strong>{data.failureBurst.count} ejecuciones han fallado desde las {data.failureBurst.since}</strong> (lo habitual son 1 o 2). {data.failureBurst.causes[0]!.count} son por credenciales de Email caducadas.
          </AlertBanner>
        ) : topAgent && topPercent >= 85 ? (
          <AlertBanner tone="warn" icon={TriangleAlert} action={canNavigate ? <button className="shrink-0 text-xs font-medium underline" onClick={() => request("budgets")}>Ver presupuestos</button> : undefined}>
            {topAgent.name.split(/ \(|—/)[0]} está al {topPercent} % de su presupuesto: se pausará al llegar al 100 %.
          </AlertBanner>
        ) : null}

        {variant === "a" ? <ActivityTabs data={data} tab={tab} setTab={setTab} /> : variant === "b" ? <ActivityPanel data={data} requested={requested} /> : <ActivityAudit data={data} exporting={exporting} onExport={startExport} />}
      </>}
    </div>
  );
}
