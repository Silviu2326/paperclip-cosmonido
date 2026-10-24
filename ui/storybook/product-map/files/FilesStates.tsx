import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlarmClock, CircleAlert, CircleCheck, CloudOff, HardDrive, Lock, RefreshCw, ShieldAlert, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Panel, Pill, Progress } from "../parts";
import { formatBytes as formatSmall, type DemoFile } from "./demo-data";
import type { DemoUpload, FilesConfig } from "./scenarios";

/** Like formatBytes but switches to GB, so a 20 GB quota does not read "20480,0 MB". */
export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(".", ",")} GB` : formatSmall(bytes);
}

/** Pulsing placeholder block used by every skeleton. */
function Bone({ className, delay = 0 }: { className?: string; delay?: number }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      aria-hidden="true"
      className={cn("rounded-lg", className)}
      style={{ background: tint(ACCENT.muted, 22) }}
      animate={tokens.base > 0 ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.7 }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

export type FilesVariantId = "a" | "b" | "c";

/** Loading state shaped like the layout it replaces, so nothing jumps when data arrives. */
export function FilesSkeleton({ variant = "a" }: { variant?: FilesVariantId }) {
  return (
    <div role="status" aria-label="Cargando archivos" className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2"><Bone className="h-7 w-40" /><Bone className="h-4 w-56" delay={0.1} /></div>
        <Bone className="h-9 w-36" />
      </div>
      {variant === "b" ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">{[0, 1, 2, 3].map((index) => <Bone key={index} className="h-7 w-20 rounded-full" delay={index * 0.08} />)}</div>
          <Bone className="h-72 w-full rounded-2xl sm:h-96" />
          <div className="flex gap-2 overflow-hidden">{Array.from({ length: 10 }, (_, index) => <Bone key={index} className="h-16 w-20 shrink-0" delay={index * 0.06} />)}</div>
        </div>
      ) : variant === "c" ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <div className="flex items-center gap-3"><Bone className="h-10 w-10" delay={index * 0.07} /><div className="flex flex-1 flex-col gap-2"><Bone className="h-4 w-3/4" delay={index * 0.07} /><Bone className="h-3 w-1/2" delay={index * 0.07 + 0.1} /></div></div>
              <Bone className="h-3 w-full" delay={index * 0.07 + 0.2} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,320px)]">
          <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">{Array.from({ length: 7 }, (_, index) => <Bone key={index} className="h-6" delay={index * 0.07} />)}</div>
          <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-2xl border border-border p-2.5"><Bone className="h-28" delay={index * 0.07} /><Bone className="h-4 w-3/4" delay={index * 0.07 + 0.1} /><Bone className="h-3 w-1/2" delay={index * 0.07 + 0.2} /></div>
            ))}
          </div>
          <div className="hidden flex-col gap-3 rounded-2xl border border-border p-4 lg:flex"><Bone className="h-5 w-3/4" /><Bone className="h-40" delay={0.1} /><Bone className="h-4" delay={0.2} /><Bone className="h-4 w-2/3" delay={0.3} /></div>
        </div>
      )}
    </div>
  );
}

/** Load failure with a clear reason and a retry that actually retries. */
export function FilesError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 p-10 text-center" role="alert">
      <IconTile icon={CloudOff} color={ACCENT.risk} />
      <div className="max-w-md">
        <h2 className="text-lg font-semibold">No hemos podido cargar tus archivos</h2>
        <p className="text-sm text-muted-foreground">El servidor no respondió a tiempo. Tus archivos están a salvo; no se ha perdido ni cambiado nada.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry} disabled={retrying}><RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} />{retrying ? "Reintentando…" : "Reintentar"}</Button>
        <Button variant="outline">Ver estado del servicio</Button>
      </div>
      <p className="text-xs text-muted-foreground">Código de error 504 · se reintentará solo en unos segundos</p>
    </div>
  );
}

/** Drives the progress of the uploads in a scenario; failed ones can be retried and then finish. */
export function useUploadQueue(initial: DemoUpload[]) {
  const [uploads, setUploads] = useState(initial);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setUploads((current) => {
        let activeSlots = current.filter((upload) => upload.status === "uploading").length;
        return current.map((upload) => {
          if (upload.status === "waiting" && activeSlots < 2) { activeSlots += 1; return { ...upload, status: "uploading" as const }; }
          if (upload.status !== "uploading") return upload;
          const progress = Math.min(100, upload.progress + upload.speed);
          return progress >= 100 ? { ...upload, progress: 100, status: "done" as const } : { ...upload, progress };
        });
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  return {
    uploads,
    retry: (id: string) => setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, status: "uploading" as const, error: undefined, progress: upload.progress >= 100 ? 0 : upload.progress } : upload)),
    dismiss: (id: string) => setUploads((current) => current.filter((upload) => upload.id !== id)),
    clearDone: () => setUploads((current) => current.filter((upload) => upload.status !== "done")),
  };
}

export function UploadTray({ queue }: { queue: ReturnType<typeof useUploadQueue> }) {
  const tokens = useMotionTokens();
  const { uploads } = queue;
  if (!uploads.length) return null;
  const active = uploads.filter((upload) => upload.status === "uploading" || upload.status === "waiting").length;
  const failed = uploads.filter((upload) => upload.status === "failed").length;
  const total = uploads.reduce((sum, upload) => sum + upload.progress, 0) / uploads.length;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <IconTile icon={UploadCloud} color={failed ? ACCENT.yellow : ACCENT.turquoise} size="sm" />
          {active ? `Subiendo ${active} ${active === 1 ? "archivo" : "archivos"}` : failed ? `${failed} ${failed === 1 ? "subida ha fallado" : "subidas han fallado"}` : "Subidas terminadas"}
        </h2>
        {!active ? <Button size="sm" variant="ghost" onClick={queue.clearDone}>Limpiar</Button> : <span className="text-xs tabular-nums text-muted-foreground">{Math.round(total)} %</span>}
      </div>
      <ul className="flex min-w-0 flex-col gap-3">
        <AnimatePresence initial={false}>
          {uploads.map((upload) => {
            const color = upload.status === "failed" ? ACCENT.risk : upload.status === "done" ? ACCENT.mint : ACCENT.turquoise;
            return (
              <motion.li key={upload.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  {upload.status === "done" ? <CircleCheck className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /> : upload.status === "failed" ? <CircleAlert className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.risk) }} /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{upload.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(upload.bytes)}</span>
                  {upload.status === "failed" ? <Button size="sm" variant="outline" onClick={() => queue.retry(upload.id)}><RefreshCw className="h-3.5 w-3.5" />Reintentar</Button> : null}
                  {upload.status === "failed" || upload.status === "done" ? <button type="button" aria-label={`Quitar ${upload.name}`} onClick={() => queue.dismiss(upload.id)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button> : null}
                </div>
                <Progress value={upload.status === "waiting" ? 0 : upload.progress} color={color} />
                <p className="text-xs text-muted-foreground" style={upload.status === "failed" ? { color: readable(ACCENT.risk) } : undefined}>
                  {upload.status === "waiting" ? "En cola" : upload.status === "uploading" ? `${Math.round(upload.progress)} % · quedan unos segundos` : upload.status === "done" ? "Subido a Entrada" : upload.error}
                </p>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}

export function QuotaMeter({ used, total, compact = false }: { used: number; total: number; compact?: boolean }) {
  const percent = (used / total) * 100;
  const color = percent >= 98 ? ACCENT.risk : percent >= 85 ? ACCENT.yellow : ACCENT.turquoise;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", compact ? "w-64" : "w-72")} aria-label={`Almacenamiento: ${formatBytes(used)} de ${formatBytes(total)}`}>
      <div className="flex items-center justify-between gap-2 whitespace-nowrap text-xs text-muted-foreground"><span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />Almacenamiento</span><span className="tabular-nums">{formatBytes(used)} / {formatBytes(total)}</span></div>
      <Progress value={percent} color={color} />
    </div>
  );
}

function Banner({ color, icon: Icon, children, actions }: { color: string; icon: typeof CircleAlert; children: ReactNode; actions?: ReactNode }) {
  const tokens = useMotionTokens();
  return (
    <motion.div role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ background: `linear-gradient(90deg, ${tint(color, 24)}, ${tint(color, 7)})` }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: readable(color) }} />
        <p className="min-w-0 flex-1 text-sm">{children}</p>
        {actions}
      </div>
    </motion.div>
  );
}

/** Everything the scenario wants to tell the user before the files: read-only, locks, expiry and quota. */
export function FilesBanners({ config, files, onReviewExpired, onFreeSpace }: {
  config: FilesConfig;
  files: DemoFile[];
  onReviewExpired: () => void;
  onFreeSpace: () => void;
}) {
  const [requested, setRequested] = useState(false);
  const expired = files.filter((file) => file.contextRole !== null && file.validUntil !== null && new Date(file.validUntil) < new Date("2026-10-24T09:00:00Z")).length;
  const percent = (config.quota.usedBytes / config.quota.totalBytes) * 100;
  return (
    <AnimatePresence initial={false}>
      {config.readOnly ? (
        <Banner key="ro" color={ACCENT.sky} icon={Lock} actions={<Button size="sm" variant="outline" disabled={requested} onClick={() => setRequested(true)}>{requested ? "Solicitud enviada a Silviu" : "Pedir permiso de edición"}</Button>}>
          <strong>Solo lectura.</strong> Puedes ver y descargar, pero no subir archivos ni cambiar qué leen los agentes. {config.lockedFolderIds.length ? `${config.lockedFolderIds.length} carpetas no te están compartidas.` : ""}
        </Banner>
      ) : null}
      {config.lockedFileIds.length ? (
        <Banner key="locked" color={ACCENT.lilac} icon={ShieldAlert}>
          <strong>{config.lockedFileIds.length} archivos pertenecen a un proyecto privado</strong> al que no tienes acceso. Los ves en la lista, pero no su contenido.
        </Banner>
      ) : null}
      {expired > 0 ? (
        <Banner key="expired" color={ACCENT.yellow} icon={AlarmClock} actions={<Button size="sm" onClick={onReviewExpired} style={{ background: ACCENT.yellow, color: ink(ACCENT.yellow) }}>Revisar</Button>}>
          <strong>{expired} {expired === 1 ? "archivo de contexto ha caducado" : "archivos de contexto han caducado"}.</strong> Los agentes han dejado de leerlos hasta que renueves su fecha.
        </Banner>
      ) : null}
      {percent >= 85 ? (
        <Banner key="quota" color={percent >= 98 ? ACCENT.risk : ACCENT.yellow} icon={HardDrive} actions={<Button size="sm" variant="outline" onClick={onFreeSpace}><Trash2 className="h-3.5 w-3.5" />Liberar espacio</Button>}>
          <strong>Te queda {formatBytes(config.quota.totalBytes - config.quota.usedBytes)} de {formatBytes(config.quota.totalBytes)}.</strong> Los vídeos grandes pueden no caber. Borra lo que ya no uses o amplía el plan.
        </Banner>
      ) : null}
    </AnimatePresence>
  );
}

/** Replaces the preview of a file the user may not open. */
export function LockedPreview({ file, onClose }: { file: DemoFile; onClose: () => void }) {
  const tokens = useMotionTokens();
  const [requested, setRequested] = useState(false);
  return (
    <motion.aside initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-4 shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold leading-snug">{file.name}</h2><p className="text-xs text-muted-foreground">{formatBytes(file.bytes)} · subido por {file.by}</p></div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl text-center" style={{ background: `repeating-linear-gradient(135deg, ${tint(ACCENT.lilac, 14)}, ${tint(ACCENT.lilac, 14)} 8px, ${tint(ACCENT.lilac, 6)} 8px, ${tint(ACCENT.lilac, 6)} 16px)` }}>
        <Lock className="h-8 w-8" style={{ color: readable(ACCENT.lilac) }} />
        <Pill color={ACCENT.lilac}>{file.audienceLabel ?? "Proyecto privado"}</Pill>
      </div>
      <p className="text-sm">No puedes abrir este archivo porque pertenece a un proyecto del que no eres miembro. Los agentes del proyecto sí pueden leerlo.</p>
      <Button variant="outline" disabled={requested} onClick={() => setRequested(true)}>{requested ? "Solicitud enviada a Marta" : "Pedir acceso al responsable"}</Button>
    </motion.aside>
  );
}
