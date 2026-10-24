import { useEffect, useMemo, useState } from "react";
import { FilesError, FilesSkeleton, type FilesVariantId } from "./FilesStates";
import { FilesProposal } from "./FilesProposal";
import { FilesByOwner, FilesGallery } from "./FilesVariants";
import { filesConfig, type FilesScenario } from "./scenarios";
import { VariantCompare } from "./VariantCompare";

export type { FilesScenario, FilesVariantId };

export const FILES_VARIANT_PRIORITY: Record<FilesVariantId, { label: string; priority: string }> = {
  a: { label: "A · Explorador", priority: "moverte por carpetas conocidas (Entrada y Salida) y gestionar muchos archivos de golpe, con la vista previa en un lateral." },
  b: { label: "B · Galería", priority: "ver el contenido: un archivo grande a la vez, pasar al siguiente con flechas y revisar sin abrir nada, con los detalles a un lado." },
  c: { label: "C · Por clientes y proyectos", priority: "encontrar por a quién pertenece (cliente, proyecto o empresa) en lugar de por carpeta, con avisos de contexto y caducidad por cada uno." },
};

/**
 * Archivos with a layout variant and a scenario. The scenario decides what
 * data and what situation (loading, error, read-only, uploads…) every variant shows.
 */
export function FilesPage({ variant = "a", scenario = "normal" }: { variant?: FilesVariantId; scenario?: FilesScenario }) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(scenario === "cargando" ? "loading" : scenario === "error" ? "error" : "ready");
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying) return;
    const timer = window.setTimeout(() => { setRetrying(false); setPhase("ready"); }, 1400);
    return () => window.clearTimeout(timer);
  }, [retrying]);
  // "cargando" stays loading (it is a still of the state); "error" recovers into the normal data once retried.
  const config = useMemo(() => filesConfig(scenario === "error" || scenario === "cargando" ? "normal" : scenario), [scenario]);

  if (phase === "loading") return <FilesSkeleton variant={variant} />;
  if (phase === "error") {
    return (
      <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
        <header><h1 className="text-2xl font-semibold">Archivos</h1></header>
        <FilesError retrying={retrying} onRetry={() => setRetrying(true)} />
      </div>
    );
  }
  return variant === "b" ? <FilesGallery config={config} /> : variant === "c" ? <FilesByOwner config={config} /> : <FilesProposal files={config.files} config={config} />;
}

/** The three variants behind tabs, each with its one-sentence priority. */
export function FilesVariantCompare({ scenario = "normal" }: { scenario?: FilesScenario }) {
  return (
    <VariantCompare
      title="Archivos"
      options={(["a", "b", "c"] as const).map((id) => ({ id, label: FILES_VARIANT_PRIORITY[id].label, priority: FILES_VARIANT_PRIORITY[id].priority, render: () => <FilesPage variant={id} scenario={scenario} /> }))}
    />
  );
}
