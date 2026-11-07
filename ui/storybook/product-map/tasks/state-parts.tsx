import { useEffect, useState, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { AlertTriangle, Loader2, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT } from "../parts";

/**
 * Shared pieces for the extra states (loading, error, read-only, lots of data)
 * and the design variants of Tareas, Proyectos and Ventas.
 */

/** Scenarios every page supports; each page adds its own on top. */
export type BaseScenario = "normal" | "loading" | "error" | "many" | "long" | "readonly";

/**
 * Scenario held as state so "Reintentar" works: the error state flips to a
 * short loading and then to the normal page.
 */
export function useScenario<T extends string>(initial: T, ready: T) {
  const [scenario, setScenario] = useState<T>(initial);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => setScenario(initial), [initial]);
  function retry() {
    setRetrying(true);
    window.setTimeout(() => { setScenario(ready); setRetrying(false); }, 1300);
  }
  return { scenario, retry, retrying };
}

export function Skel({ className, delay = 0 }: { className?: string; delay?: number }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      aria-hidden="true"
      className={cn("rounded-md bg-muted", className)}
      animate={tokens.base === 0 ? undefined : { opacity: [0.45, 1, 0.45] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/** A busy marker that screen readers announce once. */
export function LoadingFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex min-w-0 flex-col gap-5">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function ErrorState({ what, onRetry, retrying }: { what: string; onRetry: () => void; retrying: boolean }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: tint(ACCENT.yellow, 30), color: readable(ACCENT.yellow) }}>
        <AlertTriangle className="h-8 w-8" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">No hemos podido cargar {what}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">Tus datos están a salvo: es un fallo de conexión con el servidor, no se ha perdido nada. Vuelve a intentarlo en unos segundos.</p>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">Código 503 · hace unos segundos</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry} disabled={retrying}>
          {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {retrying ? "Reintentando…" : "Reintentar"}
        </Button>
        <Button variant="ghost">Ver el estado del sistema</Button>
      </div>
    </motion.div>
  );
}

export function ReadOnlyBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: tint(ACCENT.lilac, 18) }}>
      <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.lilac) }} />
      <span className="min-w-0">
        <strong>Solo lectura.</strong> Tu rol en esta empresa es <em>Observador</em>: puedes mirar todo, pero no crear ni cambiar nada. Pide acceso de edición a un administrador.
      </span>
    </div>
  );
}

export function LoadMore({ shown, total, step = 20, onMore }: { shown: number; total: number; step?: number; onMore: () => void }) {
  if (shown >= total) return null;
  const next = Math.min(step, total - shown);
  return (
    <Button size="sm" variant="ghost" className="self-start" onClick={onMore}>
      Mostrar {next} más <span className="text-muted-foreground tabular-nums">({total - shown} sin ver)</span>
    </Button>
  );
}

/** Tabs that switch between design variants, each with a one-line description of what it prioritises. */
export function VariantFrame({ id, variants }: { id: string; variants: { id: string; label: string; summary: string; render: () => ReactNode }[] }) {
  const tokens = useMotionTokens();
  const [current, setCurrent] = useState(variants[0]!.id);
  const active = variants.find((variant) => variant.id === current)!;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="sticky top-0 z-30 flex min-w-0 flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <LayoutGroup id={`variants-${id}`}>
          <div role="tablist" aria-label="Variantes de diseño" className="inline-flex max-w-full self-start overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
            {variants.map((variant) => (
              <button
                key={variant.id}
                role="tab"
                aria-selected={current === variant.id}
                onClick={() => setCurrent(variant.id)}
                className={cn("relative shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", current === variant.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {current === variant.id ? <motion.span layoutId={`variant-pill-${id}`} className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                <span className="relative">{variant.label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
        <p className="min-w-0 text-sm text-muted-foreground"><span className="font-medium text-foreground">Prioriza:</span> {active.summary}</p>
      </div>
      <motion.div key={active.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="min-w-0">
        {active.render()}
      </motion.div>
    </div>
  );
}
