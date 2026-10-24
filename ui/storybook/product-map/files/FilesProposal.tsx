import { useMemo, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Bot,
  ChevronDown,
  CircleCheck,
  CloudUpload,
  File as FileIcon,
  FileText,
  Film,
  FolderClosed,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Lock,
  Music,
  Search,
  Sheet,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, SectionTitle } from "../parts";
import {
  DEMO_FILES,
  DEMO_FOLDERS,
  expiryState,
  formatBytes,
  type ContextRole,
  type DemoFile,
  type DemoFolder,
  type FileKind,
} from "./demo-data";
import { FilesBanners, LockedPreview, QuotaMeter, UploadTray, useUploadQueue } from "./FilesStates";
import { filesConfig, type FilesConfig } from "./scenarios";

export const KIND: Record<FileKind, { label: string; icon: LucideIcon; color: string }> = {
  image: { label: "Imagen", icon: ImageIcon, color: ACCENT.mint },
  video: { label: "Vídeo", icon: Film, color: ACCENT.lilac },
  document: { label: "Documento", icon: FileText, color: ACCENT.sky },
  audio: { label: "Audio", icon: Music, color: ACCENT.turquoise },
  spreadsheet: { label: "Hoja", icon: Sheet, color: ACCENT.yellow },
};

export const ROLE: Record<ContextRole, { label: string; color: string }> = {
  brand: { label: "Marca", color: ACCENT.lilac },
  offer: { label: "Oferta", color: ACCENT.mint },
  procedure: { label: "Procedimiento", color: ACCENT.sky },
  customer: { label: "Cliente", color: ACCENT.turquoise },
  other: { label: "Otro", color: ACCENT.muted },
};

const AUDIENCE = { company: "Toda la empresa", project: "Un proyecto", customer: "Un cliente" } as const;

export type Mode = "grid" | "list";
type Scope = "files" | "context";

export function Thumb({ file, size = "md" }: { file: DemoFile; size?: "sm" | "md" | "lg" }) {
  const kind = KIND[file.kind];
  const Icon = kind.icon;
  const tone = size === "lg" ? "h-40" : size === "md" ? "h-28" : "h-9 w-9";
  return (
    <div
      aria-hidden="true"
      className={cn("relative flex items-center justify-center overflow-hidden rounded-xl", tone, size !== "sm" && "w-full")}
      style={{ background: `linear-gradient(135deg, ${tint(kind.color, 34)}, ${tint(kind.color, 8)})`, color: readable(kind.color) }}
    >
      {file.kind === "image" && size !== "sm" ? (
        <span className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 30% 30%, ${tint(kind.color, 70)}, transparent 55%), radial-gradient(circle at 75% 70%, ${tint(ACCENT.sky, 60)}, transparent 50%)` }} />
      ) : null}
      {file.kind === "audio" && size !== "sm" ? (
        <span className="absolute inset-x-6 flex h-10 items-center gap-1">
          {[40, 80, 55, 95, 35, 70, 50, 85, 45, 60, 30, 75].map((height, index) => <span key={index} className="flex-1 rounded-full" style={{ height: `${height}%`, background: tint(kind.color, 60) }} />)}
        </span>
      ) : null}
      {file.kind === "audio" && size !== "sm" ? null : <Icon className={cn("relative", size === "sm" ? "h-4 w-4" : size === "md" ? "h-8 w-8" : "h-10 w-10")} />}
      {file.kind === "video" && size !== "sm" ? <span className="absolute bottom-2 right-2 rounded bg-foreground/80 px-1.5 text-xs text-background">0:38</span> : null}
    </div>
  );
}

function FolderRow({ folder, depth, active, open, hasChildren, count, locked = false, onSelect, onToggle }: {
  folder: DemoFolder; depth: number; active: boolean; open: boolean; hasChildren: boolean; count: number; locked?: boolean; onSelect: () => void; onToggle: () => void;
}) {
  const tokens = useMotionTokens();
  const color = folder.root === "in" ? ACCENT.sky : ACCENT.mint;
  return (
    <div className="relative" style={{ paddingLeft: depth * 14 }}>
      {active ? (
        <motion.span layoutId="files-folder-active" className="absolute inset-y-0 right-0 rounded-lg" style={{ left: depth * 14, background: `linear-gradient(90deg, ${tint(color, 24)}, ${tint(color, 6)})` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} />
      ) : null}
      <div className="relative flex items-center gap-1">
        <button type="button" aria-label={open ? "Plegar" : "Desplegar"} onClick={onToggle} className={cn("flex h-6 w-5 items-center justify-center text-muted-foreground", !hasChildren && "invisible")}>
          <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-3.5 w-3.5" /></motion.span>
        </button>
        <button type="button" onClick={onSelect} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors duration-(--motion-duration-fast)", active ? "font-medium" : "text-muted-foreground hover:text-foreground")}>
          {locked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" /> : open || active ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: readable(color) }} /> : <FolderClosed className="h-4 w-4 shrink-0" style={{ color: readable(color) }} />}
          <span className="min-w-0 flex-1 truncate" title={folder.name}>{folder.name}</span>
          {locked ? null : <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        </button>
      </div>
    </div>
  );
}

export function FileCard({ file, index, mode, selected, locked = false, onSelect }: { file: DemoFile; index: number; mode: Mode; selected: boolean; locked?: boolean; onSelect: () => void }) {
  const tokens = useMotionTokens();
  const kind = KIND[file.kind];
  const expiry = expiryState(file.validUntil);
  const common = {
    layout: true as const,
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger },
  };
  const badges = (
    <>
      {locked ? <Pill color={ACCENT.lilac}><Lock className="h-3 w-3" />Privado</Pill> : null}
      {file.contextRole ? <Pill color={ROLE[file.contextRole].color}><Bot className="h-3 w-3" />{ROLE[file.contextRole].label}</Pill> : null}
      {expiry === "expired" ? <Pill color={ACCENT.risk}>Caducado</Pill> : expiry === "soon" ? <Pill color={ACCENT.yellow}><AlarmClock className="h-3 w-3" />Caduca pronto</Pill> : null}
    </>
  );
  if (mode === "list") {
    return (
      <motion.button
        {...common}
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50", selected && "bg-accent/70")}
      >
        <Thumb file={file} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium">{file.name}</span>{badges}</span>
          <span className="block truncate text-xs text-muted-foreground">{kind.label} · {formatBytes(file.bytes)} · {file.by} · {file.updatedAt}</span>
        </span>
        {file.usedIn.length ? <span className="hidden text-xs text-muted-foreground sm:inline">{file.usedIn.length} {file.usedIn.length === 1 ? "tarea" : "tareas"}</span> : null}
      </motion.button>
    );
  }
  return (
    <motion.button
      {...common}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn("group flex min-w-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", selected ? "border-transparent" : "border-border")}
      style={{ boxShadow: selected ? `0 0 0 2px ${kind.color}` : undefined }}
    >
      <Thumb file={file} />
      <span className="min-w-0 px-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{formatBytes(file.bytes)} · {file.updatedAt}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">{badges}</span>
      </span>
    </motion.button>
  );
}

export function PreviewPane({ file, onClose, onChange, readOnly = false }: { file: DemoFile; onClose: () => void; onChange: (patch: Partial<DemoFile>) => void; readOnly?: boolean }) {
  const tokens = useMotionTokens();
  const kind = KIND[file.kind];
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

function DropZone({ active, onDrop, onPick }: { active: boolean; onDrop: () => void; onPick: () => void }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      initial={false}
      animate={{ borderColor: active ? ACCENT.turquoise : "var(--border)", scale: active ? 1.01 : 1 }}
      transition={{ duration: tokens.fast, ease: tokens.easeOut }}
      className="relative flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed p-4"
      style={{ background: active ? tint(ACCENT.turquoise, 14) : "transparent" }}
    >
      <motion.span animate={{ y: active ? -3 : 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex">
        <IconTile icon={active ? CloudUpload : Upload} color={ACCENT.turquoise} />
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{active ? "Suéltalo para subirlo" : "Arrastra archivos aquí"}</p>
        <p className="text-xs text-muted-foreground">PDF, imágenes, vídeo, audio o documentos. Se guardan en Entrada y los agentes los ven solo si tú lo permites.</p>
      </div>
      <Button size="sm" variant="outline" onClick={onPick}>Elegir archivos</Button>
      <button type="button" onClick={onDrop} className="sr-only">Simular subida</button>
    </motion.div>
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

/** Archivos: Entrada/Salida tree, grid or list, drag-and-drop upload, preview with agent context and versions. */
export function FilesProposal({ files: initialFiles, config: configProp }: { files: DemoFile[]; config?: FilesConfig }) {
  const tokens = useMotionTokens();
  const config = useMemo<FilesConfig>(() => configProp ?? { ...filesConfig("normal"), files: initialFiles, selectedId: initialFiles[0]?.id ?? null }, [configProp, initialFiles]);
  const folders = config.folders;
  const lockedFolders = useMemo(() => new Set(config.lockedFolderIds), [config.lockedFolderIds]);
  const lockedFiles = useMemo(() => new Set(config.lockedFileIds), [config.lockedFileIds]);
  const queue = useUploadQueue(config.uploads);
  const [limit, setLimit] = useState(48);
  const [files, setFiles] = useState(config.files);
  const [folderId, setFolderId] = useState<string>(config.folderId);
  const [open, setOpen] = useState<Set<string>>(new Set(["in", "in-clients", "out"]));
  const [mode, setMode] = useState<Mode>("grid");
  const [scope, setScope] = useState<Scope>("files");
  const [roleFilter, setRoleFilter] = useState<ContextRole | "all">("all");
  const [validity, setValidity] = useState<"all" | "valid" | "expired">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(config.selectedId);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const descendants = useMemo(() => {
    const ids = new Set<string>([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); grew = true; }
    }
    return ids;
  }, [folderId, folders]);
  const countIn = (id: string) => {
    const ids = new Set<string>([id]);
    let grew = true;
    while (grew) { grew = false; for (const folder of folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); grew = true; } }
    return files.filter((file) => ids.has(file.folderId)).length;
  };

  const needle = query.trim().toLowerCase();
  const contextFiles = files.filter((file) => file.contextRole !== null);
  const visible = (scope === "context" ? contextFiles : files.filter((file) => descendants.has(file.folderId)))
    .filter((file) => !needle || file.name.toLowerCase().includes(needle))
    .filter((file) => scope !== "context" || roleFilter === "all" || file.contextRole === roleFilter)
    .filter((file) => scope !== "context" || validity === "all" || (validity === "expired" ? expiryState(file.validUntil) === "expired" : expiryState(file.validUntil) !== "expired"));
  const selected = visible.find((file) => file.id === selectedId) ?? null;
  const folder = folders.find((candidate) => candidate.id === folderId);
  const folderLocked = scope === "files" && lockedFolders.has(folderId);
  const shown = visible.slice(0, limit);
  const expiring = files.filter((file) => ["soon", "expired"].includes(expiryState(file.validUntil))).length;
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (config.readOnly) return;
    simulateUpload(event.dataTransfer?.files.length || 1);
  }
  function simulateUpload(count: number) {
    const targetFolder = folder && folder.root === "in" ? folder.id : "in";
    const created: DemoFile[] = Array.from({ length: count }, (_, index) => ({
      id: `new-${Date.now()}-${index}`, name: count === 1 ? "Nuevo archivo.pdf" : `Archivo nuevo ${index + 1}.pdf`, folderId: targetFolder, kind: "document", contentType: "application/pdf",
      bytes: 1.2 * 1024 * 1024, by: "Tú", updatedAt: "ahora", agentVisible: false, contextRole: null, audienceKind: "company", audienceLabel: null, validUntil: null,
      usedIn: [], versions: [{ number: 1, by: "Tú", at: "ahora", note: null, bytes: 1.2 * 1024 * 1024 }],
    }));
    setFiles((current) => [...created, ...current]);
    setScope("files");
    setFolderId(targetFolder);
    setSelectedId(created[0]!.id);
    const left = config.quota.totalBytes - config.quota.usedBytes;
    const lowSpace = left < config.quota.totalBytes * 0.15 ? " Te quedan " + formatBytes(left) + " libres." : "";
    setToast((count === 1 ? "1 archivo subido" : count + " archivos subidos") + " a " + folders.find((candidate) => candidate.id === targetFolder)?.name + ". Por defecto los agentes aún no pueden leerlo." + lowSpace);
    window.setTimeout(() => setToast(null), 4000);
  }

  const roots = folders.filter((candidate) => candidate.parentId === null);
  const renderFolder = (item: DemoFolder, depth: number): React.ReactNode => {
    const children = folders.filter((candidate) => candidate.parentId === item.id);
    const isOpen = open.has(item.id);
    return (
      <div key={item.id}>
        <FolderRow folder={item} depth={depth} active={scope === "files" && folderId === item.id} open={isOpen} hasChildren={children.length > 0} count={countIn(item.id)} locked={lockedFolders.has(item.id)}
          onSelect={() => { setScope("files"); setFolderId(item.id); setLimit(48); setSelectedId(null); }}
          onToggle={() => setOpen((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />
        <AnimatePresence initial={false}>
          {isOpen && children.length ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
              {children.map((child) => renderFolder(child, depth + 1))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={handleDrop}>
      <input ref={picker} type="file" multiple className="sr-only" aria-label="Elegir archivos" onChange={(event) => { if (event.target.files?.length) simulateUpload(event.target.files.length); }} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Archivos</h1>
          {files.length ? <p className="text-sm text-muted-foreground">{files.length} archivos · {formatBytes(totalBytes)}{expiring ? ` · ${expiring} caducan o han caducado` : ""}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {files.length ? <QuotaMeter used={config.quota.usedBytes} total={config.quota.totalBytes} compact /> : null}
          <Button disabled={config.readOnly} title={config.readOnly ? "Solo lectura: no puedes subir archivos" : undefined} onClick={() => picker.current?.click()}><Upload className="h-4 w-4" />Subir archivos</Button>
        </div>
      </header>

      {files.length === 0 ? <EmptyFiles onPick={() => picker.current?.click()} /> : <>
        <FilesBanners config={config} files={files}
          onReviewExpired={() => { setScope("context"); setValidity("expired"); setSelectedId(null); }}
          onFreeSpace={() => { const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0]!; setScope("files"); setFolderId(biggest.folderId); setSelectedId(biggest.id); setToast("Empieza por el más pesado: " + biggest.name + " (" + formatBytes(biggest.bytes) + ")."); window.setTimeout(() => setToast(null), 4000); }} />
        <UploadTray queue={queue} />
        {config.readOnly ? null : <DropZone active={dragging} onDrop={() => simulateUpload(1)} onPick={() => picker.current?.click()} />}

        <div className="grid min-w-0 gap-4 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,320px)]">
          <nav aria-label="Carpetas" className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border p-2 lg:self-start">
            <button type="button" onClick={() => { setScope("context"); setSelectedId(null); }} className={cn("relative mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast)", scope === "context" ? "font-medium" : "text-muted-foreground hover:text-foreground")}
              style={scope === "context" ? { background: `linear-gradient(90deg, ${tint(ACCENT.lilac, 26)}, ${tint(ACCENT.lilac, 6)})` } : undefined}>
              <Bot className="h-4 w-4" style={{ color: readable(ACCENT.lilac) }} /><span className="flex-1">Contexto para agentes</span><span className="text-xs text-muted-foreground tabular-nums">{contextFiles.length}</span>
            </button>
            <LayoutGroup id="files-tree">{roots.map((root) => renderFolder(root, 0))}</LayoutGroup>
          </nav>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{scope === "context" ? "Contexto para agentes" : folder?.name}</p>
                <p className="text-xs text-muted-foreground">{scope === "context" ? "Lo que tus agentes leen para trabajar" : folder?.root === "in" ? "Lo que subes para tu equipo" : "Lo que produce tu equipo"}</p>
              </div>
              <div className="flex min-w-40 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm focus-within:border-foreground/30">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar archivo" aria-label="Buscar archivo" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Vista">
                {([["grid", LayoutGrid, "Rejilla"], ["list", List, "Lista"]] as const).map(([id, Icon, label]) => (
                  <button key={id} type="button" aria-label={label} aria-pressed={mode === id} onClick={() => setMode(id)} className={cn("relative rounded-md p-1.5 transition-colors duration-(--motion-duration-fast)", mode === id ? "text-foreground" : "text-muted-foreground")}>
                    {mode === id ? <motion.span layoutId="files-mode-pill" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                    <Icon className="relative h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {scope === "context" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {(["all", ...Object.keys(ROLE)] as const).map((role) => (
                  <button key={role} type="button" aria-pressed={roleFilter === role} onClick={() => setRoleFilter(role as ContextRole | "all")}
                    className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", roleFilter === role ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                    style={roleFilter === role ? { background: tint(role === "all" ? ACCENT.lilac : ROLE[role as ContextRole].color, 30) } : undefined}>
                    {role === "all" ? "Todos los roles" : ROLE[role as ContextRole].label}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-border" />
                {([["all", "Cualquier fecha"], ["valid", "Vigentes"], ["expired", "Caducados"]] as const).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={validity === id} onClick={() => setValidity(id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", validity === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                    style={validity === id ? { background: tint(id === "expired" ? ACCENT.risk : ACCENT.yellow, 28) } : undefined}>{label}</button>
                ))}
              </div>
            ) : null}

            {folderLocked ? (
              <Panel className="items-center py-12 text-center">
                <IconTile icon={Lock} color={ACCENT.muted} />
                <p className="text-sm font-medium">No tienes acceso a esta carpeta</p>
                <p className="max-w-xs text-sm text-muted-foreground">Es de otro cliente y solo la ven las personas con quienes se ha compartido. Pídesela a quien la creó.</p>
                <Button size="sm" variant="outline">Pedir acceso</Button>
              </Panel>
            ) : visible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{scope === "context" ? "Ningún archivo de contexto con estos filtros." : "Esta carpeta está vacía. Arrastra archivos aquí."}</p>
            ) : mode === "grid" ? (
              <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {shown.map((file, index) => <FileCard key={file.id} file={file} index={index} mode="grid" selected={file.id === selectedId} locked={lockedFiles.has(file.id)} onSelect={() => setSelectedId(file.id === selectedId ? null : file.id)} />)}
                </AnimatePresence>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                <AnimatePresence mode="popLayout">
                  {shown.map((file, index) => <FileCard key={file.id} file={file} index={index} mode="list" selected={file.id === selectedId} locked={lockedFiles.has(file.id)} onSelect={() => setSelectedId(file.id === selectedId ? null : file.id)} />)}
                </AnimatePresence>
              </div>
            )}
            {!folderLocked && visible.length > shown.length ? (
              <Button variant="outline" onClick={() => setLimit(limit + 48)}>Mostrar {Math.min(48, visible.length - shown.length)} más · quedan {visible.length - shown.length}</Button>
            ) : null}
          </div>

          <div className="min-w-0 md:col-span-2 lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
            <AnimatePresence mode="wait">
              {selected && lockedFiles.has(selected.id) ? (
                <LockedPreview key={selected.id} file={selected} onClose={() => setSelectedId(null)} />
              ) : selected ? (
                <PreviewPane key={selected.id} file={selected} readOnly={config.readOnly} onClose={() => setSelectedId(null)} onChange={(patch) => setFiles((current) => current.map((file) => file.id === selected.id ? { ...file, ...patch } : file))} />
              ) : (
                <Panel className="items-center py-10 text-center"><IconTile icon={FileIcon} color={ACCENT.muted} /><p className="text-sm text-muted-foreground">Elige un archivo para ver su vista previa, su contexto y sus versiones.</p></Panel>
              )}
            </AnimatePresence>
          </div>
        </div>
      </>}

      <AnimatePresence>
        {toast ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <CircleCheck className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span>{toast}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export { DEMO_FILES };
