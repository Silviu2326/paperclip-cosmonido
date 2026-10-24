import { useContext, useMemo, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, CircleCheck, CircleHelp, Eye, Gavel, Lock, MessageSquare, Phone, Plus, Users, Video, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { LoadMoreButton, ScenarioBanner, useLoadMore } from "../customers/scenario-parts";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Progress } from "../parts";
import { HomeDataContext } from "./home-data";

type Kind = "decide" | "agenda" | "activity";
interface Row { id: string; kind: Kind; when: string; title: string; detail?: string; icon: LucideIcon; color: string; action?: string; urgent?: boolean }

const ACTIVITY_ICON = { done: CircleCheck, approved: CheckCircle2, question: CircleHelp, error: CircleAlert, view: Eye } as const;
const ACTIVITY_COLOR = { done: ACCENT.mint, approved: ACCENT.turquoise, question: ACCENT.sky, error: ACCENT.risk, view: ACCENT.lilac } as const;
const FILTERS: { id: "all" | Kind; label: string }[] = [{ id: "all", label: "Todo" }, { id: "decide", label: "Decidir" }, { id: "agenda", label: "Agenda" }, { id: "activity", label: "Actividad" }];

function BigNumber({ label, value, hint, color, children, onClick, index }: { label: string; value: string; hint?: string; color: string; children?: React.ReactNode; onClick?: () => void; index: number }) {
  const tokens = useMotionTokens();
  const Tag = onClick ? motion.button : motion.div;
  return (
    <Tag
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      className={cn("flex min-w-0 flex-col gap-1 rounded-2xl border border-border p-5 text-left", onClick && "transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      style={{ background: `linear-gradient(135deg, ${tint(color, 16)}, transparent 70%)` }}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-4xl font-semibold tabular-nums leading-tight">{value}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </Tag>
  );
}

/** Variant B: executive. Three big numbers and one list with everything that needs you today, nothing else. */
export function HomeExecutive() {
  const tokens = useMotionTokens();
  const data = useContext(HomeDataContext);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const { metrics, decisions, agenda, activity, agents } = data;
  const spend = (metrics.spendCents / metrics.budgetCents) * 100;

  const rows = useMemo<Row[]>(() => [
    ...decisions.slice(0, 20).map((decision): Row => ({ id: `d${decision.id}`, kind: "decide", when: decision.decideBy ? "hoy" : "pendiente", title: decision.title, detail: decision.whyNow, icon: Gavel, color: decision.severity === "critical" ? ACCENT.risk : ACCENT.yellow, action: "Decidir", urgent: decision.severity === "critical" })),
    ...agenda.map((event): Row => ({ id: `a${event.time}-${event.title.length}`, kind: "agenda", when: event.time, title: event.title, detail: event.with, icon: event.kind === "call" ? Phone : Video, color: ACCENT.sky, action: "Abrir" })),
    ...activity.map((item, index): Row => ({ id: `x${index}`, kind: "activity", when: item.when, title: `${item.who} ${item.what}`, icon: ACTIVITY_ICON[item.kind], color: ACTIVITY_COLOR[item.kind] })),
  ], [decisions, agenda, activity]);
  const shown = rows.filter((row) => filter === "all" || row.kind === filter);
  const page = useLoadMore(shown, data.pageSize ? 10 : undefined);
  const working = agents.filter((agent) => agent.status === "running").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Viernes, 24 de octubre</p>
          <h1 className="text-2xl font-semibold">Buenos días, Silviu</h1>
        </div>
        <Button style={{ background: `linear-gradient(135deg, ${ACCENT.turquoise}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><Plus className="h-4 w-4" />Nueva tarea</Button>
      </header>

      {data.banner ? <ScenarioBanner tone={data.banner.tone} action={<Button size="sm" variant="outline">{data.banner.action}</Button>}>{data.banner.text}</ScenarioBanner> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <BigNumber index={0} label="Te necesitan" value={String(decisions.length > 99 ? "99+" : decisions.length)} hint={decisions.length ? "decisiones pendientes" : "nada pendiente"} color={decisions.length ? ACCENT.yellow : ACCENT.mint} onClick={() => setFilter("decide")} />
        {data.canSeeMoney ? (
          <BigNumber index={1} label="Gasto del mes" value={euros(metrics.spendCents)} hint={spend >= 100 ? "presupuesto agotado" : `de ${euros(metrics.budgetCents)}`} color={spend >= 100 ? ACCENT.risk : ACCENT.lilac}>
            <Progress value={spend} color={spend >= 100 ? ACCENT.risk : spend > 85 ? ACCENT.yellow : ACCENT.lilac} />
          </BigNumber>
        ) : <BigNumber index={1} label="Gasto del mes" value="—" hint="solo administradores" color={ACCENT.muted}><Lock className="h-4 w-4 text-muted-foreground" /></BigNumber>}
        {data.canSeeMoney ? (
          <BigNumber index={2} label="Ingresos recurrentes" value={`${euros(metrics.recurringCents)}`} hint="al mes" color={ACCENT.turquoise} />
        ) : <BigNumber index={2} label="Ingresos recurrentes" value="—" hint="solo administradores" color={ACCENT.muted}><Lock className="h-4 w-4 text-muted-foreground" /></BigNumber>}
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" />Hoy</h2>
          <LayoutGroup id="exec-filter">
            <div className="flex gap-1">
              {FILTERS.map((item) => (
                <button key={item.id} onClick={() => setFilter(item.id)} className={cn("relative rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", filter === item.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
                  {filter === item.id ? <motion.span layoutId="exec-filter-pill" className="absolute inset-0 rounded-full" style={{ background: tint(ACCENT.turquoise, 28) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                  <span className="relative">{item.label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Todo tranquilo. Cuando haya algo que decidir, una reunión o novedades del equipo, aparecerá aquí.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {page.visible.map((row, index) => (
              <motion.li key={row.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }} className="flex min-w-0 items-center gap-3 px-4 py-3">
                <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-muted-foreground sm:w-28">{row.when}</span>
                <IconTile icon={row.icon} color={row.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  {row.detail ? <p className="truncate text-xs text-muted-foreground">{row.detail}</p> : null}
                </div>
                {row.action ? <Button size="sm" variant={row.urgent ? "default" : "outline"} className="shrink-0">{row.action}<ArrowRight className="h-3.5 w-3.5" /></Button> : null}
              </motion.li>
            ))}
          </ul>
        )}
        <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="elementos" />
      </section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" style={{ color: readable(ACCENT.turquoise) }} />{agents.length ? `${working} de ${agents.length} agentes trabajando ahora` : "Aún no tienes agentes"}<Button size="sm" variant="ghost"><MessageSquare className="h-3.5 w-3.5" />Hablar con el equipo</Button></p>
    </div>
  );
}
