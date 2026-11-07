import { useEffect, useMemo, useState } from "react";
import { FilesError, FilesSkeleton } from "./FilesStates";
import { FilesExplorer } from "./FilesExplorer";
import { filesConfig, type FilesScenario } from "./scenarios";

export type { FilesScenario };

/**
 * Archivos as a file explorer with a scenario. The scenario decides what data and
 * what situation (loading, error, read-only, uploads…) the explorer shows.
 */
export function FilesPage({ scenario = "normal" }: { scenario?: FilesScenario }) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(scenario === "cargando" ? "loading" : scenario === "error" ? "error" : "ready");
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying) return;
    const timer = window.setTimeout(() => { setRetrying(false); setPhase("ready"); }, 1400);
    return () => window.clearTimeout(timer);
  }, [retrying]);
  // "cargando" stays loading (it is a still of the state); "error" recovers into the normal data once retried.
  const config = useMemo(() => filesConfig(scenario === "error" || scenario === "cargando" ? "normal" : scenario), [scenario]);

  if (phase === "loading") return <FilesSkeleton />;
  if (phase === "error") {
    return (
      <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
        <header><h1 className="text-2xl font-semibold">Archivos</h1></header>
        <FilesError retrying={retrying} onRetry={() => setRetrying(true)} />
      </div>
    );
  }
  return <FilesExplorer files={config.files} config={config} />;
}
