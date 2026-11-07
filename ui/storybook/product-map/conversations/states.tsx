import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertTriangle, LoaderCircle, Lock, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT } from "../parts";

/**
 * Generic page states shared by the Conversaciones, Agentes and Chat
 * proposals: loading skeletons, load error with retry, no access and banners.
 * Colour is tied to meaning: red only for a real failure.
 */

/** Pulsing placeholder block. Respects reduced motion through the motion tokens. */
export function Skeleton({ className, delay = 0 }: { className?: string; delay?: number }) {
  const tokens = useMotionTokens();
  return (
    <motion.span
      aria-hidden="true"
      className={cn("block rounded-lg bg-muted", className)}
      animate={tokens.base > 0 ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.7 }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

export function LoadingNote({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </p>
  );
}

function StateCard({ icon: Icon, color, title, children, actions }: { icon: LucideIcon; color: string; title: string; children: ReactNode; actions: ReactNode }) {
  const tokens = useMotionTokens();
  return (
    <div role="alert" className="flex min-w-0 flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: tint(color, 24), color: readable(color) }}
      >
        <Icon className="h-6 w-6" />
      </motion.span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}

export function ErrorState({ what, onRetry, detail = "No hemos podido conectar con el servidor." }: { what: string; onRetry: () => void; detail?: string }) {
  return (
    <StateCard
      icon={AlertTriangle}
      color={ACCENT.risk}
      title={`No se pudo cargar ${what}`}
      actions={<>
        <Button onClick={onRetry}><RefreshCw className="h-4 w-4" />Reintentar</Button>
        <Button variant="ghost">Ver estado del servicio</Button>
      </>}
    >
      {detail} Tus datos están a salvo; vuelve a intentarlo en unos segundos.
    </StateCard>
  );
}

export function ForbiddenState({ what, role = "administrador" }: { what: string; role?: string }) {
  const [requested, setRequested] = useState(false);
  return (
    <StateCard
      icon={Lock}
      color={ACCENT.lilac}
      title={`No tienes acceso a ${what}`}
      actions={requested
        ? <p role="status" className="text-sm" style={{ color: readable(ACCENT.mint) }}>Solicitud enviada. Te avisaremos cuando la respondan.</p>
        : <Button onClick={() => setRequested(true)} style={{ background: `linear-gradient(135deg, ${ACCENT.lilac}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}>Pedir acceso</Button>}
    >
      Tu rol no incluye este permiso. Pídeselo a un {role} de la empresa; mientras tanto el resto de la aplicación sigue disponible.
    </StateCard>
  );
}

export function Banner({ tone, icon: Icon, children, action }: { tone: "warning" | "danger" | "info"; icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  const tokens = useMotionTokens();
  const color = tone === "danger" ? ACCENT.risk : tone === "warning" ? ACCENT.yellow : ACCENT.sky;
  const BannerIcon = Icon ?? (tone === "info" ? WifiOff : AlertTriangle);
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
      style={{ background: tint(color, 20), boxShadow: `inset 3px 0 0 ${color}` }}
    >
      <BannerIcon className="h-4 w-4 shrink-0" style={{ color: readable(color) }} />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </motion.div>
  );
}

/** Retry that shows a short loading phase before succeeding, to demo the error → loading → content path. */
export function useRetryable(initial: "ok" | "error", delayMs = 1300) {
  const [phase, setPhase] = useState<"ok" | "error" | "retrying">(initial);
  useEffect(() => {
    if (phase !== "retrying") return;
    const timer = window.setTimeout(() => setPhase("ok"), delayMs);
    return () => window.clearTimeout(timer);
  }, [phase, delayMs]);
  return { phase, retry: () => setPhase("retrying") };
}
