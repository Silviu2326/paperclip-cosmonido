import { useMemo } from "react";
import { LoadError, LoadingStatus, PermissionNotice, Skeleton, VariantTabs, usePhase } from "../customers/scenario-parts";
import { HomeExecutive } from "./HomeExecutive";
import { HomeProposal } from "./HomeProposal";
import { HomeTeam } from "./HomeTeam";
import { HomeDataContext, buildHomeData, type HomeState } from "./home-data";

export type HomeVariant = "a" | "b" | "c";

export const HOME_VARIANT_SUMMARY: Record<HomeVariant, { label: string; summary: string }> = {
  a: { label: "A · Panel completo", summary: "Verlo todo de una vez: lo que te necesita, el equipo, las cifras, los resultados, la agenda y lo último." },
  b: { label: "B · Ejecutiva", summary: "Tres números grandes y una sola lista de lo que pasa hoy (decidir, agenda, actividad): para abrir, actuar y cerrar." },
  c: { label: "C · Equipo protagonista", summary: "El equipo es lo importante: una tarjeta grande por agente con su estado en vivo, tendencia y controles; lo que te necesita, en una franja." },
};

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6" aria-busy="true">
      <LoadingStatus label="Cargando Inicio…" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex w-full max-w-md flex-col gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-full" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-44" /><Skeleton className="h-9 w-32" /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="flex flex-col gap-4"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
        <div className="flex flex-col gap-4"><Skeleton className="h-44 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
      </div>
    </div>
  );
}

/** Inicio in any state and any of the three designs. A brand-new company ("nueva") always shows the first-steps screen. */
export function HomePage({ state = "normal", variant = "a" }: { state?: HomeState; variant?: HomeVariant }) {
  const { phase, retrying, retry } = usePhase(state === "cargando" ? "loading" : state === "error" ? "error" : "ready");
  const data = useMemo(() => buildHomeData(state), [state]);
  if (phase === "loading") return <HomeSkeleton />;
  if (phase === "error") {
    return (
      <div className="p-6">
        <LoadError title="No hemos podido cargar Inicio" detail="Algunas secciones no respondieron a tiempo (error 502). Tu equipo sigue trabajando mientras tanto." onRetry={retry} retrying={retrying} />
      </div>
    );
  }
  return (
    <HomeDataContext.Provider value={data}>
      <div className="flex min-w-0 flex-col">
        {state === "sin-permisos" ? (
          <div className="px-4 pt-4 sm:px-6 sm:pt-6">
            <PermissionNotice title="Estás viendo Inicio como miembro">
              Ves a tu equipo, tus decisiones y tu agenda. Los importes (gasto e ingresos) y los resultados del negocio los ven los administradores.
            </PermissionNotice>
          </div>
        ) : null}
        {state === "nueva" || variant === "a" ? <HomeProposal mode={state === "nueva" ? "new" : "active"} /> : variant === "b" ? <HomeExecutive /> : <HomeTeam />}
      </div>
    </HomeDataContext.Provider>
  );
}

export function HomeVariants({ state = "normal" }: { state?: HomeState }) {
  return (
    <VariantTabs
      items={(["a", "b", "c"] as const).map((variant) => ({
        id: variant,
        label: HOME_VARIANT_SUMMARY[variant].label,
        summary: HOME_VARIANT_SUMMARY[variant].summary,
        render: () => <HomePage variant={variant} state={state} />,
      }))}
    />
  );
}
