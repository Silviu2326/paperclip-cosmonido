import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Activity,
  AlarmClock,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  File as FileIcon,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderOutput,
  Laptop,
  LayoutGrid,
  List,
  Lock,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill } from "../parts";
import { expiryState, formatBytes, type ContextRole, type DemoFile, type DemoFolder } from "./demo-data";
import { EmptyFiles, KIND, PreviewPane, ROLE, Thumb } from "./FilesProposal";
import { FilesBanners, LockedPreview, QuotaMeter, UploadTray, useUploadQueue } from "./FilesStates";
import type { FilesConfig } from "./scenarios";

/** People who are agents: their files are "what the team did". */
const AGENT_NAMES = new Set(["Marta", "Diego", "Leo", "Nora", "Iris", "Álvaro", "Sistema"]);
const isAgent = (name: string) => AGENT_NAMES.has(name);

type Root = "in" | "out";
type SortKey = "name" | "modified" | "type" | "size" | "by";
type ViewMode = "details" | "icons" | "activity";
type Quick = null | "recent" | "context" | "expiring";

const ROOT_INFO: Record<Root, { label: string; hint: string; icon: typeof FolderInput; color: string }> = {
  in: { label: "Entrada", hint: "Lo que subes para tu equipo", icon: FolderInput, color: ACCENT.sky },
  out: { label: "Salida", hint: "Lo que produce tu equipo", icon: FolderOutput, color: ACCENT.mint },
};

/** "hace 40 min", "ayer", "hace 2 semanas"… as minutes, so columns can be sorted. */
function agoMinutes(text: string): number {
  const value = text.toLowerCase();
  const number = Number.parseInt(value.match(/\d+/)?.[0] ?? "1", 10);
  if (value.includes("ahora")) return 0;
  if (value.includes("ayer")) return 1440;
  if (value.includes("min")) return number;
  if (/\bh\b|hora/.test(value)) return number * 60;
  if (value.includes("semana")) return number * 10080;
  if (value.includes("mes")) return number * 43200;
  if (value.includes("día") || value.includes("dia")) return number * 1440;
  return 60;
}

function agoLabel(minutes: number): string {
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 1440) return `hace ${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "ayer" : days < 14 ? `hace ${days} días` : `hace ${Math.round(days / 7)} semanas`;
}

function folderChain(folders: DemoFolder[], id: string): DemoFolder[] {
  const chain: DemoFolder[] = [];
  let current = folders.find((folder) => folder.id === id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? folders.find((folder) => folder.id === current!.parentId) : undefined;
  }
  return chain;
}

const localPath = (folders: DemoFolder[], id: string) => `~/Cosmonido/${folderChain(folders, id).map((folder) => folder.name).join("/")}`;

function typeLabel(file: DemoFile): string {
  const extension = file.name.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 5 ? `${KIND[file.kind].label} ${extension}` : KIND[file.kind].label;
}

function RootSwitch({ root, counts, onChange }: { root: Root; counts: Record<Root, { total: number; today: number }>; onChange: (root: Root) => void }) {
  const tokens = useMotionTokens();
  return (
    <LayoutGroup id="files-root-switch">
      <div role="tablist" aria-label="Entrada o salida" className="grid min-w-0 grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/30 p-1.5">
        {(["in", "out"] as const).map((id) => {
          const info = ROOT_INFO[id];
          const active = root === id;
          const Icon = info.icon;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(id)}
              className={cn("relative flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-(--motion-duration-fast)", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {active ? (
                <motion.span
                  layoutId="files-root-pill"
                  className="absolute inset-0 rounded-xl bg-background shadow-sm"
                  style={{ boxShadow: `inset 0 0 0 1.5px ${info.color}, 0 1px 2px rgb(0 0 0 / 0.06)` }}
                  transition={{ duration: tokens.base, ease: tokens.easeOut }}
                />
              ) : null}
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(info.color, active ? 34 : 18), color: readable(info.color) }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{info.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{counts[id].total}</span>
                  {counts[id].today ? <span className="whitespace-nowrap"><Pill color={info.color}>{counts[id].today} hoy</Pill></span> : null}
                </span>
                <span className="hidden truncate text-xs text-muted-foreground sm:block">{info.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

type Row =
  | { kind: "folder"; folder: DemoFolder; count: number; locked: boolean }
  | { kind: "file"; file: DemoFile; place: string; locked: boolean };

const GRID = "grid items-center gap-x-3 sm:grid-cols-[22px_minmax(0,2.2fr)_110px_minmax(0,0.9fr)_80px_130px] lg:grid-cols-[22px_minmax(0,2.2fr)_110px_minmax(0,0.9fr)_80px_130px_minmax(0,1fr)] grid-cols-[22px_minmax(0,1fr)_84px]";

/** Archivos as a real file explorer: Entrada/Salida switch, address bar, tree, sortable details and what each agent did. */
export function FilesExplorer({ files: initialFiles, config }: { files: DemoFile[]; config: FilesConfig }) {
  const tokens = useMotionTokens();
  const folders = config.folders;
  const lockedFolders = useMemo(() => new Set(config.lockedFolderIds), [config.lockedFolderIds]);
  const lockedFiles = useMemo(() => new Set(config.lockedFileIds), [config.lockedFileIds]);
  const queue = useUploadQueue(config.uploads);
  // Open on the folder of the selected file, so the list and the preview agree.
  const selectedFolderId = initialFiles.find((file) => file.id === config.selectedId)?.folderId;
  const startFolder = folders.find((folder) => folder.id === (selectedFolderId ?? config.folderId)) ?? folders[0]!;
  const [files, setFiles] = useState(initialFiles);
  const [root, setRoot] = useState<Root>(startFolder.root);
  const [folderId, setFolderId] = useState(startFolder.id);
  const [history, setHistory] = useState<{ back: string[]; forward: string[] }>({ back: [], forward: [] });
  const [open, setOpen] = useState<Set<string>>(new Set(["in", "in-clients", "out"]));
  const [view, setView] = useState<ViewMode>("details");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [quick, setQuick] = useState<Quick>(null);
  const [roleFilter, setRoleFilter] = useState<ContextRole | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(config.selectedId ? [config.selectedId] : []));
  const [anchor, setAnchor] = useState<string | null>(config.selectedId);
  const [previewId, setPreviewId] = useState<string | null>(config.selectedId);
  const [limit, setLimit] = useState(60);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [menu]);

  const say = (text: string) => { setToast(text); window.setTimeout(() => setToast(null), 3600); };
  const rootId = root;
  const descendantsOf = (id: string) => {
    const ids = new Set<string>([id]);
    let grew = true;
    while (grew) { grew = false; for (const folder of folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); grew = true; } }
    return ids;
  };
  const rootIds = useMemo(() => descendantsOf(rootId), [rootId, folders]);
  const rootFiles = useMemo(() => files.filter((file) => rootIds.has(file.folderId)), [files, rootIds]);
  const countIn = (id: string) => { const ids = descendantsOf(id); return files.filter((file) => ids.has(file.folderId)).length; };
  const counts: Record<Root, { total: number; today: number }> = useMemo(() => {
    const build = (target: Root) => {
      const ids = descendantsOf(target);
      const list = files.filter((file) => ids.has(file.folderId));
      return { total: list.length, today: list.filter((file) => agoMinutes(file.updatedAt) <= 1440).length };
    };
    return { in: build("in"), out: build("out") };
  }, [files, folders]);

  const folder = folders.find((candidate) => candidate.id === folderId) ?? startFolder;
  const folderLocked = lockedFolders.has(folderId);
  const needle = query.trim().toLowerCase();
  const flat = Boolean(needle || quick || agentFilter);

  const rows: Row[] = useMemo(() => {
    let list: Row[];
    if (flat) {
      const pool = rootFiles
        .filter((file) => !needle || file.name.toLowerCase().includes(needle))
        .filter((file) => quick !== "context" || (file.contextRole !== null && (roleFilter === "all" || file.contextRole === roleFilter)))
        .filter((file) => quick !== "expiring" || ["soon", "expired"].includes(expiryState(file.validUntil)))
        .filter((file) => !agentFilter || file.by === agentFilter);
      list = pool.map((file) => ({ kind: "file", file, place: folderChain(folders, file.folderId).map((item) => item.name).join(" › "), locked: lockedFiles.has(file.id) }));
    } else {
      const subfolders: Row[] = folders.filter((candidate) => candidate.parentId === folderId).map((item) => ({ kind: "folder", folder: item, count: countIn(item.id), locked: lockedFolders.has(item.id) }));
      const here: Row[] = files.filter((file) => file.folderId === folderId).map((file) => ({ kind: "file", file, place: "", locked: lockedFiles.has(file.id) }));
      list = [...subfolders, ...here];
    }
    const value = (row: Row): string | number => {
      if (row.kind === "folder") return sort.key === "modified" ? 0 : sort.key === "size" ? row.count : row.folder.name.toLowerCase();
      const file = row.file;
      return quick === "recent" || sort.key === "modified" ? agoMinutes(file.updatedAt) : sort.key === "name" ? file.name.toLowerCase() : sort.key === "type" ? typeLabel(file) : sort.key === "size" ? file.bytes : file.by.toLowerCase();
    };
    const sorted = [...list].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      const x = value(a); const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (quick === "recent" ? 1 : sort.dir);
    });
    return sorted;
  }, [flat, needle, quick, roleFilter, agentFilter, rootFiles, files, folders, folderId, sort, lockedFiles, lockedFolders]);

  const shown = rows.slice(0, limit);
  const fileRows = rows.filter((row): row is Extract<Row, { kind: "file" }> => row.kind === "file");
  const selectedFiles = files.filter((file) => selected.has(file.id));
  const preview = files.find((file) => file.id === previewId) ?? null;
  const agentSummary = useMemo(() => {
    const map = new Map<string, { count: number; latest: number }>();
    for (const file of rootFiles) {
      if (!isAgent(file.by)) continue;
      const entry = map.get(file.by) ?? { count: 0, latest: Number.POSITIVE_INFINITY };
      map.set(file.by, { count: entry.count + 1, latest: Math.min(entry.latest, agoMinutes(file.updatedAt)) });
    }
    return [...map.entries()].sort((a, b) => a[1].latest - b[1].latest);
  }, [rootFiles]);
  const events = useMemo(() => rootFiles.flatMap((file) => file.versions.map((version) => ({ file, version }))).sort((a, b) => agoMinutes(a.version.at) - agoMinutes(b.version.at)).slice(0, 40), [rootFiles]);

  function go(id: string, record = true) {
    if (record && id !== folderId) setHistory((current) => ({ back: [...current.back, folderId], forward: [] }));
    setFolderId(id);
    setQuick(null); setAgentFilter(null); setQuery("");
    setSelected(new Set()); setPreviewId(null); setLimit(60);
    const target = folders.find((candidate) => candidate.id === id);
    if (target) setRoot(target.root);
    setOpen((current) => new Set([...current, ...folderChain(folders, id).map((item) => item.id)]));
  }
  function switchRoot(next: Root) { if (next !== root) go(next); }
  function goBack() { const previous = history.back.at(-1); if (!previous) return; setHistory({ back: history.back.slice(0, -1), forward: [folderId, ...history.forward] }); go(previous, false); }
  function goForward() { const next = history.forward[0]; if (!next) return; setHistory({ back: [...history.back, folderId], forward: history.forward.slice(1) }); go(next, false); }
  function goUp() { if (folder.parentId) go(folder.parentId); }
  function openQuick(next: Quick) { setQuick(quick === next ? null : next); setAgentFilter(null); setQuery(""); setSelected(new Set()); setPreviewId(null); setLimit(60); }

  function select(row: Row, event?: MouseEvent | KeyboardEvent) {
    if (row.kind === "folder") { go(row.folder.id); return; }
    const id = row.file.id;
    const multi = event && (event.ctrlKey || event.metaKey);
    const range = event?.shiftKey && anchor;
    setSelected((current) => {
      if (range) {
        const ids = fileRows.map((item) => item.file.id);
        const [from, to] = [ids.indexOf(anchor!), ids.indexOf(id)].sort((a, b) => a - b);
        return new Set(ids.slice(from, to! + 1));
      }
      const next = new Set(multi ? current : []);
      if (multi && next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (!range) setAnchor(id);
    setPreviewId(multi ? null : id);
  }
  function toggleCheck(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setAnchor(id); setPreviewId(null);
  }
  function sortBy(key: SortKey) { setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : 1 })); }

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
    else if (event.key === "Backspace" || (event.altKey && event.key === "ArrowLeft")) { event.preventDefault(); if (event.altKey) goBack(); else goUp(); }
  }

  function simulateUpload(count: number) {
    if (config.readOnly) return;
    const target = folder.root === "in" ? folder.id : "in";
    const created: DemoFile[] = Array.from({ length: count }, (_, index) => ({
      id: `new-${Date.now()}-${index}`, name: count === 1 ? "Nuevo archivo.pdf" : `Archivo nuevo ${index + 1}.pdf`, folderId: target, kind: "document", contentType: "application/pdf",
      bytes: 1.2 * 1024 * 1024, by: "Tú", updatedAt: "ahora", agentVisible: false, contextRole: null, audienceKind: "company", audienceLabel: null, validUntil: null,
      usedIn: [], versions: [{ number: 1, by: "Tú", at: "ahora", note: null, bytes: 1.2 * 1024 * 1024 }],
    }));
    setFiles((current) => [...created, ...current]);
    go(target);
    setSelected(new Set([created[0]!.id])); setPreviewId(created[0]!.id);
    say(`${count === 1 ? "1 archivo subido" : `${count} archivos subidos`} a ${folders.find((item) => item.id === target)?.name}. Por defecto los agentes aún no pueden leerlo.`);
  }
  function handleDrop(event: DragEvent) { event.preventDefault(); setDragging(false); simulateUpload(event.dataTransfer?.files.length || 1); }

  const path = localPath(folders, folderId);
  const crumbs = folderChain(folders, folderId);
  const header = (key: SortKey, label: string, className?: string) => (
    <button type="button" onClick={() => sortBy(key)} className={cn("flex items-center gap-1 truncate text-left text-xs font-medium text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground", className)}>
      {label}
      {sort.key === key ? <ArrowDown className={cn("h-3 w-3 transition-transform duration-(--motion-duration-fast)", sort.dir === -1 && "rotate-180")} /> : null}
    </button>
  );

  const renderTree = (item: DemoFolder, depth: number): ReactNode => {
    const children = folders.filter((candidate) => candidate.parentId === item.id);
    const isOpen = open.has(item.id);
    const active = !flat && folderId === item.id;
    const info = ROOT_INFO[item.root];
    return (
      <div key={item.id}>
        <div className="relative flex items-center" style={{ paddingLeft: depth * 12 }}>
          {active ? <motion.span layoutId="files-tree-active" className="absolute inset-y-0 right-0 rounded-lg" style={{ left: depth * 12, background: `linear-gradient(90deg, ${tint(info.color, 26)}, ${tint(info.color, 6)})` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
          <button type="button" aria-label={isOpen ? "Plegar" : "Desplegar"} onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className={cn("relative flex h-7 w-5 items-center justify-center text-muted-foreground", !children.length && "invisible")}>
            <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-3.5 w-3.5" /></motion.span>
          </button>
          <button type="button" onClick={() => go(item.id)} className={cn("relative flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm", active ? "font-medium" : "text-muted-foreground hover:text-foreground")}>
            {lockedFolders.has(item.id) ? <Lock className="h-4 w-4 shrink-0" /> : isOpen || active ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: readable(info.color) }} /> : <FolderClosed className="h-4 w-4 shrink-0" style={{ color: readable(info.color) }} />}
            <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
            {lockedFolders.has(item.id) ? null : <span className="text-xs tabular-nums text-muted-foreground">{countIn(item.id)}</span>}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {isOpen && children.length ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
              {children.map((child) => renderTree(child, depth + 1))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const empty = files.length === 0;
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.bytes, 0);
  const rootColor = ROOT_INFO[root].color;

  return (
    <div className="relative flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6" onDragOver={(event) => { if (config.readOnly) return; event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={handleDrop}>
      <input ref={picker} type="file" multiple className="sr-only" aria-label="Elegir archivos" onChange={(event) => { if (event.target.files?.length) simulateUpload(event.target.files.length); }} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Archivos</h1>
          {files.length ? <p className="text-sm text-muted-foreground">{files.length} archivos{counts.out.today ? ` · tu equipo ha creado ${counts.out.today} hoy` : ""}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {files.length ? <QuotaMeter used={config.quota.usedBytes} total={config.quota.totalBytes} compact /> : null}
          <div className="relative">
            <Button variant="outline" aria-expanded={computerOpen} onClick={() => setComputerOpen(!computerOpen)}><Laptop className="h-4 w-4" />En tu ordenador</Button>
            <AnimatePresence>
              {computerOpen ? (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="absolute right-0 z-30 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-lg">
                  <p className="text-sm font-medium">Esta carpeta en tu ordenador</p>
                  <code className="break-all rounded-lg bg-muted px-2.5 py-1.5 text-xs">{path}</code>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: ACCENT.mint }} />Sincronizada · actualizada hace 2 min</p>
                  <p className="text-xs text-muted-foreground">Lo que tu equipo crea en Salida aparece aquí, y lo que dejes en Entrada lo ven los agentes.</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setComputerOpen(false); say(`Abriendo ${path} en tu explorador de archivos`); }}><ExternalLink className="h-3.5 w-3.5" />Abrir carpeta</Button>
                    <Button size="sm" variant="outline" onClick={() => { setComputerOpen(false); say("Ruta copiada"); }}><Copy className="h-3.5 w-3.5" />Copiar ruta</Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <Button disabled={config.readOnly} title={config.readOnly ? "Solo lectura: no puedes subir archivos" : undefined} onClick={() => picker.current?.click()}><Upload className="h-4 w-4" />Subir</Button>
        </div>
      </header>

      {empty ? <EmptyFiles onPick={() => picker.current?.click()} /> : <>
        <RootSwitch root={root} counts={counts} onChange={switchRoot} />
        <FilesBanners config={config} files={files}
          onReviewExpired={() => { switchRoot("in"); setQuick("expiring"); }}
          onFreeSpace={() => { const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0]!; go(biggest.folderId); setSelected(new Set([biggest.id])); setPreviewId(biggest.id); say(`Empieza por el más pesado: ${biggest.name} (${formatBytes(biggest.bytes)}).`); }} />
        <UploadTray queue={queue} />

        {root === "out" && agentSummary.length ? (
          <section aria-label="Lo que han hecho tus agentes" className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.mint, 12)}, transparent 60%)` }}>
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Bot className="h-4 w-4" />Qué han hecho tus agentes</span>
            {agentSummary.map(([name, info]) => (
              <button key={name} type="button" aria-pressed={agentFilter === name} onClick={() => { setAgentFilter(agentFilter === name ? null : name); setQuick(null); setQuery(""); setSelected(new Set()); setPreviewId(null); }}
                className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors duration-(--motion-duration-fast)", agentFilter === name ? "border-transparent font-medium" : "border-border hover:bg-accent/50")}
                style={agentFilter === name ? { background: tint(ACCENT.mint, 30) } : undefined}>
                <Avatar name={name} size="xs" />{name}<span className="tabular-nums text-muted-foreground">{info.count}</span><span className="hidden text-muted-foreground sm:inline">· {agoLabel(info.latest)}</span>
              </button>
            ))}
          </section>
        ) : null}

        <div className="relative grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,320px)]">
          <nav aria-label="Carpetas" className="hidden min-w-0 flex-col gap-1 rounded-2xl border border-border p-2 md:flex md:self-start">
            <p className="px-2 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">Accesos rápidos</p>
            {([["recent", "Recientes", Clock, ACCENT.sky], ["context", "Contexto para agentes", Bot, ACCENT.lilac], ["expiring", "Caducan pronto", AlarmClock, ACCENT.yellow]] as const).map(([id, label, Icon, color]) => (
              <button key={id} type="button" aria-pressed={quick === id} onClick={() => openQuick(id)} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast)", quick === id ? "font-medium" : "text-muted-foreground hover:text-foreground")} style={quick === id ? { background: `linear-gradient(90deg, ${tint(color, 26)}, ${tint(color, 6)})` } : undefined}>
                <Icon className="h-4 w-4" style={{ color: readable(color) }} />{label}
              </button>
            ))}
            <p className="px-2 pb-0.5 pt-3 text-xs font-medium text-muted-foreground">{ROOT_INFO[root].label}</p>
            <LayoutGroup id="files-tree">{folders.filter((item) => item.parentId === null && item.root === root).map((item) => renderTree(item, 0))}</LayoutGroup>
          </nav>

          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5">
                <Button size="icon" variant="ghost" aria-label="Atrás" disabled={!history.back.length} onClick={goBack}><ArrowLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Adelante" disabled={!history.forward.length} onClick={goForward}><ArrowRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Subir un nivel" disabled={!folder.parentId} onClick={goUp}><ArrowUp className="h-4 w-4" /></Button>
              </div>
              <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-xl border border-border px-2 py-1 text-sm">
                {crumbs.map((crumb, index) => (
                  <span key={crumb.id} className={cn("min-w-0 items-center gap-0.5", index === crumbs.length - 1 && !flat ? "flex" : "hidden sm:flex")}>
                    {index > 0 ? <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" /> : null}
                    <button type="button" onClick={() => go(crumb.id)} className={cn("truncate rounded-md px-1.5 py-0.5 transition-colors duration-(--motion-duration-fast) hover:bg-accent/60", index === crumbs.length - 1 && !flat ? "font-medium" : "text-muted-foreground")}>{crumb.name}</button>
                  </span>
                ))}
                {flat ? <span className="flex items-center gap-0.5"><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate px-1.5 font-medium">{needle ? `Búsqueda: ${query}` : agentFilter ? `Creado por ${agentFilter}` : quick === "recent" ? "Recientes" : quick === "context" ? "Contexto para agentes" : "Caducan pronto"}</span></span> : null}
              </nav>
              <div className="flex basis-full items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm focus-within:border-foreground/30 sm:basis-52 sm:flex-none">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder={`Buscar en ${ROOT_INFO[root].label}`} aria-label="Buscar archivo" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(60); }} />
                {query ? <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button> : null}
              </div>
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Vista">
                {([["details", List, "Detalles"], ["icons", LayoutGrid, "Iconos"], ...(root === "out" ? [["activity", Activity, "Actividad"] as const] : [])] as const).map(([id, Icon, label]) => (
                  <button key={id} type="button" aria-label={label} title={label} aria-pressed={view === id} onClick={() => setView(id)} className={cn("relative rounded-md p-1.5 transition-colors duration-(--motion-duration-fast)", view === id ? "text-foreground" : "text-muted-foreground")}>
                    {view === id ? <motion.span layoutId="files-view-pill" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                    <Icon className="relative h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {quick === "context" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {(["all", ...Object.keys(ROLE)] as const).map((role) => (
                  <button key={role} type="button" aria-pressed={roleFilter === role} onClick={() => setRoleFilter(role as ContextRole | "all")} className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", roleFilter === role ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={roleFilter === role ? { background: tint(role === "all" ? ACCENT.lilac : ROLE[role as ContextRole].color, 30) } : undefined}>
                    {role === "all" ? "Todos los roles" : ROLE[role as ContextRole].label}
                  </button>
                ))}
              </div>
            ) : null}

            <AnimatePresence initial={false}>
              {selectedFiles.length > 1 ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: tint(rootColor, 18) }}>
                    <span className="font-medium">{selectedFiles.length} seleccionados</span><span className="text-muted-foreground">{formatBytes(totalBytes)}</span>
                    <span className="flex-1" />
                    <Button size="sm" variant="outline" onClick={() => say(`Descargando ${selectedFiles.length} archivos como .zip`)}><Download className="h-3.5 w-3.5" />Descargar</Button>
                    <Button size="sm" variant="outline" disabled={config.readOnly} onClick={() => say("Elige la carpeta de destino")}><FolderInput className="h-3.5 w-3.5" />Mover</Button>
                    <Button size="sm" variant="outline" disabled={config.readOnly} onClick={() => { setFiles((current) => current.filter((file) => !selected.has(file.id))); setSelected(new Set()); say("Movidos a la papelera. Puedes recuperarlos 30 días."); }}><Trash2 className="h-3.5 w-3.5" />Eliminar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Quitar selección</Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {folderLocked && !flat ? (
              <Panel className="items-center py-12 text-center">
                <IconTile icon={Lock} color={ACCENT.muted} />
                <p className="text-sm font-medium">No tienes acceso a esta carpeta</p>
                <p className="max-w-xs text-sm text-muted-foreground">Es de otro cliente y solo la ven las personas con quienes se ha compartido. Pídesela a quien la creó.</p>
                <Button size="sm" variant="outline">Pedir acceso</Button>
              </Panel>
            ) : view === "activity" && root === "out" && !flat ? (
              <ol className="flex flex-col gap-1 rounded-2xl border border-border p-2" aria-label="Actividad reciente de tus agentes">
                {events.map(({ file, version }, index) => (
                  <motion.li key={`${file.id}-${version.number}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 10) * tokens.stagger }}>
                    <button type="button" onClick={() => { setPreviewId(file.id); setSelected(new Set([file.id])); }} className={cn("flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50", previewId === file.id && "bg-accent/70")}>
                      <Avatar name={version.by} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm"><span className="font-medium">{version.by}</span> {version.number === 1 ? "creó" : "actualizó"} <span className="font-medium">{file.name}</span>{version.number > 1 ? ` (v${version.number})` : ""}</span>
                        <span className="block truncate text-xs text-muted-foreground">{version.note ?? `${typeLabel(file)} · ${formatBytes(version.bytes)}`}{file.usedIn[0] ? ` · ${file.usedIn[0].id}` : ""}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{version.at}</span>
                    </button>
                  </motion.li>
                ))}
              </ol>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{flat ? "Nada coincide con esto." : "Esta carpeta está vacía."}</p>
            ) : view === "icons" ? (
              <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-3">
                {shown.map((row, index) => row.kind === "folder" ? (
                  <button key={row.folder.id} type="button" onClick={() => go(row.folder.id)} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border p-3 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md">
                    <IconTile icon={row.locked ? Lock : FolderClosed} color={rootColor} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.folder.name}</span><span className="text-xs text-muted-foreground">{row.locked ? "Privada" : `${row.count} elementos`}</span></span>
                  </button>
                ) : (
                  <motion.button key={row.file.id} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
                    onClick={(event) => select(row, event)} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, row }); }}
                    className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", selected.has(row.file.id) ? "border-transparent" : "border-border")}
                    style={{ boxShadow: selected.has(row.file.id) ? `0 0 0 2px ${KIND[row.file.kind].color}` : undefined }}>
                    <Thumb file={row.file} />
                    <span className="min-w-0 px-1"><span className="block truncate text-sm font-medium">{row.file.name}</span><span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><Avatar name={row.file.by} size="xs" />{row.file.by} · {row.file.updatedAt}</span></span>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div ref={listRef} onKeyDown={onListKey} className="min-w-0 overflow-hidden rounded-2xl border border-border">
                <div className={cn(GRID, "border-b border-border bg-muted/30 px-3 py-2")}>
                  <span />
                  {header("name", "Nombre")}
                  {header("modified", "Modificado", "justify-self-start")}
                  <span className="hidden sm:block">{header("type", "Tipo")}</span>
                  <span className="hidden sm:block">{header("size", "Tamaño")}</span>
                  <span className="hidden sm:block">{header("by", "Creado por")}</span>
                  <span className="hidden text-xs font-medium text-muted-foreground lg:block">Tarea</span>
                </div>
                <div className="divide-y divide-border">
                  {shown.map((row, index) => {
                    if (row.kind === "folder") {
                      return (
                        <motion.button key={row.folder.id} data-row type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: tokens.fast, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger * 0.5 }}
                          onClick={() => go(row.folder.id)} className={cn(GRID, "w-full px-3 py-2 text-left outline-none transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:bg-accent/60")}>
                          <span />
                          <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">{row.locked ? <Lock className="h-5 w-5 shrink-0 text-muted-foreground" /> : <FolderClosed className="h-5 w-5 shrink-0" style={{ color: readable(rootColor) }} />}<span className="truncate">{row.folder.name}</span></span>
                          <span className="text-xs text-muted-foreground">—</span>
                          <span className="hidden text-xs text-muted-foreground sm:block">Carpeta</span>
                          <span className="hidden text-xs text-muted-foreground sm:block">{row.locked ? "Privada" : `${row.count} elem.`}</span>
                          <span className="hidden text-xs text-muted-foreground sm:block">—</span>
                          <span className="hidden lg:block" />
                        </motion.button>
                      );
                    }
                    const { file } = row;
                    const isSelected = selected.has(file.id);
                    const expiry = expiryState(file.validUntil);
                    return (
                      <motion.div key={file.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: tokens.fast, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger * 0.5 }}
                        className={cn(GRID, "relative px-3 py-1.5 transition-colors duration-(--motion-duration-fast) hover:bg-accent/40", isSelected && "bg-accent/70")}
                        onContextMenu={(event: MouseEvent) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, row }); }}>
                        <input type="checkbox" aria-label={`Seleccionar ${file.name}`} checked={isSelected} onChange={() => toggleCheck(file.id)} className="h-4 w-4 accent-current" />
                        <button data-row type="button" onClick={(event) => select(row, event)} className="flex min-w-0 items-center gap-2.5 rounded-md py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Thumb file={file} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium">{file.name}</span>{row.locked ? <Pill color={ACCENT.lilac}><Lock className="h-3 w-3" />Privado</Pill> : null}{file.contextRole ? <Pill color={ROLE[file.contextRole].color}><Bot className="h-3 w-3" /></Pill> : null}{expiry === "expired" ? <Pill color={ACCENT.risk}>Caducado</Pill> : expiry === "soon" ? <Pill color={ACCENT.yellow}><AlarmClock className="h-3 w-3" /></Pill> : null}</span>
                            {row.place ? <span className="block truncate text-xs text-muted-foreground">{row.place}</span> : null}
                          </span>
                        </button>
                        <span className="truncate text-xs text-muted-foreground">{file.updatedAt}</span>
                        <span className="hidden truncate text-xs text-muted-foreground sm:block">{typeLabel(file)}</span>
                        <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{formatBytes(file.bytes)}</span>
                        <span className="hidden min-w-0 items-center gap-1.5 text-xs sm:flex"><Avatar name={file.by} size="xs" /><span className="truncate">{file.by}</span>{isAgent(file.by) ? <Bot className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}</span>
                        <span className="hidden truncate text-xs text-muted-foreground lg:block">{file.usedIn[0] ? `${file.usedIn[0].id}${file.usedIn.length > 1 ? ` +${file.usedIn.length - 1}` : ""}` : "—"}</span>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                  <span>{rows.length} elementos{selectedFiles.length ? ` · ${selectedFiles.length} seleccionado${selectedFiles.length === 1 ? "" : "s"} (${formatBytes(totalBytes)})` : ""}</span>
                  <span className="hidden sm:inline">Clic derecho para más acciones · ↑ ↓ para moverte · Retroceso sube un nivel</span>
                </div>
              </div>
            )}
            {rows.length > shown.length && view !== "activity" ? <Button variant="outline" onClick={() => setLimit(limit + 60)}>Mostrar {Math.min(60, rows.length - shown.length)} más · quedan {rows.length - shown.length}</Button> : null}
          </div>

          <div className="min-w-0 md:col-span-2 lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
            <AnimatePresence mode="wait">
              {preview && lockedFiles.has(preview.id) ? (
                <LockedPreview key={preview.id} file={preview} onClose={() => setPreviewId(null)} />
              ) : preview ? (
                <PreviewPane key={preview.id} file={preview} readOnly={config.readOnly} onClose={() => setPreviewId(null)} onChange={(patch) => setFiles((current) => current.map((file) => file.id === preview.id ? { ...file, ...patch } : file))} />
              ) : (
                <Panel className="items-center py-10 text-center"><IconTile icon={FileIcon} color={ACCENT.muted} /><p className="text-sm text-muted-foreground">Elige un archivo para ver su vista previa, quién lo creó, su contexto y sus versiones.</p></Panel>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {dragging ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed" style={{ borderColor: ACCENT.turquoise, background: tint(ACCENT.turquoise, 16) }}>
                <span className="rounded-xl bg-background px-4 py-2 text-sm font-medium shadow-md">Suelta para subir a {folder.root === "in" ? folder.name : "Entrada"}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </>}

      <AnimatePresence>
        {menu ? (
          <motion.div role="menu" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="fixed z-50 flex w-56 flex-col rounded-xl border border-border bg-background p-1 text-sm shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={(event) => event.stopPropagation()}>
            {menu.row.kind === "file" ? [
              { label: "Ver detalles", icon: FileIcon, run: () => { setPreviewId(menu.row.kind === "file" ? menu.row.file.id : null); } },
              { label: "Copiar ruta", icon: Copy, run: () => say("Ruta copiada: " + localPath(folders, menu.row.kind === "file" ? menu.row.file.folderId : folderId) + "/" + (menu.row.kind === "file" ? menu.row.file.name : "")) },
              { label: "Mostrar en tu ordenador", icon: Laptop, run: () => say("Abriendo la carpeta en tu explorador de archivos") },
              { label: "Descargar", icon: Download, run: () => say("Descargando…") },
              { label: "Cambiar nombre", icon: Pencil, run: () => say("Escribe el nuevo nombre"), disabled: config.readOnly },
              { label: "Eliminar", icon: Trash2, run: () => { const id = menu.row.kind === "file" ? menu.row.file.id : ""; setFiles((current) => current.filter((file) => file.id !== id)); setPreviewId(null); say("Movido a la papelera"); }, disabled: config.readOnly },
            ].map((item) => (
              <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { item.run(); setMenu(null); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/60 disabled:opacity-40">
                <item.icon className="h-4 w-4 text-muted-foreground" />{item.label}
              </button>
            )) : null}
          </motion.div>
        ) : null}
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
