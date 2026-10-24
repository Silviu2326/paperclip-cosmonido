import { useMemo, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, Pill } from "../parts";
import { LoadMore } from "../tasks/state-parts";
import { STAGES, type DemoOpportunity, type StageKey } from "./demo-data";
import { STAGE_COLOR, shortDate } from "./sales-parts";

type SortKey = "title" | "stage" | "amount" | "probability" | "forecast" | "close" | "stalled";
type Direction = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className?: string; align?: "right" }[] = [
  { key: "title", label: "Oportunidad" },
  { key: "stage", label: "Etapa" },
  { key: "amount", label: "Importe", align: "right" },
  { key: "probability", label: "Prob.", className: "hidden sm:table-cell", align: "right" },
  { key: "forecast", label: "Previsión", className: "hidden md:table-cell" },
  { key: "close", label: "Cierre", className: "hidden sm:table-cell" },
  { key: "stalled", label: "Sin movimiento", className: "hidden lg:table-cell" },
];
const forecastOf = (opportunity: DemoOpportunity) => (opportunity.amountCents * opportunity.probability) / 100;
const PAGE = 25;

/** Variant B: every opportunity in one sortable table; default order is the weighted forecast. */
export function SalesTable({ opportunities, readOnly, limited, onMove, onReactivate, onLose }: {
  opportunities: DemoOpportunity[]; readOnly: boolean; limited: boolean;
  onMove: (id: string, stage: StageKey) => void; onReactivate: (id: string) => void; onLose: (id: string) => void;
}) {
  const tokens = useMotionTokens();
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: "forecast", direction: "desc" });
  const [stage, setStage] = useState<StageKey | "all">("all");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => opportunities.filter((opportunity) => stage === "all" || opportunity.stage === stage), [opportunities, stage]);
  const maxForecast = Math.max(1, ...filtered.map(forecastOf));
  const rows = useMemo(() => {
    const value = (opportunity: DemoOpportunity): string | number => {
      switch (sort.key) {
        case "title": return opportunity.title.toLowerCase();
        case "stage": return STAGES.findIndex((candidate) => candidate.key === opportunity.stage);
        case "amount": return opportunity.amountCents;
        case "probability": return opportunity.probability;
        case "forecast": return forecastOf(opportunity);
        case "close": return opportunity.expectedCloseAt;
        case "stalled": return opportunity.stalledDays;
      }
    };
    return [...filtered].sort((a, b) => {
      const first = value(a);
      const second = value(b);
      const order = first < second ? -1 : first > second ? 1 : 0;
      return sort.direction === "asc" ? order : -order;
    });
  }, [filtered, sort]);
  const visible = limited ? rows.slice(0, shown) : rows;
  const totals = filtered.reduce((sum, opportunity) => ({ amount: sum.amount + opportunity.amountCents, forecast: sum.forecast + forecastOf(opportunity) }), { amount: 0, forecast: 0 });

  function toggle(key: SortKey) {
    setSort((current) => (current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "title" || key === "close" || key === "stage" ? "asc" : "desc" }));
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <LayoutGroup id="sales-table-stage">
        <div className="flex flex-wrap gap-1.5">
          {([{ key: "all" as const, label: "Todas" }, ...STAGES]).map((candidate) => {
            const selected = stage === candidate.key;
            const count = candidate.key === "all" ? opportunities.length : opportunities.filter((opportunity) => opportunity.stage === candidate.key).length;
            return (
              <button key={candidate.key} onClick={() => { setStage(candidate.key); setShown(PAGE); }} className={cn("relative rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", selected ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
                {selected ? <motion.span layoutId="sales-stage-pill" className="absolute inset-0 rounded-full" style={{ background: tint(candidate.key === "all" ? ACCENT.turquoise : STAGE_COLOR[candidate.key], 30) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                <span className="relative">{candidate.label} · {count}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={column.key} scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", column.className, column.align === "right" && "text-right")}>
                    <button type="button" onClick={() => toggle(column.key)} className={cn("inline-flex items-center gap-1 transition-colors duration-(--motion-duration-fast) hover:text-foreground", active && "text-foreground")}>
                      {column.label}<Icon className={cn("h-3 w-3", !active && "opacity-40")} />
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="hidden px-3 py-2 font-medium xl:table-cell">Próxima acción</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Mover a</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((opportunity, index) => {
              const color = STAGE_COLOR[opportunity.stage];
              const next = STAGES[STAGES.findIndex((candidate) => candidate.key === opportunity.stage) + 1];
              const severe = opportunity.stalledDays >= 30 && opportunity.stage !== "won";
              const value = forecastOf(opportunity);
              return (
                <motion.tr key={opportunity.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 10) * tokens.stagger }} className="border-b border-border transition-colors duration-(--motion-duration-fast) last:border-b-0 hover:bg-accent/40">
                  <td className="max-w-64 min-w-44 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5"><Avatar name={opportunity.customer} size="sm" /><div className="min-w-0"><p className="truncate font-medium">{opportunity.title}</p><p className="truncate text-xs text-muted-foreground">{opportunity.customer}</p></div></div>
                  </td>
                  <td className="px-3 py-2.5"><Pill color={color}>{STAGES.find((candidate) => candidate.key === opportunity.stage)!.label}</Pill></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{euros(opportunity.amountCents)}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{opportunity.probability} %</td>
                  <td className="hidden w-44 px-3 py-2.5 md:table-cell">
                    <div className="flex flex-col gap-1"><span className="text-xs tabular-nums">{euros(value)}</span><div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: tint(color, 18) }}><motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(value / maxForecast) * 100}%` }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} /></div></div>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">{shortDate(opportunity.expectedCloseAt)}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs lg:table-cell">{opportunity.stalledDays >= 14 ? <span className="inline-flex items-center gap-1" style={{ color: readable(severe ? ACCENT.risk : ACCENT.yellow) }}><AlertTriangle className="h-3 w-3" />{opportunity.stalledDays} días</span> : <span className="text-muted-foreground">{opportunity.stalledDays} {opportunity.stalledDays === 1 ? "día" : "días"}</span>}</td>
                  <td className="hidden max-w-56 px-3 py-2.5 xl:table-cell"><span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{opportunity.nextAction ? <><Sparkles className="h-3 w-3 shrink-0" /><span className="truncate">{opportunity.nextAction}</span></> : "—"}</span></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {readOnly ? null : severe ? (
                      <span className="inline-flex gap-1"><Button size="sm" variant="outline" onClick={() => onReactivate(opportunity.id)}>Reactivar</Button><Button size="sm" variant="ghost" onClick={() => onLose(opportunity.id)}>Perdida</Button></span>
                    ) : next ? <Button size="sm" variant="ghost" aria-label={`Mover ${opportunity.title} a ${next.label}`} onClick={() => onMove(opportunity.id, next.key)}>{next.label}<ArrowRight className="h-3.5 w-3.5" /></Button> : null}
                  </td>
                </motion.tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">Ninguna oportunidad en esta etapa.</td></tr> : null}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-sm font-semibold">
              <td className="px-3 py-2.5" colSpan={2}>Total · {filtered.length} {filtered.length === 1 ? "oportunidad" : "oportunidades"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{euros(totals.amount)}</td>
              <td className="hidden sm:table-cell" />
              <td className="hidden px-3 py-2.5 tabular-nums md:table-cell">{euros(Math.round(totals.forecast))}</td>
              <td colSpan={4} className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
      {limited ? <LoadMore shown={visible.length} total={rows.length} step={25} onMore={() => setShown((value) => value + 25)} /> : null}
    </div>
  );
}
