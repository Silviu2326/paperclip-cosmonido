import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, ForbiddenState, LoadingNote, Skeleton, useRetryable } from "../conversations/states";
import { AgentsProposal, type PlanLimit } from "./AgentsProposal";
import { DEMO_TEAM, type TeamAgent } from "./demo-data";
import { budgetPausedTeam, longTextAgents, manyAgents, type AgentsScenario } from "./scenarios";
import { AgentsOrgBoard, AgentsPerformanceTable } from "./variants";

export type AgentsVariant = "a" | "b" | "c";

const VARIANT_NOTE: Record<AgentsVariant, string> = {
  a: "A · Tarjetas con ficha lateral: ver qué hace cada agente ahora y ajustarlo en el momento.",
  b: "B · Organigrama como página: quién dirige a quién, reorganizable arrastrando.",
  c: "C · Tabla de rendimiento: comparar acierto, tiempo y coste por tarea entre agentes.",
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-semibold">Equipo</h1><Button disabled><Plus className="h-4 w-4" />Contratar agente</Button></header>
      {children}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6" aria-busy="true">
      <div className="flex items-end justify-between gap-3"><div className="flex flex-col gap-2"><Skeleton className="h-7 w-32" /><Skeleton className="h-4 w-48" delay={0.1} /></div><Skeleton className="h-9 w-40" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" delay={index * 0.1} />)}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 shrink-0 rounded-xl" delay={index * 0.07} /><div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-1/2" delay={index * 0.07} /><Skeleton className="h-3 w-3/4" delay={index * 0.07} /></div></div>
            <Skeleton className="h-3 w-full" delay={index * 0.07} /><Skeleton className="h-12 w-full" delay={index * 0.07} />
          </div>
        ))}
      </div>
      <LoadingNote label="Cargando tu equipo…" />
    </div>
  );
}

function dataFor(scenario: AgentsScenario): { agents: TeamAgent[]; pageSize: number; planLimit?: PlanLimit; initialSelectedId?: string; initialHireOpen?: boolean } {
  switch (scenario) {
    case "muchos": return { agents: manyAgents(), pageSize: 24 };
    case "textos-largos": return { agents: longTextAgents(), pageSize: 0, initialSelectedId: "l1" };
    case "pausado-por-presupuesto": return { agents: budgetPausedTeam(), pageSize: 0, initialSelectedId: "marta" };
    case "error-con-reintento": return { agents: DEMO_TEAM, pageSize: 0, initialSelectedId: "nora" };
    case "limite-de-plan": return { agents: DEMO_TEAM, pageSize: 0, planLimit: { used: DEMO_TEAM.length, max: DEMO_TEAM.length, plan: "Pro" }, initialHireOpen: true };
    default: return { agents: DEMO_TEAM, pageSize: 0 };
  }
}

/** Agentes with a design variant and a state. */
export function AgentsBoard({ variant = "a", scenario = "normal" }: { variant?: AgentsVariant; scenario?: AgentsScenario }) {
  const retry = useRetryable(scenario === "error" ? "error" : "ok");
  if (scenario === "cargando" || retry.phase === "retrying") return <PageSkeleton />;
  if (scenario === "error" && retry.phase === "error") return <Frame><ErrorState what="tu equipo" onRetry={retry.retry} /></Frame>;
  if (scenario === "sin-permisos") return <Frame><ForbiddenState what="el equipo de agentes" /></Frame>;
  const data = dataFor(scenario);
  const key = `${variant}-${scenario}`;
  if (variant === "b") return <AgentsOrgBoard key={key} agents={data.agents} />;
  if (variant === "c") return <AgentsPerformanceTable key={key} agents={data.agents} />;
  return <AgentsProposal key={key} agents={data.agents} pageSize={data.pageSize} planLimit={data.planLimit} initialSelectedId={data.initialSelectedId} initialHireOpen={data.initialHireOpen} />;
}

/** The three layouts one under the other. */
export function AgentsCompare() {
  return (
    <div className="flex min-w-0 flex-col gap-10 pb-10">
      {(["a", "b", "c"] as const).map((variant) => (
        <section key={variant} className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold sm:px-6"><Users className="h-4 w-4" />{VARIANT_NOTE[variant]}</p>
          <AgentsBoard variant={variant} />
        </section>
      ))}
    </div>
  );
}
