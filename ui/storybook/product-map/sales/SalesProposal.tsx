import { AnimatePresence, motion } from "motion/react";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, SectionTitle } from "../parts";
import { ErrorState, LoadingFrame, ReadOnlyBanner, Skel, VariantFrame, useScenario, type BaseScenario } from "../tasks/state-parts";
import { STAGES, type DemoLead, type DemoOpportunity, type DemoProposal } from "./demo-data";
import { DUPLICATE_LEAD, LONG_LEADS, LONG_OPPORTUNITIES, LONG_PROPOSALS, MANY_LEADS, MANY_OPPORTUNITIES, MANY_PROPOSALS, STALLED_OPPORTUNITIES, withoutStage } from "./demo-extra";
import { SalesTable } from "./SalesTable";
import { SalesToday } from "./SalesToday";
import { Board, Forms, LeadsPanel, Proposals, SalesEmpty, SalesStats, SalesToast, StalledNotice, forecastOf, useSalesData } from "./sales-parts";

export type SalesScenario = BaseScenario | "etapa-vacia" | "oportunidad-parada" | "lead-duplicado";
export type SalesVariant = "a" | "b" | "c";

type Data = { opportunities: DemoOpportunity[]; leads: DemoLead[]; proposals: DemoProposal[] };

function dataFor(scenario: SalesScenario, base: Data): Data {
  switch (scenario) {
    case "many": return { opportunities: MANY_OPPORTUNITIES, leads: MANY_LEADS, proposals: MANY_PROPOSALS };
    case "long": return { opportunities: LONG_OPPORTUNITIES, leads: LONG_LEADS, proposals: LONG_PROPOSALS };
    case "etapa-vacia": return { ...base, opportunities: withoutStage(base.opportunities, "proposal") };
    case "oportunidad-parada": return { ...base, opportunities: STALLED_OPPORTUNITIES };
    case "lead-duplicado": return { ...base, leads: [DUPLICATE_LEAD, ...base.leads] };
    default: return base;
  }
}

function Secondary({ sales, proposals, readOnly, limited }: { sales: ReturnType<typeof useSalesData>; proposals: DemoProposal[]; readOnly: boolean; limited: boolean }) {
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
      <LeadsPanel leads={sales.leads} readOnly={readOnly} limited={limited} onConvert={sales.convert} onDiscard={sales.discard} />
      <div className="flex min-w-0 flex-col gap-4">
        <Proposals proposals={proposals} limited={limited} />
        <Forms readOnly={readOnly} />
      </div>
    </div>
  );
}

function SalesPage({ data, scenario, variant, readOnly }: { data: Data; scenario: SalesScenario; variant: SalesVariant; readOnly: boolean }) {
  const sales = useSalesData(data.opportunities, data.leads, readOnly);
  const limited = scenario === "many";
  const { stalled } = forecastOf(sales.opportunities);
  const severe = stalled.filter((opportunity) => opportunity.stalledDays >= 30).length;
  const qualified = sales.opportunities.filter((opportunity) => opportunity.stage === "qualified").length;
  const proposalEmpty = scenario === "etapa-vacia" && !sales.opportunities.some((opportunity) => opportunity.stage === "proposal");
  const isEmpty = sales.opportunities.length === 0 && sales.leads.length === 0 && data.proposals.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ventas</h1>
          {!isEmpty ? <p className="text-sm text-muted-foreground">{forecastOf(sales.opportunities).open.length} oportunidades abiertas · {sales.leads.length} leads por cualificar · {data.proposals.length} propuestas en curso</p> : null}
        </div>
        {readOnly ? null : <Button onClick={() => sales.setToast("Nueva oportunidad (el formulario se diseñaría aparte)")}><Plus className="h-4 w-4" />Nueva oportunidad</Button>}
      </header>
      {readOnly ? <ReadOnlyBanner /> : null}

      {isEmpty ? <SalesEmpty readOnly={readOnly} onCreate={() => sales.setToast("Nueva oportunidad")} /> : <>
        {variant === "c" ? null : <SalesStats opportunities={sales.opportunities} />}
        {variant === "c" ? null : <StalledNotice count={stalled.length} severe={severe} />}
        {proposalEmpty && variant !== "c" ? (
          <div className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: tint(ACCENT.lilac, 18) }}>
            <Target className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.lilac) }} />
            <span className="min-w-0"><strong>La etapa «Propuesta» está vacía</strong> y hay {qualified} oportunidades cualificadas esperando una oferta. Si ya enviaste alguna, muévela para que cuente en la previsión.</span>
          </div>
        ) : null}

        {variant === "c" ? <SalesToday sales={sales} proposals={data.proposals} readOnly={readOnly} /> : <>
          <div className="flex min-w-0 flex-col gap-3">
            <SectionTitle color={ACCENT.sky} icon={Target}>{variant === "b" ? "Oportunidades" : "Embudo"}</SectionTitle>
            {variant === "b"
              ? <SalesTable opportunities={sales.opportunities} readOnly={readOnly} limited={limited} onMove={sales.move} onReactivate={sales.reactivate} onLose={sales.lose} />
              : <Board opportunities={sales.opportunities} readOnly={readOnly} limited={limited} nudge={proposalEmpty ? "Mueve aquí una cualificada cuando envíes su oferta." : undefined} onMove={sales.move} onReactivate={sales.reactivate} onLose={sales.lose} />}
          </div>
          <Secondary sales={sales} proposals={data.proposals} readOnly={readOnly} limited={limited} />
        </>}
      </>}
      <SalesToast message={sales.toast} />
    </div>
  );
}

function SalesSkeleton({ variant }: { variant: SalesVariant }) {
  return (
    <div className="p-4 sm:p-6">
      <LoadingFrame label="Cargando ventas">
        <div className="flex items-end justify-between gap-3"><div className="flex flex-col gap-2"><Skel className="h-7 w-28" /><Skel className="h-4 w-72" delay={0.1} /></div><Skel className="h-9 w-40 rounded-lg" delay={0.15} /></div>
        {variant === "c" ? <Skel className="h-24 w-full rounded-2xl" delay={0.1} /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skel key={index} className="h-28 rounded-xl" delay={index * 0.08} />)}</div>
        )}
        {variant === "a" ? (
          <div className="flex gap-3 overflow-hidden">
            {STAGES.map((stage, column) => (
              <div key={stage.key} className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl bg-muted/30 p-2">
                <Skel className="h-4 w-28" delay={column * 0.07} />
                {Array.from({ length: 3 - (column % 2) }, (_, card) => <Skel key={card} className="h-24 w-full rounded-xl" delay={0.1 + card * 0.1} />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, row) => <Skel key={row} className={cn("w-full", variant === "b" ? "h-11" : "h-16 rounded-xl")} delay={row * 0.07} />)}</div>
        )}
        <div className="grid gap-4 lg:grid-cols-2"><Skel className="h-56 rounded-2xl" delay={0.2} /><Skel className="h-56 rounded-2xl" delay={0.3} /></div>
      </LoadingFrame>
    </div>
  );
}

/** Ventas as one page. `scenario` picks the state (loading, error, lots of data…) and `variant` the design (board, table, "Hoy"). */
export function SalesProposal({ opportunities, leads, proposals, scenario: initialScenario = "normal", variant = "a" }: { opportunities: DemoOpportunity[]; leads: DemoLead[]; proposals: DemoProposal[]; scenario?: SalesScenario; variant?: SalesVariant }) {
  const { scenario, retry, retrying } = useScenario<SalesScenario>(initialScenario, "normal");
  const tokens = useMotionTokens();
  if (scenario === "loading" || (retrying && scenario === "error")) return <SalesSkeleton variant={variant} />;
  if (scenario === "error") return <div className="p-4 sm:p-6"><ErrorState what="tus ventas" onRetry={retry} retrying={retrying} /></div>;
  const base: Data = { opportunities, leads, proposals };
  const data = opportunities.length === 0 && leads.length === 0 && proposals.length === 0 ? base : dataFor(scenario, base);
  return (
    <AnimatePresence mode="wait">
      <motion.div key={`${variant}-${scenario}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: tokens.fast }}>
        <SalesPage data={data} scenario={scenario} variant={variant} readOnly={scenario === "readonly"} />
      </motion.div>
    </AnimatePresence>
  );
}

/** The three designs as tabs, each with one line on what it prioritises. */
export function SalesVariants(props: { opportunities: DemoOpportunity[]; leads: DemoLead[]; proposals: DemoProposal[] }) {
  return (
    <VariantFrame id="sales" variants={[
      { id: "a", label: "A · Embudo", summary: "ver la venta como un recorrido: en qué etapa está cada oportunidad y cuánto dinero hay en cada una.", render: () => <SalesProposal {...props} variant="a" /> },
      { id: "b", label: "B · Tabla por previsión", summary: "saber dónde está el dinero: todas las oportunidades ordenadas por previsión ponderada, comparables en columnas.", render: () => <SalesProposal {...props} variant="b" /> },
      { id: "c", label: "C · Hoy", summary: "qué hacer ahora: las próximas acciones comerciales por urgencia, para vender sin pensar en etapas.", render: () => <SalesProposal {...props} variant="c" /> },
    ]} />
  );
}
