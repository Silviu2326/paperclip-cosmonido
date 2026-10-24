import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { AlarmClock, CalendarClock, Check, CheckCheck, FileText, Inbox, Phone, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { euros } from "../customers/demo-data";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Panel, Pill, Progress, SectionTitle } from "../parts";
import { LoadMore } from "../tasks/state-parts";
import { STAGES, type DemoProposal } from "./demo-data";
import { STAGE_COLOR, forecastOf, type useSalesData } from "./sales-parts";

const TODAY = new Date("2026-10-24T00:00:00Z").getTime();
const DAY = 86_400_000;

type ActionKind = "opportunity" | "lead" | "proposal";
interface Action {
  id: string;
  kind: ActionKind;
  title: string;
  who: string;
  amountCents: number | null;
  due: number;
  detail: string;
  urgent: boolean;
}

const KIND: Record<ActionKind, { icon: LucideIcon; color: string; label: string }> = {
  opportunity: { icon: Phone, color: ACCENT.sky, label: "Oportunidad" },
  lead: { icon: Inbox, color: ACCENT.yellow, label: "Lead" },
  proposal: { icon: FileText, color: ACCENT.lilac, label: "Propuesta" },
};

const GROUPS: { id: string; label: string; hint: string; color: string; match: (due: number) => boolean }[] = [
  { id: "today", label: "Hoy", hint: "Vencidas y de hoy", color: ACCENT.yellow, match: (due) => due <= TODAY },
  { id: "week", label: "Esta semana", hint: "Hasta el viernes que viene", color: ACCENT.sky, match: (due) => due > TODAY && due <= TODAY + 6 * DAY },
  { id: "later", label: "Más adelante", hint: "Sin prisa todavía", color: ACCENT.muted, match: (due) => due > TODAY + 6 * DAY },
];

function dueText(due: number) {
  const days = Math.round((due - TODAY) / DAY);
  if (days < 0) return { text: `Vencida hace ${-days} ${days === -1 ? "día" : "días"}`, urgent: true };
  if (days === 0) return { text: "Hoy", urgent: true };
  if (days === 1) return { text: "Mañana", urgent: false };
  return { text: new Date(due).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }), urgent: false };
}

const PAGE = 12;

/** Variant C: the sales page as a to-do list ordered by urgency. No stages, just what to do next. */
export function SalesToday({ sales, proposals, readOnly }: { sales: ReturnType<typeof useSalesData>; proposals: DemoProposal[]; readOnly: boolean }) {
  const tokens = useMotionTokens();
  const [done, setDone] = useState<string[]>([]);
  const [postponed, setPostponed] = useState<Record<string, number>>({});
  const [shown, setShown] = useState(PAGE);

  const actions = useMemo<Action[]>(() => {
    const fromOpportunities = sales.opportunities.filter((opportunity) => opportunity.stage !== "won" && opportunity.nextAction && opportunity.nextActionAt).map((opportunity): Action => ({
      id: `o-${opportunity.id}`, kind: "opportunity", title: opportunity.nextAction!, who: `${opportunity.customer} · ${opportunity.title}`, amountCents: opportunity.amountCents,
      due: new Date(opportunity.nextActionAt!).getTime(), detail: `${opportunity.probability} % de probabilidad`, urgent: opportunity.stalledDays >= 14,
    }));
    const fromLeads = sales.leads.map((lead): Action => ({
      id: `l-${lead.id}`, kind: "lead", title: `Responder a ${lead.name}`, who: lead.company ?? lead.message, amountCents: null,
      due: TODAY + (lead.priority === "high" ? 0 : lead.priority === "normal" ? DAY : 3 * DAY), detail: lead.priority === "high" ? "Prioridad alta" : lead.receivedLabel, urgent: lead.priority === "high",
    }));
    const fromProposals = proposals.filter((proposal) => proposal.status === "sent" && proposal.views === 0).map((proposal): Action => ({
      id: `p-${proposal.id}`, kind: "proposal", title: `Reclamar la propuesta «${proposal.title}»`, who: proposal.customer, amountCents: proposal.amountCents, due: TODAY, detail: proposal.note, urgent: true,
    }));
    return [...fromOpportunities, ...fromLeads, ...fromProposals].map((action) => ({ ...action, due: action.due + (postponed[action.id] ?? 0) * DAY }));
  }, [sales.opportunities, sales.leads, proposals, postponed]);

  const pending = actions.filter((action) => !done.includes(action.id)).sort((a, b) => a.due - b.due || Number(b.urgent) - Number(a.urgent) || (b.amountCents ?? 0) - (a.amountCents ?? 0));
  const completed = actions.filter((action) => done.includes(action.id));
  const todayPending = pending.filter((action) => action.due <= TODAY);
  const inPlay = todayPending.reduce((sum, action) => sum + (action.amountCents ?? 0), 0);
  const todayTotal = todayPending.length + completed.length;
  const { forecast, pipeline } = forecastOf(sales.opportunities);
  const counts = STAGES.map((stage) => ({ stage, items: sales.opportunities.filter((opportunity) => opportunity.stage === stage.key) }));
  const maxCount = Math.max(1, ...counts.map((entry) => entry.items.length));

  function finish(action: Action) {
    if (readOnly) return;
    setDone((current) => [...current, action.id]);
    sales.setToast(`Hecho: ${action.title}`);
  }
  function postpone(action: Action) {
    if (readOnly) return;
    setPostponed((current) => ({ ...current, [action.id]: (current[action.id] ?? 0) + 1 }));
    sales.setToast("Pospuesta un día");
  }
  let remaining = shown;

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border p-5" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.yellow, 20)}, transparent 60%)` }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Tu foco de hoy</p>
              <p className="text-2xl font-semibold">{todayPending.length ? `${todayPending.length} ${todayPending.length === 1 ? "acción" : "acciones"}` : "Todo hecho por hoy"}{inPlay ? <span className="ml-2 text-base font-normal text-muted-foreground">con {euros(inPlay)} en juego</span> : null}</p>
            </div>
            <div className="text-right text-sm tabular-nums text-muted-foreground">{completed.length} de {todayTotal} hechas</div>
          </div>
          <Progress value={todayTotal ? (completed.length / todayTotal) * 100 : 100} color={ACCENT.mint} />
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
            <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}><CheckCheck className="h-7 w-7" /></motion.span>
            <h2 className="text-lg font-semibold">Sin acciones pendientes</h2>
            <p className="max-w-sm text-sm text-muted-foreground">Cuando una oportunidad, un lead o una propuesta necesite algo tuyo, aparecerá aquí.</p>
          </div>
        ) : GROUPS.map((group) => {
          const items = pending.filter((action) => group.match(action.due));
          if (!items.length) return null;
          const take = items.slice(0, Math.max(0, remaining));
          remaining -= take.length;
          if (!take.length) return null;
          return (
            <section key={group.id} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-baseline gap-2"><span className="h-2 w-2 rounded-full" style={{ background: group.color }} /><h2 className="text-sm font-semibold">{group.label}</h2><span className="text-xs text-muted-foreground">{group.hint} · {items.length}</span></div>
              <AnimatePresence mode="popLayout" initial={false}>
                {take.map((action, index) => {
                  const kind = KIND[action.kind];
                  const due = dueText(action.due);
                  return (
                    <motion.article key={action.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 50 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-3">
                      <IconTile icon={kind.icon} color={kind.color} />
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="break-words text-sm font-medium leading-snug">{action.title}</p>
                        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="min-w-0 truncate">{action.who}</span>{action.amountCents ? <span className="tabular-nums">{euros(action.amountCents)}</span> : null}<span className="truncate">{action.detail}</span></p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium" style={{ color: due.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}><CalendarClock className="h-3.5 w-3.5" />{due.text}</span>
                      {readOnly ? null : (
                        <span className="flex shrink-0 gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => postpone(action)} aria-label={`Posponer: ${action.title}`}><AlarmClock className="h-3.5 w-3.5" />Posponer</Button>
                          <Button size="sm" onClick={() => finish(action)} aria-label={`Hecho: ${action.title}`} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}><Check className="h-3.5 w-3.5" />Hecho</Button>
                        </span>
                      )}
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </section>
          );
        })}
        <LoadMore shown={Math.min(shown, pending.length)} total={pending.length} step={12} onMore={() => setShown((value) => value + 12)} />

        {completed.length ? (
          <Panel>
            <SectionTitle color={ACCENT.mint} icon={CheckCheck}>Hechas hoy · {completed.length}</SectionTitle>
            {completed.map((action) => (
              <div key={action.id} className="flex min-w-0 items-center gap-2 text-sm">
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: readable(ACCENT.mint) }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">{action.title}</span>
                <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setDone((current) => current.filter((id) => id !== action.id))}><Undo2 className="h-3.5 w-3.5" />Deshacer</Button>
              </div>
            ))}
          </Panel>
        ) : null}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Panel>
          <SectionTitle color={ACCENT.sky} icon={CalendarClock}>Dónde está tu embudo</SectionTitle>
          {counts.map(({ stage, items }) => (
            <div key={stage.key} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{stage.label}</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: tint(STAGE_COLOR[stage.key], 16) }}>
                <motion.div className="h-full rounded-full" style={{ background: STAGE_COLOR[stage.key] }} initial={{ width: 0 }} animate={{ width: `${(items.length / maxCount) * 100}%` }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} />
              </div>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums">{items.length}</span>
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-1 border-t border-border pt-3 text-sm">
            <p className="flex justify-between gap-2"><span className="text-muted-foreground">Embudo abierto</span><span className="font-semibold tabular-nums">{euros(pipeline)}</span></p>
            <p className="flex justify-between gap-2"><span className="text-muted-foreground">Previsión</span><span className="font-semibold tabular-nums">{euros(forecast)}</span></p>
          </div>
          <Pill color={ACCENT.turquoise}>{sales.opportunities.filter((opportunity) => opportunity.stage !== "won").length} abiertas</Pill>
        </Panel>
      </aside>
    </div>
  );
}
