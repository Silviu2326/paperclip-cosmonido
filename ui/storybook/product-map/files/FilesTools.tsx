import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Clock,
  Copy,
  Download,
  FolderInput,
  FolderOpen,
  Link2,
  Send,
  Share2,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Pill } from "../parts";
import { formatBytes, type DemoFile, type DemoFolder } from "./demo-data";
import { KIND, Thumb } from "./FilesProposal";

/** Agents that can be asked to work on a file, with what each is good at. */
export const ASK_AGENTS = [
  { name: "Marta", role: "Redes y contenido", kinds: ["image", "document"] },
  { name: "Leo", role: "Vídeo y audio", kinds: ["video", "audio"] },
  { name: "Diego", role: "Propuestas y ventas", kinds: ["document", "spreadsheet"] },
] as const;

const SUGGESTIONS: Record<DemoFile["kind"], string[]> = {
  image: ["Haz un carrusel con esto", "Prepara 3 versiones para Instagram", "Descríbelo para accesibilidad"],
  video: ["Súbelo con subtítulos", "Saca 3 clips cortos", "Resume de qué trata"],
  document: ["Resúmelo en 5 puntos", "Extrae precios y plazos", "Úsalo como contexto de la próxima propuesta"],
  audio: ["Transcríbelo", "Quita los silencios", "Úsalo como música del vídeo"],
  spreadsheet: ["Resume las cifras clave", "Detecta lo que no cuadra", "Prepara un informe mensual"],
};

export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Greeting that changes with the hour; a little personality in the header. */
export function greeting(hour: number): string {
  return hour < 6 ? "Aún de madrugada" : hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
}

export function ShareDialog({ file, customers, onClose, onCreate }: { file: DemoFile | null; customers: string[]; onClose: () => void; onCreate: (link: string, who: string) => void }) {
  const [who, setWho] = useState(customers[0] ?? "");
  const [expiry, setExpiry] = useState<"7" | "30" | "never">("7");
  const [permission, setPermission] = useState<"view" | "comment" | "download">("comment");
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => { if (file) { setLink(null); setWho(file.audienceLabel ?? customers[0] ?? ""); } }, [file?.id]);
  const options = <T extends string>(items: [T, string][], value: T, set: (next: T) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => set(id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", value === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={value === id ? { background: tint(ACCENT.sky, 30) } : undefined}>{label}</button>
      ))}
    </div>
  );
  return (
    <Modal open={file !== null} onClose={onClose} title="Compartir con un cliente" description="Crea un enlace del portal del cliente. Solo ve este archivo, y puedes retirarlo cuando quieras.">
      {file ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-border p-2.5"><Thumb file={file} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{KIND[file.kind].label} · {formatBytes(file.bytes)}</p></div></div>
          <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Para quién</p>
            <div className="flex flex-wrap gap-1.5">{customers.map((name) => (
              <button key={name} type="button" aria-pressed={who === name} onClick={() => setWho(name)} className={cn("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors duration-(--motion-duration-fast)", who === name ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={who === name ? { background: tint(ACCENT.mint, 30) } : undefined}><Avatar name={name} size="xs" />{name}</button>
            ))}</div></div>
          <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Qué puede hacer</p>{options([["view", "Solo ver"], ["comment", "Ver y comentar"], ["download", "Ver y descargar"]], permission, setPermission)}</div>
          <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Caduca</p>{options([["7", "En 7 días"], ["30", "En 30 días"], ["never", "Nunca"]], expiry, setExpiry)}</div>
          <AnimatePresence initial={false}>
            {link ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: tint(ACCENT.mint, 22) }}><Link2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><code className="min-w-0 flex-1 truncate text-xs">{link}</code><Button size="sm" variant="outline" onClick={() => onCreate(link, who)}><Copy className="h-3.5 w-3.5" />Copiar</Button></div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            {link ? <Button onClick={() => onCreate(link, who)}><Check className="h-4 w-4" />Hecho</Button> : <Button disabled={!who} onClick={() => setLink(`cosmonido.app/p/${Math.random().toString(36).slice(2, 8)}`)} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}><Share2 className="h-4 w-4" />Crear enlace</Button>}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function AskAgentDialog({ files, onClose, onCreate }: { files: DemoFile[]; onClose: () => void; onCreate: (agent: string, request: string, taskId: string) => void }) {
  const first = files[0];
  const preferred = ASK_AGENTS.find((agent) => first && (agent.kinds as readonly string[]).includes(first.kind))?.name ?? ASK_AGENTS[0].name;
  const [agent, setAgent] = useState<string>(preferred);
  const [text, setText] = useState("");
  useEffect(() => { setAgent(preferred); setText(""); }, [first?.id]);
  return (
    <Modal open={files.length > 0} onClose={onClose} title="Pídele algo a un agente" description={files.length === 1 ? "Crearemos una tarea con este archivo adjunto." : `Crearemos una tarea con los ${files.length} archivos adjuntos.`}>
      {first ? (
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (text.trim()) onCreate(agent, text.trim(), `PAP-${440 + Math.floor(Math.random() * 40)}`); }}>
          <div className="flex flex-wrap gap-2">{files.slice(0, 4).map((file) => <span key={file.id} className="flex max-w-full items-center gap-2 rounded-xl border border-border p-1.5 pr-3 text-xs"><Thumb file={file} size="sm" /><span className="truncate">{file.name}</span></span>)}{files.length > 4 ? <span className="self-center text-xs text-muted-foreground">+{files.length - 4}</span> : null}</div>
          <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Quién</p>
            <div className="flex flex-wrap gap-2">{ASK_AGENTS.map((option) => (
              <button key={option.name} type="button" aria-pressed={agent === option.name} onClick={() => setAgent(option.name)} className={cn("flex items-center gap-2 rounded-xl border p-2 pr-3 text-left text-xs transition-colors duration-(--motion-duration-fast)", agent === option.name ? "border-transparent" : "border-border hover:bg-accent/50")} style={agent === option.name ? { background: tint(ACCENT.turquoise, 24), boxShadow: `inset 0 0 0 1.5px ${ACCENT.turquoise}` } : undefined}>
                <Avatar name={option.name} size="sm" /><span><span className="block text-sm font-medium">{option.name}</span><span className="text-muted-foreground">{option.role}</span></span>
              </button>
            ))}</div></div>
          <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Qué necesitas</p>
            <div className="flex flex-wrap gap-1.5">{SUGGESTIONS[first.kind].map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setText(suggestion)} className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground"><Sparkles className="h-3 w-3" />{suggestion}</button>
            ))}</div>
            <Input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={`Dile a ${agent} lo que quieres hacer…`} aria-label="Qué necesitas" />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!text.trim()} style={text.trim() ? { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) } : undefined}><Send className="h-4 w-4" />Encargar a {agent}</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

export function MoveDialog({ open, folders, current, onClose, onMove }: { open: boolean; folders: DemoFolder[]; current: string; onClose: () => void; onMove: (folderId: string) => void }) {
  const render = (parentId: string | null, depth: number): ReactNode => folders.filter((folder) => folder.parentId === parentId).map((folder) => (
    <div key={folder.id}>
      <button type="button" disabled={folder.id === current} onClick={() => onMove(folder.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/60 disabled:opacity-40" style={{ paddingLeft: 8 + depth * 16 }}>
        <FolderOpen className="h-4 w-4 shrink-0" style={{ color: readable(folder.root === "in" ? ACCENT.sky : ACCENT.mint) }} />{folder.name}{folder.id === current ? <span className="text-xs text-muted-foreground">· aquí</span> : null}
      </button>
      {render(folder.id, depth + 1)}
    </div>
  ));
  return (
    <Modal open={open} onClose={onClose} title="Mover a…" description="Elige la carpeta de destino. También puedes arrastrar los archivos sobre una carpeta.">
      <div className="max-h-72 overflow-y-auto rounded-xl border border-border p-1.5">{render(null, 0)}</div>
    </Modal>
  );
}

export function UrlDialog({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (name: string, source: string) => void }) {
  const [url, setUrl] = useState("");
  const driveFiles = ["Fotos evento otoño (Drive).zip", "Presupuesto cliente nuevo (Drive).xlsx", "Guion vídeo corporativo (Drive).docx"];
  return (
    <Modal open={open} onClose={() => { setUrl(""); onClose(); }} title="Importar a Entrada" description="Trae archivos desde otro sitio. Se guardan en Entrada y los agentes no los leen hasta que tú lo permitas.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Desde un enlace</p>
          <div className="flex gap-2"><Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" aria-label="Enlace del archivo" /><Button disabled={!/^https?:\/\//.test(url)} onClick={() => { onImport(url.split("/").filter(Boolean).pop() ?? "archivo-importado.pdf", "un enlace"); setUrl(""); }}><Download className="h-4 w-4" />Traer</Button></div></div>
        <div className="flex flex-col gap-1.5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Desde Google Drive <Pill color={ACCENT.mint}>Conectado en Apps</Pill></p>
          {driveFiles.map((name) => (
            <button key={name} type="button" onClick={() => onImport(name, "Google Drive")} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5 text-left text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/50"><span className="truncate">{name}</span><span className="text-xs text-muted-foreground">Importar</span></button>
          ))}</div>
      </div>
    </Modal>
  );
}

/** Space-bar quick look: a large preview with the facts that matter and arrows to move between files. */
export function QuickLook({ files, index, onClose, onMove, onFavorite, favorites }: { files: DemoFile[]; index: number; onClose: () => void; onMove: (next: number) => void; onFavorite: (id: string) => void; favorites: Set<string> }) {
  const tokens = useMotionTokens();
  const file = files[index];
  useEffect(() => {
    if (!file) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === " ") { event.preventDefault(); onClose(); }
      else if (event.key === "ArrowRight") onMove((index + 1) % files.length);
      else if (event.key === "ArrowLeft") onMove((index - 1 + files.length) % files.length);
    };
    // Attached on the next tick: the Space that opened the preview is still bubbling and would close it at once.
    const timer = window.setTimeout(() => window.addEventListener("keydown", onKey), 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [file?.id, index, files.length]);
  return (
    <AnimatePresence>
      {file ? (
        <motion.div role="dialog" aria-label={`Vista rápida de ${file.name}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm" onClick={onClose}>
          <motion.div key={file.id} initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} onClick={(event) => event.stopPropagation()} className="flex w-full max-w-2xl min-w-0 flex-col gap-4 rounded-3xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{file.name}</h2><p className="text-sm text-muted-foreground">{KIND[file.kind].label} · {formatBytes(file.bytes)} · {file.by} · {file.updatedAt}</p></div>
              <Button size="icon" variant="ghost" aria-label={favorites.has(file.id) ? "Quitar de favoritos" : "Añadir a favoritos"} onClick={() => onFavorite(file.id)}><Star className="h-4 w-4" style={favorites.has(file.id) ? { fill: ACCENT.yellow, color: ACCENT.yellow } : undefined} /></Button>
            </div>
            <Thumb file={file} size="lg" />
            {file.excerpt ? <p className="rounded-xl p-3 text-sm" style={{ background: tint(KIND[file.kind].color, 12) }}>{file.excerpt}</p> : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {file.usedIn.length ? <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Usado en {file.usedIn.map((task) => task.id).join(", ")}</span> : <span>Sin usar en tareas todavía</span>}
              {file.agentVisible ? <Pill color={ACCENT.lilac}><Bot className="h-3 w-3" />Los agentes lo leen</Pill> : null}
              <span className="flex-1" />
              <span>{index + 1} de {files.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex gap-1.5"><Button size="icon" variant="outline" aria-label="Anterior" disabled={files.length < 2} onClick={() => onMove((index - 1 + files.length) % files.length)}><ArrowLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Siguiente" disabled={files.length < 2} onClick={() => onMove((index + 1) % files.length)}><ArrowRight className="h-4 w-4" /></Button></div>
              <span className="hidden text-xs text-muted-foreground sm:inline">← → para pasar · Espacio o Esc para cerrar</span>
              <Button onClick={onClose}>Cerrar</Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Friendly empty folder with the next sensible step instead of a dry "vacía". */
export function EmptyFolder({ root, name, readOnly, onUpload, onNewFolder }: { root: "in" | "out"; name: string; readOnly: boolean; onUpload: () => void; onNewFolder: () => void }) {
  const tokens = useMotionTokens();
  const color = root === "in" ? ACCENT.sky : ACCENT.mint;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.span initial={{ scale: 0.7, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="relative flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${tint(color, 40)}, ${tint(color, 12)})`, color: readable(color) }}>
        <FolderOpen className="h-7 w-7" />
        <motion.span aria-hidden="true" className="absolute -right-1 -top-1" animate={tokens.base > 0 ? { rotate: [0, 12, -8, 0], scale: [1, 1.15, 1] } : undefined} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}><Sparkles className="h-4 w-4" style={{ color: ACCENT.yellow }} /></motion.span>
      </motion.span>
      <div><p className="font-semibold">{root === "out" ? "Aquí aparecerá lo que haga tu equipo" : `«${name}» está vacía`}</p><p className="text-sm text-muted-foreground">{root === "out" ? "Cuando un agente termine algo, lo verás aquí con su nombre y la tarea." : "Suelta archivos sobre esta zona o súbelos: los agentes los usarán cuando tú quieras."}</p></div>
      {root === "in" && !readOnly ? <div className="flex gap-2"><Button size="sm" onClick={onUpload}>Subir archivos</Button><Button size="sm" variant="outline" onClick={onNewFolder}><FolderInput className="h-3.5 w-3.5" />Nueva carpeta</Button></div> : null}
    </div>
  );
}

export { IconTile };
