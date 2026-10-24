import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, CloudOff, Download, FileSpreadsheet, LoaderCircle, Lock, RefreshCw, Send, TriangleAlert, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Pill, Progress } from "../parts";
import { RANGE_LABEL, type ActivityRange } from "./scenarios";

/** Shared page states (loading, error, no permission). Reused by the Ajustes proposal. */

/** A pulsing placeholder. With "reduce motion" it stays still. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={cn("rounded-md", className)}
      style={{ background: tint(ACCENT.muted, 22), ...style }}
      animate={reduced ? undefined : { opacity: [0.5, 1, 0.5] }}
      transition={reduced ? undefined : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function SkeletonRows({ count = 5, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <div role="status" aria-label="Cargando" className="divide-y divide-border rounded-2xl border border-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-3">
          {avatar ? <Skeleton className="h-7 w-7 shrink-0 rounded-xl" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${70 - (index % 3) * 14}%` }} />
            <Skeleton className="h-3" style={{ width: `${40 - (index % 2) * 10}%` }} />
          </div>
          <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** The page frame while data loads: heading, four figures, tabs and a list. */
export function ActivitySkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-xl" />
      <SkeletonRows count={6} />
      <p className="text-center text-xs text-muted-foreground">Cargando la actividad de tu equipo…</p>
    </div>
  );
}

/** The request failed. "Reintentar" tries again and, in this demo, fails once more with a counter. */
export function LoadError({ title = "No hemos podido cargar la actividad", text, detail = "Error 503 · el servicio no respondió a tiempo", offline = false }: { title?: string; text?: string; detail?: string; offline?: boolean }) {
  const [attempt, setAttempt] = useState(1);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!retrying) return;
    const timer = window.setTimeout(() => { setRetrying(false); setAttempt((current) => current + 1); }, 1300);
    return () => window.clearTimeout(timer);
  }, [retrying]);
  const Icon = offline ? WifiOff : CloudOff;
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-10 text-center">
      <IconTile icon={Icon} color={ACCENT.risk} />
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{text ?? "Tus datos están a salvo; solo ha fallado la conexión. Vuelve a intentarlo en unos segundos."}</p>
        <p className="font-mono text-xs text-muted-foreground">{detail}{attempt > 1 ? ` · intento ${attempt}` : ""}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setRetrying(true)} disabled={retrying} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>
          {retrying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{retrying ? "Reintentando…" : "Reintentar"}
        </Button>
        <Button variant="outline">Ver el estado del servicio</Button>
      </div>
    </div>
  );
}

/** The user may not see this page. Offers a request to the owner instead of a dead end. */
export function NoPermission({ what = "la actividad de la empresa", owner = "Silviu" }: { what?: string; owner?: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-10 text-center">
      <IconTile icon={Lock} color={ACCENT.lilac} />
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="text-lg font-semibold">No tienes acceso a {what}</h2>
        <p className="text-sm text-muted-foreground">Tu rol de <strong>Invitado</strong> solo permite ver las tareas que te asignan. {owner} (propietario) puede darte acceso.</p>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div key="sent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />Solicitud enviada a {owner}. Te avisaremos cuando responda.</motion.div>
        ) : (
          <motion.div key="ask" exit={{ opacity: 0 }} className="flex gap-2">
            <Button onClick={() => setSent(true)}><Send className="h-4 w-4" />Solicitar acceso</Button>
            <Button variant="outline">Volver a Inicio</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const RANGES: ActivityRange[] = ["today", "7d", "30d", "custom"];

/** Date range and export, shared by the three variants. */
export function RangeBar({ range, onRange, onExport, exporting }: { range: ActivityRange; onRange: (range: ActivityRange) => void; onExport: () => void; exporting: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1.5">
        {RANGES.map((value) => (
          <button
            key={value}
            aria-pressed={range === value}
            onClick={() => onRange(value)}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", range === value ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
            style={range === value ? { background: tint(ACCENT.sky, 30) } : undefined}
          >
            {RANGE_LABEL[value]}
          </button>
        ))}
      </div>
      <Button size="sm" variant="outline" disabled={exporting} onClick={onExport}>
        {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Exportar CSV
      </Button>
    </div>
  );
}

/** A running export with a progress bar that can be cancelled, then a download link. */
export function ExportBanner({ initialProgress = 12, onClose, rows = 12480 }: { initialProgress?: number; onClose: () => void; rows?: number }) {
  const tokens = useMotionTokens();
  const [progress, setProgress] = useState(initialProgress);
  const done = progress >= 100;
  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => setProgress((current) => Math.min(100, current + 6)), 700);
    return () => window.clearInterval(timer);
  }, [done]);
  return (
    <motion.div role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm" style={{ background: tint(ACCENT.sky, 12) }}>
      <IconTile icon={FileSpreadsheet} color={ACCENT.sky} size="sm" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-medium">{done ? "Exportación lista: actividad-octubre-2026.csv (4,2 MB)" : `Exportando ${rows.toLocaleString("es-ES")} eventos… ${progress} %`}</p>
        {done ? <p className="text-xs text-muted-foreground">El archivo estará disponible 24 horas en Archivos → Salida.</p> : <div className="mt-1.5"><Progress value={progress} color={ACCENT.sky} /></div>}
      </div>
      {done ? <Button size="sm"><Download className="h-3.5 w-3.5" />Descargar</Button> : <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>}
      {done ? <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button> : null}
    </motion.div>
  );
}

/** One alert row used by the banners and the control panel. */
export function AlertBanner({ tone, icon: Icon, children, action }: { tone: "risk" | "warn" | "info"; icon?: typeof TriangleAlert; children: ReactNode; action?: ReactNode }) {
  const color = tone === "risk" ? ACCENT.risk : tone === "warn" ? ACCENT.yellow : ACCENT.sky;
  const Glyph = Icon ?? TriangleAlert;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl p-3 text-sm" style={{ background: tint(color, tone === "risk" ? 14 : 22) }}>
      <Glyph className="h-4 w-4 shrink-0" style={{ color: readable(color) }} />
      <span className="min-w-0 flex-1 basis-56">{children}</span>
      {action}
    </div>
  );
}

export { Pill };

/** A pill that truncates long text instead of overflowing; the full text stays in the tooltip. */
export function ClipPill({ color, children }: { color: string; children: string }) {
  return (
    <span
      title={children}
      className="inline-flex min-w-0 max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: tint(color, 18), color: readable(color) }}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
