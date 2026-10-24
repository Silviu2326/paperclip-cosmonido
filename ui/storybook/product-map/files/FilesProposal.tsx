import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Bot,
  ChevronDown,
  CircleCheck,
  CloudUpload,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Music,
  PenTool,
  Presentation,
  Sheet,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Pill, SectionTitle } from "../parts";
import {
  DEMO_FILES,
  expiryState,
  formatBytes,
  type ContextRole,
  type DemoFile,
  type FileKind,
} from "./demo-data";

export const KIND: Record<FileKind, { label: string; icon: LucideIcon; color: string }> = {
  image: { label: "Imagen", icon: ImageIcon, color: ACCENT.mint },
  video: { label: "Vídeo", icon: Film, color: ACCENT.lilac },
  document: { label: "Documento", icon: FileText, color: ACCENT.sky },
  audio: { label: "Audio", icon: Music, color: ACCENT.turquoise },
  spreadsheet: { label: "Hoja", icon: Sheet, color: ACCENT.yellow },
};

export interface FileLook { label: string; icon: LucideIcon; color: string }

const BY_EXTENSION: Record<string, FileLook> = {
  pdf: { label: "PDF", icon: FileType, color: BRAND(9) },
  doc: { label: "Word", icon: FileText, color: BRAND(5) },
  docx: { label: "Word", icon: FileText, color: BRAND(5) },
  md: { label: "Texto", icon: FileCode, color: BRAND(7, "b") },
  txt: { label: "Texto", icon: FileText, color: BRAND(7, "b") },
  xls: { label: "Hoja de cálculo", icon: FileSpreadsheet, color: BRAND(5, "b") },
  xlsx: { label: "Hoja de cálculo", icon: FileSpreadsheet, color: BRAND(5, "b") },
  csv: { label: "Hoja de cálculo", icon: FileSpreadsheet, color: BRAND(5, "b") },
  ppt: { label: "Presentación", icon: Presentation, color: BRAND(4, "b") },
  pptx: { label: "Presentación", icon: Presentation, color: BRAND(4, "b") },
  svg: { label: "Vectorial", icon: PenTool, color: BRAND(8, "b") },
  zip: { label: "Archivo comprimido", icon: FileArchive, color: BRAND(10) },
  mp3: { label: "Audio", icon: FileAudio, color: ACCENT.turquoise },
  wav: { label: "Audio", icon: FileAudio, color: ACCENT.turquoise },
  mp4: { label: "Vídeo", icon: Film, color: BRAND(2) },
  mov: { label: "Vídeo", icon: Film, color: BRAND(2) },
  png: { label: "Imagen", icon: ImageIcon, color: ACCENT.mint },
  jpg: { label: "Imagen", icon: ImageIcon, color: ACCENT.mint },
  jpeg: { label: "Imagen", icon: ImageIcon, color: ACCENT.mint },
};

/** Finer look than `KIND`: the icon and colour follow the file extension, so a PDF, a Word and a note are told apart at a glance. */
export function fileLook(file: { name: string; kind: FileKind }): FileLook {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  return BY_EXTENSION[extension] ?? KIND[file.kind];
}

export const ROLE: Record<ContextRole, { label: string; color: string }> = {
  brand: { label: "Marca", color: ACCENT.lilac },
  offer: { label: "Oferta", color: ACCENT.mint },
  procedure: { label: "Procedimiento", color: ACCENT.sky },
  customer: { label: "Cliente", color: ACCENT.turquoise },
  other: { label: "Otro", color: ACCENT.muted },
};

const AUDIENCE = { company: "Toda la empresa", project: "Un proyecto", customer: "Un cliente" } as const;

export function Thumb({ file, size = "md" }: { file: DemoFile; size?: "sm" | "md" | "lg" }) {
  const kind = fileLook(file);
  const Icon = kind.icon;
  const tone = size === "lg" ? "h-40" : size === "md" ? "h-28" : "h-9 w-9";
  return (
    <div
      aria-hidden="true"
      className={cn("relative flex items-center justify-center overflow-hidden rounded-xl", tone, size !== "sm" && "w-full")}
      style={{ background: `linear-gradient(135deg, ${tint(kind.color, 40)}, ${tint(kind.color, 14)})`, color: readable(kind.color) }}
    >
      {file.kind === "image" && size !== "sm" ? (
        <span className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 30% 30%, ${tint(kind.color, 70)}, transparent 55%), radial-gradient(circle at 75% 70%, ${tint(ACCENT.sky, 60)}, transparent 50%)` }} />
      ) : null}
      {file.kind === "audio" && size !== "sm" ? (
        <span className="absolute inset-x-6 flex h-10 items-center gap-1">
          {[40, 80, 55, 95, 35, 70, 50, 85, 45, 60, 30, 75].map((height, index) => <span key={index} className="flex-1 rounded-full" style={{ height: `${height}%`, background: tint(kind.color, 60) }} />)}
        </span>
      ) : null}
      {file.kind === "audio" && size !== "sm" ? null : <Icon className={cn("relative", size === "sm" ? "h-5 w-5" : size === "md" ? "h-8 w-8" : "h-10 w-10")} />}
      {file.kind === "video" && size !== "sm" ? <span className="absolute bottom-2 right-2 rounded bg-foreground/80 px-1.5 text-xs text-background">0:38</span> : null}
    </div>
  );
}

export function PreviewPane({ file, onClose, onChange, readOnly = false }: { file: DemoFile; onClose: () => void; onChange: (patch: Partial<DemoFile>) => void; readOnly?: boolean }) {
  const tokens = useMotionTokens();
  const kind = fileLook(file);
  const [contextOpen, setContextOpen] = useState(file.contextRole !== null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const expiry = expiryState(file.validUntil);
  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      aria-label={`Propiedades de ${file.name}`}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="break-all text-base font-semibold leading-snug">{file.name}</h2>
          <p className="text-xs text-muted-foreground">{kind.label} · {formatBytes(file.bytes)} · v{file.versions[0]?.number}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <Thumb file={file} size="lg" />
      {expiry === "expired" && file.contextRole ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.yellow, 24) }}>
          <p className="flex items-start gap-2"><AlarmClock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.yellow) }} /><span><strong>Caducó el {new Date(file.validUntil!).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}.</strong> Los agentes ya no lo leen como contexto.</span></p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={readOnly} onClick={() => onChange({ validUntil: "2027-04-24" })} style={readOnly ? undefined : { background: ACCENT.yellow, color: ink(ACCENT.yellow) }}>Renovar 6 meses</Button>
            <Button size="sm" variant="outline" disabled={readOnly} onClick={() => onChange({ validUntil: null })}>Quitar caducidad</Button>
          </div>
        </div>
      ) : null}
      {file.excerpt ? <p className="rounded-xl p-3 text-sm" style={{ background: tint(kind.color, 10) }}>{file.excerpt}</p> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline">Abrir</Button>
        <Button size="sm" variant="outline">Descargar</Button>
      </div>

      <section className="flex flex-col gap-2">
        <button type="button" aria-expanded={contextOpen} onClick={() => setContextOpen(!contextOpen)} className="flex items-center gap-2 text-left text-sm font-medium">
          <IconTile icon={Bot} color={ACCENT.lilac} size="sm" />
          <span className="flex-1">Contexto para agentes</span>
          {file.contextRole ? <Pill color={ROLE[file.contextRole].color}>{ROLE[file.contextRole].label}</Pill> : <span className="text-xs font-normal text-muted-foreground">Sin rol</span>}
          <motion.span animate={{ rotate: contextOpen ? 180 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
        </button>
        <AnimatePresence initial={false}>
          {contextOpen ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
              <div className="flex flex-col gap-3 rounded-xl border border-border p-3 text-sm">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Qué es para los agentes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(ROLE) as ContextRole[]).map((role) => (
                      <button key={role} type="button" disabled={readOnly} aria-pressed={file.contextRole === role} onClick={() => onChange({ contextRole: file.contextRole === role ? null : role })}
                        className={cn("disabled:cursor-not-allowed disabled:opacity-60", "rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-(--motion-duration-fast)", file.contextRole === role ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                        style={file.contextRole === role ? { background: tint(ROLE[role].color, 30), color: readable(ROLE[role].color) } : undefined}>
                        {ROLE[role].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Quién lo ve</span><span className="text-right font-medium">{file.audienceLabel ?? AUDIENCE[file.audienceKind]}</span></div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Válido hasta</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {file.validUntil ? new Date(file.validUntil).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "Sin caducidad"}
                    {expiry === "expired" ? <Pill color={ACCENT.risk}>Caducado</Pill> : expiry === "soon" ? <Pill color={ACCENT.yellow}>Pronto</Pill> : null}
                  </span>
                </div>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Los agentes pueden leerlo</span>
                  <button type="button" role="switch" disabled={readOnly} aria-checked={file.agentVisible} onClick={() => onChange({ agentVisible: !file.agentVisible })}
                    className="relative h-5 w-9 rounded-full transition-colors duration-(--motion-duration-fast) disabled:cursor-not-allowed disabled:opacity-60" style={{ background: file.agentVisible ? ACCENT.mint : tint(ACCENT.muted, 35) }}>
                    <motion.span className="absolute top-0.5 h-4 w-4 rounded-full bg-background shadow" animate={{ left: file.agentVisible ? 18 : 2 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} />
                  </button>
                </label>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle color={ACCENT.sky} icon={CircleCheck}>Usado en {file.usedIn.length} {file.usedIn.length === 1 ? "tarea" : "tareas"}</SectionTitle>
        {file.usedIn.length ? file.usedIn.map((task) => (
          <p key={task.id} className="flex items-center gap-2 text-sm"><span className="shrink-0 whitespace-nowrap rounded-md px-1.5 text-xs font-medium tabular-nums" style={{ background: tint(ACCENT.sky, 22), color: readable(ACCENT.sky) }}>{task.id}</span><span className="truncate">{task.title}</span></p>
        )) : <p className="text-sm text-muted-foreground">Todavía no se usa en ninguna tarea.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <button type="button" aria-expanded={versionsOpen} onClick={() => setVersionsOpen(!versionsOpen)} className="flex items-center justify-between text-left text-sm font-medium">
          <span>Versiones <span className="text-muted-foreground">({file.versions.length})</span></span>
          <motion.span animate={{ rotate: versionsOpen ? 180 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
        </button>
        <AnimatePresence initial={false}>
          {versionsOpen ? (
            <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="relative flex flex-col gap-3 overflow-hidden pl-1">
              {file.versions.map((version, index) => (
                <li key={version.number} className="relative flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={index === 0 ? { background: ACCENT.mint, color: ink(ACCENT.mint) } : { background: tint(ACCENT.muted, 25) }}>{version.number}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{index === 0 ? "Actual" : `Versión ${version.number}`}</span><span className="text-xs text-muted-foreground">{version.by} · {version.at} · {formatBytes(version.bytes)}</span></p>
                    {version.note ? <p className="text-xs text-muted-foreground">{version.note}</p> : null}
                  </div>
                  {index > 0 ? <Button size="sm" variant="ghost" disabled={readOnly}>Restaurar</Button> : null}
                </li>
              ))}
            </motion.ol>
          ) : null}
        </AnimatePresence>
      </section>
    </motion.aside>
  );
}

export function EmptyFiles({ onPick }: { onPick: () => void }) {
  const tokens = useMotionTokens();
  const steps = [
    { icon: Sparkles, title: "Tu marca", text: "Guía de estilo y logos: los agentes los usarán en cada pieza.", color: ACCENT.lilac },
    { icon: FileText, title: "Tus tarifas", text: "Ofertas y precios para preparar propuestas.", color: ACCENT.mint },
    { icon: FolderOpen, title: "Material de clientes", text: "Fotos, briefings y accesos de cada cliente.", color: ACCENT.sky },
  ];
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.sky}, ${ACCENT.turquoise})`, color: ink(ACCENT.sky) }}>
        <CloudUpload className="h-7 w-7" />
      </motion.span>
      <div><h2 className="text-lg font-semibold">Aquí vivirán tus archivos</h2><p className="text-sm text-muted-foreground">Sube lo que tu equipo necesita saber y recoge lo que produce.</p></div>
      <div className="grid w-full max-w-2xl min-w-0 gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <motion.div key={step.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger * 2 }}
            className="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-border p-4 text-left" style={{ background: `linear-gradient(135deg, ${tint(step.color, 14)}, transparent 70%)` }}>
            <IconTile icon={step.icon} color={step.color} size="sm" />
            <p className="text-sm font-medium">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.text}</p>
          </motion.div>
        ))}
      </div>
      <Button onClick={onPick}><Upload className="h-4 w-4" />Subir archivos</Button>
    </div>
  );
}

export { DEMO_FILES };
