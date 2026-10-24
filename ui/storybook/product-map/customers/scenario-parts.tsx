import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { AlertTriangle, Lock, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT } from "../parts";

/**
 * Parts shared by the scenario stories of Clientes, Decisiones and Inicio:
 * loading skeletons, load error with retry, permission notices, "load more"
 * and the tab bar used to compare design variants.
 */

/** Pulsing placeholder block; it holds still when reduced motion is on. */
export function Skeleton({ className }: { className?: string }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      aria-hidden="true"
      className={cn("max-w-full rounded-lg bg-muted", className)}
      animate={tokens.base > 0 ? { opacity: [0.45, 1, 0.45] } : undefined}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function LoadingStatus({ label = "Cargando…" }: { label?: string }) {
  return <p role="status" className="sr-only">{label}</p>;
}

export function LoadError({ title, detail, onRetry, retrying }: { title: string; detail: string; onRetry: () => void; retrying: boolean }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border border-border p-10 text-center"
      style={{ background: `linear-gradient(135deg, ${tint(ACCENT.risk, 10)}, transparent 70%)` }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: tint(ACCENT.risk, 22), color: readable(ACCENT.risk) }}>
        <WifiOff className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      <Button onClick={onRetry} disabled={retrying}>
        <motion.span animate={retrying && tokens.base > 0 ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.9, repeat: retrying ? Infinity : 0, ease: "linear" }} className="flex">
          <RefreshCw className="h-4 w-4" />
        </motion.span>
        {retrying ? "Reintentando…" : "Reintentar"}
      </Button>
      <p className="text-xs text-muted-foreground">Tus datos no se han perdido. Si el problema sigue, revisa Apps → Conexiones o avisa a un administrador.</p>
    </motion.div>
  );
}

/** Notice at the top of a page when the viewer has limited access. */
export function PermissionNotice({ title, children }: { title: string; children: ReactNode }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      role="note"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
      style={{ background: tint(ACCENT.lilac, 14) }}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.lilac) }} />
      <div className="min-w-0"><p className="font-medium">{title}</p><p className="text-muted-foreground">{children}</p></div>
    </motion.div>
  );
}

export function ScenarioBanner({ tone, children, action }: { tone: "warning" | "risk"; children: ReactNode; action?: ReactNode }) {
  const color = tone === "risk" ? ACCENT.risk : ACCENT.yellow;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm" style={{ background: tint(color, tone === "risk" ? 14 : 24) }}>
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: readable(color) }} />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/** Pagination: shows `pageSize` items and a "load more" button that reveals the next page. */
export function useLoadMore<T>(items: T[], pageSize: number | undefined) {
  const [count, setCount] = useState(pageSize ?? Number.POSITIVE_INFINITY);
  const limit = pageSize ? count : items.length;
  return {
    visible: items.slice(0, limit),
    remaining: Math.max(0, items.length - limit),
    more: () => setCount((current) => current + (pageSize ?? 0)),
    reset: () => setCount(pageSize ?? Number.POSITIVE_INFINITY),
  };
}

export function LoadMoreButton({ remaining, onClick, noun }: { remaining: number; onClick: () => void; noun: string }) {
  if (!remaining) return null;
  return (
    <Button variant="outline" onClick={onClick} className="self-center">
      Cargar más ({remaining} {noun} más)
    </Button>
  );
}

/** Scenario lifecycle for loading and error: `error` can be retried, `loading` stays until the story is changed. */
export type Phase = "loading" | "error" | "ready";

export function usePhase(initial: Phase) {
  const [phase, setPhase] = useState<Phase>(initial);
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const retry = useCallback(() => {
    setRetrying(true);
    timer.current = window.setTimeout(() => { setRetrying(false); setPhase("ready"); }, 1100);
  }, []);
  return { phase, retrying, retry };
}

export interface VariantItem {
  id: string;
  label: string;
  /** One sentence: what this design prioritises. */
  summary: string;
  render: () => ReactNode;
}

/** Tabs to compare design variants of one page, each with a sentence saying what it favours. */
export function VariantTabs({ items, initial }: { items: VariantItem[]; initial?: string }) {
  const tokens = useMotionTokens();
  const [active, setActive] = useState(initial ?? items[0]!.id);
  const current = items.find((item) => item.id === active) ?? items[0]!;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <LayoutGroup id={`variants-${items.map((item) => item.id).join("")}`}>
          <div role="tablist" className="inline-flex flex-wrap gap-1 self-start rounded-xl border border-border bg-muted/40 p-1">
            {items.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === active}
                onClick={() => setActive(item.id)}
                className={cn("relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", item.id === active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {item.id === active ? <motion.span layoutId="variant-pill" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                <span className="relative">{item.label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
        <motion.p key={current.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: tokens.fast }} className="text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">{current.label}:</strong> {current.summary}
        </motion.p>
      </div>
      <motion.div key={current.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="min-w-0">
        {current.render()}
      </motion.div>
    </div>
  );
}

