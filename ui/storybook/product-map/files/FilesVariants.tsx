import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlarmClock,
  Bot,
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Lock,
  PanelRight,
  Play,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill } from "../parts";
import { expiryState, formatBytes, type DemoFile, type FileKind } from "./demo-data";
import { EmptyFiles, KIND, PreviewPane, Thumb } from "./FilesProposal";
import { FilesBanners, LockedPreview, QuotaMeter, UploadTray, useUploadQueue } from "./FilesStates";
import type { FilesConfig } from "./scenarios";

/* ------------------------------------------------------------------ */
/* Shared header                                                       */
/* ------------------------------------------------------------------ */

function Header({ config, files, subtitle }: { config: FilesConfig; files: DemoFile[]; subtitle: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">Archivos</h1>
        {files.length ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {files.length ? <QuotaMeter used={config.quota.usedBytes} total={config.quota.totalBytes} compact /> : null}
        <Button disabled={config.readOnly} title={config.readOnly ? "Solo lectura: no puedes subir archivos" : undefined}><Upload className="h-4 w-4" />Subir archivos</Button>
      </div>
    </header>
  );
}

const KIND_FILTERS: { id: FileKind | "all"; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "image", label: "Imágenes" },
  { id: "video", label: "Vídeos" },
  { id: "document", label: "Documentos" },
  { id: "audio", label: "Audio" },
  { id: "spreadsheet", label: "Hojas" },
];

/* ------------------------------------------------------------------ */
/* Variant B — gallery: the preview is the page                        */
/* ------------------------------------------------------------------ */

function Stage({ file, locked }: { file: DemoFile; locked: boolean }) {
  const kind = KIND[file.kind];
  const Icon = kind.icon;
  if (locked) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-2xl text-center sm:h-96" style={{ background: `repeating-linear-gradient(135deg, ${tint(ACCENT.lilac, 14)}, ${tint(ACCENT.lilac, 14)} 10px, ${tint(ACCENT.lilac, 6)} 10px, ${tint(ACCENT.lilac, 6)} 20px)` }}>
        <Lock className="h-12 w-12" style={{ color: readable(ACCENT.lilac) }} />
        <p className="text-sm font-medium">Archivo de un proyecto privado</p>
        <Pill color={ACCENT.lilac}>{file.audienceLabel ?? "Proyecto privado"}</Pill>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="relative flex h-72 items-center justify-center overflow-hidden rounded-2xl sm:h-96" style={{ background: `linear-gradient(135deg, ${tint(kind.color, 38)}, ${tint(kind.color, 8)})`, color: readable(kind.color) }}>
      {file.kind === "image" ? <span className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(circle at 28% 30%, ${tint(kind.color, 75)}, transparent 55%), radial-gradient(circle at 78% 72%, ${tint(ACCENT.sky, 65)}, transparent 50%)` }} /> : null}
      {file.kind === "audio" ? (
        <span className="absolute inset-x-10 flex h-24 items-center gap-1.5">
          {[30, 70, 45, 90, 35, 60, 80, 40, 95, 50, 65, 30, 75, 55, 85, 40, 70, 35].map((height, index) => <span key={index} className="flex-1 rounded-full" style={{ height: `${height}%`, background: tint(kind.color, 62) }} />)}
        </span>
      ) : <Icon className="relative h-20 w-20 opacity-90" />}
      {file.kind === "video" ? <span className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-foreground/80 text-background"><Play className="h-7 w-7" /></span> : null}
    </div>
  );
}

/** Gallery: one large preview with next/previous, a thumbnail strip and an optional details drawer. */
export function FilesGallery({ config }: { config: FilesConfig }) {
  const tokens = useMotionTokens();
  const queue = useUploadQueue(config.uploads);
  const lockedFiles = useMemo(() => new Set(config.lockedFileIds), [config.lockedFileIds]);
  const [files, setFiles] = useState(config.files);
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [query, setQuery] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(config.selectedId);
  const [direction, setDirection] = useState(1);
  const [details, setDetails] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const visible = files.filter((file) => (kindFilter === "all" || file.kind === kindFilter) && (!needle || file.name.toLowerCase().includes(needle)));
  const index = Math.max(0, visible.findIndex((file) => file.id === currentId));
  const current = visible[index] ?? null;
  const go = (delta: number) => {
    if (!visible.length) return;
    setDirection(delta);
    setCurrentId(visible[(index + delta + visible.length) % visible.length]!.id);
  };

  useEffect(() => {
    const node = stripRef.current?.querySelector<HTMLElement>("[aria-current='true']");
    node?.scrollIntoView({ inline: "center", block: "nearest", behavior: tokens.base > 0 ? "smooth" : "auto" });
  }, [current?.id, tokens.base]);

  if (!files.length) return <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6"><Header config={config} files={files} subtitle="" /><EmptyFiles onPick={() => undefined} /></div>;

  const countFor = (id: FileKind | "all") => files.filter((file) => id === "all" || file.kind === id).length;
  const expired = current && expiryState(current.validUntil) === "expired";

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <Header config={config} files={files} subtitle={`${files.length} archivos · ${formatBytes(files.reduce((sum, file) => sum + file.bytes, 0))}`} />
      <FilesBanners config={config} files={files} onReviewExpired={() => { const first = files.find((file) => expiryState(file.validUntil) === "expired" && file.contextRole); if (first) { setKindFilter("all"); setQuery(""); setCurrentId(first.id); } }}
        onFreeSpace={() => { const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0]!; setKindFilter("all"); setQuery(""); setCurrentId(biggest.id); }} />
      <UploadTray queue={queue} />

      <div className="flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((item) => countFor(item.id) === 0 && item.id !== "all" ? null : (
          <button key={item.id} type="button" aria-pressed={kindFilter === item.id} onClick={() => setKindFilter(item.id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", kindFilter === item.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={kindFilter === item.id ? { background: tint(item.id === "all" ? ACCENT.lilac : KIND[item.id].color, 30) } : undefined}>
            {item.label} · {countFor(item.id)}
          </button>
        ))}
        <div className="ml-auto flex min-w-40 items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm focus-within:border-foreground/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar archivo" aria-label="Buscar archivo" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button size="sm" variant={details ? "secondary" : "outline"} aria-pressed={details} onClick={() => setDetails(!details)}><PanelRight className="h-4 w-4" />Detalles</Button>
      </div>

      {!current ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Ningún archivo coincide con la búsqueda.</p>
      ) : (
        <div className={cn("grid min-w-0 gap-4", details && "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]")}>
          <div className="flex min-w-0 flex-col gap-3" tabIndex={0} aria-label="Galería: usa las flechas del teclado" onKeyDown={(event) => { if (event.key === "ArrowRight") go(1); if (event.key === "ArrowLeft") go(-1); }}>
            <div className="relative">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div key={current.id} custom={direction} initial={{ opacity: 0, x: direction * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -40 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}>
                  <Stage file={current} locked={lockedFiles.has(current.id)} />
                </motion.div>
              </AnimatePresence>
              <Button size="icon" variant="secondary" aria-label="Anterior" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full shadow-md" onClick={() => go(-1)}><ChevronLeft className="h-5 w-5" /></Button>
              <Button size="icon" variant="secondary" aria-label="Siguiente" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full shadow-md" onClick={() => go(1)}><ChevronRight className="h-5 w-5" /></Button>
              <span className="absolute bottom-3 right-3 rounded-full bg-foreground/80 px-2.5 py-0.5 text-xs tabular-nums text-background">{index + 1} / {visible.length}</span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="break-all text-lg font-semibold leading-snug">{current.name}</h2>
                <p className="text-sm text-muted-foreground">{KIND[current.kind].label} · {formatBytes(current.bytes)} · {current.by} · {current.updatedAt}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {current.contextRole ? <Pill color={ACCENT.lilac}><Bot className="h-3 w-3" />Contexto</Pill> : null}
                {expired ? <Pill color={ACCENT.risk}>Caducado</Pill> : expiryState(current.validUntil) === "soon" ? <Pill color={ACCENT.yellow}><AlarmClock className="h-3 w-3" />Caduca pronto</Pill> : null}
                <Button size="sm" variant="outline" disabled={lockedFiles.has(current.id)}>Abrir</Button>
              </div>
            </div>
            <div ref={stripRef} role="listbox" aria-label="Archivos" className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-2">
              {visible.map((file) => {
                const active = file.id === current.id;
                return (
                  <button key={file.id} type="button" role="option" aria-selected={active} aria-current={active} aria-label={file.name} title={file.name}
                    onClick={() => { setDirection(visible.indexOf(file) > index ? 1 : -1); setCurrentId(file.id); }}
                    className={cn("relative h-16 w-20 shrink-0 snap-center overflow-hidden rounded-xl transition-[transform,opacity] duration-(--motion-duration-fast)", active ? "scale-105" : "opacity-70 hover:opacity-100")}
                    style={{ boxShadow: active ? `0 0 0 2px ${KIND[file.kind].color}` : undefined }}>
                    <span className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${tint(KIND[file.kind].color, 38)}, ${tint(KIND[file.kind].color, 10)})`, color: readable(KIND[file.kind].color) }}>
                      {lockedFiles.has(file.id) ? <Lock className="h-4 w-4" /> : (() => { const Icon = KIND[file.kind].icon; return <Icon className="h-5 w-5" />; })()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {details ? (
            <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              <AnimatePresence mode="wait">
                {lockedFiles.has(current.id) ? <LockedPreview key={current.id} file={current} onClose={() => setDetails(false)} /> : (
                  <PreviewPane key={current.id} file={current} readOnly={config.readOnly} onClose={() => setDetails(false)} onChange={(patch) => setFiles((all) => all.map((file) => file.id === current.id ? { ...file, ...patch } : file))} />
                )}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — by whom the files belong to                             */
/* ------------------------------------------------------------------ */

type OwnerKind = "company" | "customer" | "project";
interface Owner { key: string; name: string; kind: OwnerKind; files: DemoFile[] }

function ownerOf(file: DemoFile): { key: string; name: string; kind: OwnerKind } {
  if (file.audienceKind === "company") return { key: "company", name: "Toda la empresa", kind: "company" };
  const name = file.audienceLabel ?? "Sin asignar";
  return { key: `${file.audienceKind}:${name}`, name, kind: file.audienceKind };
}

const OWNER_COLOR: Record<OwnerKind, string> = { company: ACCENT.lilac, customer: ACCENT.mint, project: ACCENT.sky };

function OwnerCard({ owner, index, open, lockedFiles, onToggle }: { owner: Owner; index: number; open: boolean; lockedFiles: Set<string>; onToggle: () => void }) {
  const tokens = useMotionTokens();
  const color = OWNER_COLOR[owner.kind];
  const context = owner.files.filter((file) => file.contextRole).length;
  const expiring = owner.files.filter((file) => ["soon", "expired"].includes(expiryState(file.validUntil))).length;
  const hasLocked = owner.files.some((file) => lockedFiles.has(file.id));
  return (
    <motion.button
      layout
      type="button"
      aria-pressed={open}
      onClick={onToggle}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      className={cn("group flex min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", open ? "border-transparent" : "border-border")}
      style={{ boxShadow: open ? `0 0 0 2px ${color}` : undefined, background: `linear-gradient(135deg, ${tint(color, 12)}, transparent 70%)` }}
    >
      <span className="flex min-w-0 items-center gap-3">
        {owner.kind === "company" ? <IconTile icon={Building2} color={color} /> : <Avatar name={owner.name} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold" title={owner.name}>{owner.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{owner.kind === "company" ? "Empresa" : owner.kind === "customer" ? "Cliente" : "Proyecto"} · {owner.files.length} {owner.files.length === 1 ? "archivo" : "archivos"} · {formatBytes(owner.files.reduce((sum, file) => sum + file.bytes, 0))}</span>
        </span>
      </span>
      <span className="flex gap-1.5" aria-hidden="true">
        {owner.files.slice(0, 5).map((file) => (
          <span key={file.id} className="h-9 flex-1 overflow-hidden rounded-md" style={{ background: `linear-gradient(135deg, ${tint(KIND[file.kind].color, 40)}, ${tint(KIND[file.kind].color, 10)})` }} />
        ))}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {context ? <Pill color={ACCENT.lilac}><Bot className="h-3 w-3" />{context} de contexto</Pill> : null}
        {expiring ? <Pill color={ACCENT.yellow}><AlarmClock className="h-3 w-3" />{expiring} caducan</Pill> : null}
        {hasLocked ? <Pill color={ACCENT.lilac}><Lock className="h-3 w-3" />Privado</Pill> : null}
      </span>
    </motion.button>
  );
}

/** By owner: customers, projects and the company, each with its files, instead of folders. */
export function FilesByOwner({ config }: { config: FilesConfig }) {
  const tokens = useMotionTokens();
  const queue = useUploadQueue(config.uploads);
  const lockedFiles = useMemo(() => new Set(config.lockedFileIds), [config.lockedFileIds]);
  const [files, setFiles] = useState(config.files);
  const [tab, setTab] = useState<OwnerKind | "all">("all");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(config.selectedId);
  const [rows, setRows] = useState(12);

  const owners = useMemo(() => {
    const map = new Map<string, Owner>();
    for (const file of files) {
      const meta = ownerOf(file);
      const owner = map.get(meta.key) ?? { ...meta, files: [] };
      owner.files.push(file);
      map.set(meta.key, owner);
    }
    return [...map.values()].sort((a, b) => (a.kind === "company" ? -1 : b.kind === "company" ? 1 : b.files.length - a.files.length));
  }, [files]);

  const selectedFile = files.find((file) => file.id === selectedId) ?? null;
  // Open the owner of the preselected file so the scenario's file is visible on load.
  const effectiveOpen = openKey ?? (selectedFile ? ownerOf(selectedFile).key : null);
  const needle = query.trim().toLowerCase();
  const shownOwners = owners.filter((owner) => (tab === "all" || owner.kind === tab) && (!needle || owner.name.toLowerCase().includes(needle) || owner.files.some((file) => file.name.toLowerCase().includes(needle))));
  const open = owners.find((owner) => owner.key === effectiveOpen) ?? null;
  const countFor = (kind: OwnerKind | "all") => owners.filter((owner) => kind === "all" || owner.kind === kind).length;

  if (!files.length) return <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6"><Header config={config} files={files} subtitle="" /><EmptyFiles onPick={() => undefined} /></div>;

  const tabs: { id: OwnerKind | "all"; label: string; icon: typeof Users }[] = [
    { id: "all", label: "Todos", icon: Users }, { id: "customer", label: "Clientes", icon: Users }, { id: "project", label: "Proyectos", icon: FolderKanban }, { id: "company", label: "Empresa", icon: Building2 },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <Header config={config} files={files} subtitle={`${owners.length} clientes, proyectos y áreas · ${files.length} archivos`} />
      <FilesBanners config={config} files={files}
        onReviewExpired={() => { const first = files.find((file) => expiryState(file.validUntil) === "expired" && file.contextRole); if (first) { setSelectedId(first.id); setOpenKey(ownerOf(first).key); } }}
        onFreeSpace={() => { const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0]!; setSelectedId(biggest.id); setOpenKey(ownerOf(biggest).key); }} />
      <UploadTray queue={queue} />

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((item) => (
          <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", tab === item.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={tab === item.id ? { background: tint(item.id === "all" ? ACCENT.lilac : OWNER_COLOR[item.id], 30) } : undefined}>
            <item.icon className="h-3.5 w-3.5" />{item.label} · {countFor(item.id)}
          </button>
        ))}
        <div className="ml-auto flex min-w-48 items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm focus-within:border-foreground/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar cliente, proyecto o archivo" aria-label="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div className={cn("grid min-w-0 gap-5", selectedFile && "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]")}>
        <div className="flex min-w-0 flex-col gap-5">
          {shownOwners.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nada coincide con la búsqueda.</p>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shownOwners.map((owner, index) => (
                <OwnerCard key={owner.key} owner={owner} index={index} open={owner.key === effectiveOpen} lockedFiles={lockedFiles} onToggle={() => { setOpenKey(owner.key === effectiveOpen ? "" : owner.key); setRows(12); }} />
              ))}
            </div>
          )}
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div key={open.key} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                <Panel>
                  <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: OWNER_COLOR[open.kind] }} /><span className="min-w-0 truncate">Archivos de {open.name}</span><span className="shrink-0 text-xs font-normal text-muted-foreground">{open.files.length}</span></h2>
                  <ul className="divide-y divide-border">
                    {open.files.slice(0, rows).map((file) => (
                      <li key={file.id}>
                        <button type="button" aria-pressed={file.id === selectedId} onClick={() => setSelectedId(file.id === selectedId ? null : file.id)} className={cn("flex w-full min-w-0 items-center gap-3 px-1 py-2 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50", file.id === selectedId && "bg-accent/70")}>
                          <Thumb file={file} size="sm" />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" title={file.name}>{file.name}</span><span className="block truncate text-xs text-muted-foreground">{KIND[file.kind].label} · {formatBytes(file.bytes)} · {file.updatedAt}</span></span>
                          {lockedFiles.has(file.id) ? <Pill color={ACCENT.lilac}><Lock className="h-3 w-3" />Privado</Pill> : file.contextRole ? <Pill color={ACCENT.lilac}><Bot className="h-3 w-3" /></Pill> : null}
                          {expiryState(file.validUntil) === "expired" ? <Pill color={ACCENT.risk}>Caducado</Pill> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {open.files.length > rows ? <Button variant="outline" size="sm" onClick={() => setRows(rows + 24)}>Ver {Math.min(24, open.files.length - rows)} más · quedan {open.files.length - rows}</Button> : null}
                </Panel>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        {selectedFile ? (
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <AnimatePresence mode="wait">
              {lockedFiles.has(selectedFile.id) ? <LockedPreview key={selectedFile.id} file={selectedFile} onClose={() => setSelectedId(null)} /> : (
                <PreviewPane key={selectedFile.id} file={selectedFile} readOnly={config.readOnly} onClose={() => setSelectedId(null)} onChange={(patch) => setFiles((all) => all.map((file) => file.id === selectedFile.id ? { ...file, ...patch } : file))} />
              )}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </div>
  );
}
