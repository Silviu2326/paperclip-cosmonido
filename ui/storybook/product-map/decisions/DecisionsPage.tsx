import { DecisionsDeck } from "./DecisionsDeck";
import { DecisionsInbox } from "./DecisionsInbox";
import { DecisionsProposal } from "./DecisionsProposal";
import { DEMO_DECISIONS, type DemoDecision } from "./demo-data";
import { LONG_TEXT_DECISIONS, ONLY_URGENT, WITH_OVERDUE, makeManyDecisions } from "./scenario-data";
import { LoadError, LoadingStatus, PermissionNotice, Skeleton, VariantTabs, usePhase } from "../customers/scenario-parts";

export type DecisionsState = "normal" | "cargando" | "error" | "muchisimas" | "textos-largos" | "sin-permisos" | "solo-urgentes" | "con-vencidas";
export type DecisionsVariant = "a" | "b" | "c";

export const DECISIONS_VARIANT_SUMMARY: Record<DecisionsVariant, { label: string; summary: string }> = {
  a: { label: "A · Tarjetas por urgencia", summary: "Entender cada decisión sin salir de la página: tarjetas agrupadas por urgencia con su contexto desplegable y el progreso del día." },
  b: { label: "B · Bandeja con atajos", summary: "Despachar muchas rápido: una línea por decisión, panel de lectura a la derecha y todo con el teclado (J/K, A, R, S, Z)." },
  c: { label: "C · Una a una", summary: "No pensar en la cola: una sola decisión a pantalla completa; deslizar o usar las flechas, y se acaba cuando se acaba." },
};

function DecisionsSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6" aria-busy="true">
      <LoadingStatus label="Cargando decisiones…" />
      <div className="flex w-full max-w-xs flex-col gap-2"><Skeleton className="h-8 w-44" /><Skeleton className="h-4 w-full" /></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-7 w-24 rounded-full" />)}</div>
          <Skeleton className="h-4 w-48" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <div className="flex items-start gap-3"><Skeleton className="h-8 w-8" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-5/6" /></div></div>
              <div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-4 w-40" /><div className="flex gap-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-28" /></div></div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
      </div>
    </div>
  );
}

function dataFor(state: DecisionsState, decisions: DemoDecision[]): DemoDecision[] {
  if (state === "muchisimas") return makeManyDecisions(160);
  if (state === "textos-largos") return [...LONG_TEXT_DECISIONS, ...DEMO_DECISIONS.slice(0, 2)];
  if (state === "con-vencidas") return WITH_OVERDUE;
  if (state === "solo-urgentes") return ONLY_URGENT;
  return decisions;
}

/** Decisiones in any state and any of the three designs. */
export function DecisionsPage({ decisions = DEMO_DECISIONS, state = "normal", variant = "a" }: {
  decisions?: DemoDecision[];
  state?: DecisionsState;
  variant?: DecisionsVariant;
}) {
  const { phase, retrying, retry } = usePhase(state === "cargando" ? "loading" : state === "error" ? "error" : "ready");
  if (phase === "loading") return <DecisionsSkeleton />;
  if (phase === "error") {
    return (
      <div className="p-6">
        <LoadError title="No hemos podido cargar tus decisiones" detail="No llegó la respuesta del servidor a tiempo (error 504). Las decisiones siguen esperándote; no se ha perdido ninguna." onRetry={retry} retrying={retrying} />
      </div>
    );
  }
  const data = dataFor(state, decisions);
  const canApprove = state !== "sin-permisos";
  const pageSize = state === "muchisimas" ? 10 : undefined;
  return (
    <div className="flex min-w-0 flex-col">
      {!canApprove ? (
        <div className="px-4 pt-4 sm:px-6 sm:pt-6">
          <PermissionNotice title="Eres miembro: puedes responder y revisar, no aprobar">
            Aprobar, rechazar, dar acceso y subir presupuestos queda en manos de los administradores. Los botones aparecen desactivados.
          </PermissionNotice>
        </div>
      ) : null}
      {variant === "a" ? (
        <DecisionsProposal key={state} decisions={data} canApprove={canApprove} pageSize={pageSize} initialFilter={state === "solo-urgentes" ? "urgent" : "all"} />
      ) : variant === "b" ? (
        <DecisionsInbox key={state} decisions={data} canApprove={canApprove} pageSize={pageSize} />
      ) : (
        <DecisionsDeck key={state} decisions={data} canApprove={canApprove} />
      )}
    </div>
  );
}

export function DecisionsVariants({ state = "normal" }: { state?: DecisionsState }) {
  return (
    <VariantTabs
      items={(["a", "b", "c"] as const).map((variant) => ({
        id: variant,
        label: DECISIONS_VARIANT_SUMMARY[variant].label,
        summary: DECISIONS_VARIANT_SUMMARY[variant].summary,
        render: () => <DecisionsPage variant={variant} state={state} />,
      }))}
    />
  );
}
