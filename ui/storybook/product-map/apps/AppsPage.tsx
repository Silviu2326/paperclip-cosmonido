import { useEffect, useMemo, useState } from "react";
import { VariantCompare } from "../files/VariantCompare";
import { DEMO_APPS } from "./demo-data";
import { AppsError, AppsSkeleton, type AppsVariantId } from "./AppsStates";
import { AppsProposal } from "./AppsProposal";
import { AppsGoals, AppsHealth } from "./AppsVariants";
import { appsConfig, type AppsScenario } from "./scenarios";

export type { AppsScenario, AppsVariantId };

export const APPS_VARIANT_PRIORITY: Record<AppsVariantId, { label: string; priority: string }> = {
  a: { label: "A · Catálogo", priority: "explorar y comparar todas las apps disponibles por categoría, con tus conexiones arriba." },
  b: { label: "B · Por objetivos", priority: "partir de lo que quieres conseguir (cobrar, atender WhatsApp, publicar) y que la página diga qué conectar, en qué orden y qué hará tu equipo." },
  c: { label: "C · Salud", priority: "saber de un vistazo si algo se ha roto: semáforo por conexión, historial de 30 días y la acción que lo arregla, sin ruido de catálogo." },
};

/**
 * Apps with a layout variant and a scenario. The scenario decides which apps exist and what situation
 * (loading, error, read-only, plan limit, pending approvals…) every variant shows.
 */
export function AppsPage({ variant = "a", scenario = "normal" }: { variant?: AppsVariantId; scenario?: AppsScenario }) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(scenario === "cargando" ? "loading" : scenario === "error" ? "error" : "ready");
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying) return;
    const timer = window.setTimeout(() => { setRetrying(false); setPhase("ready"); }, 1400);
    return () => window.clearTimeout(timer);
  }, [retrying]);
  const config = useMemo(() => appsConfig(scenario), [scenario]);

  if (phase === "loading") return <AppsSkeleton variant={variant} />;
  if (phase === "error") {
    return (
      <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
        <header><h1 className="text-2xl font-semibold">Apps</h1></header>
        <AppsError retrying={retrying} onRetry={() => setRetrying(true)} />
      </div>
    );
  }
  return variant === "b" ? <AppsGoals config={config} /> : variant === "c" ? <AppsHealth config={config} /> : <AppsProposal apps={config.apps.length ? config.apps : DEMO_APPS} hasConnections={config.hasConnections} config={config} />;
}

/** The three variants behind tabs, each with its one-sentence priority. */
export function AppsVariantCompare({ scenario = "normal" }: { scenario?: AppsScenario }) {
  return (
    <VariantCompare
      title="Apps"
      options={(["a", "b", "c"] as const).map((id) => ({ id, label: APPS_VARIANT_PRIORITY[id].label, priority: APPS_VARIANT_PRIORITY[id].priority, render: () => <AppsPage variant={id} scenario={scenario} /> }))}
    />
  );
}
