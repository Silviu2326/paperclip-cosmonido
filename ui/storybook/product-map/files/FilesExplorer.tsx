import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
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
  Eye,
  File as FileIcon,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  Laptop,
  MoreHorizontal,
  LayoutGrid,
  List,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill } from "../parts";
import { DEMO_NOW, expiryState, formatBytes, type ContextRole, type DemoFile, type DemoFolder, type FileKind } from "./demo-data";
import { EmptyFiles, KIND, PreviewPane, ROLE, Thumb } from "./FilesProposal";
import { FilesBanners, LockedPreview, QuotaMeter, UploadTray, useUploadQueue } from "./FilesStates";
import { AskAgentDialog, EmptyFolder, greeting, MoveDialog, QuickLook, ShareDialog, UrlDialog } from "./FilesTools";
import type { FilesConfig } from "./scenarios";

/** People who are agents: their files are "what the team did". */
const AGENT_NAMES = new Set(["Marta", "Diego", "Leo", "Nora", "Iris", "Álvaro", "Sistema"]);
const isAgent = (name: string) => AGENT_NAMES.has(name);
const CUSTOMERS = ["Clínica Dental Sonrisa", "Yoga Bahía", "Estudio Arquitectura Norte", "Panadería La Espiga", "Taller Mecánico Ruedas"];

type Root = "in" | "out";
type SortKey = "name" | "modified" | "type" | "size" | "by";
type ViewMode = "details" | "icons" | "activity";
type Quick = null | "recent" | "context" | "expiring" | "favorites" | "trash";
type GroupBy = "none" | "type" | "by" | "date";
type Who = "all" | "mine" | "agents";
type TrashedFile = DemoFile & { from: string };

const ROOT_INFO: Record<Root, { label: string; hint: string; icon: LucideIcon; color: string }> = {
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

function dateBucket(minutes: number): string {
  return minutes <= 1440 ? "Hoy y ayer" : minutes <= 10080 ? "Esta semana" : minutes <= 43200 ? "Este mes" : "Más antiguos";
}

/** Client folders show the client's colour avatar instead of a plain folder, so you spot them at a glance. */
function FolderGlyph({ folder, color, open = false, locked = false, size = "sm" }: { folder: DemoFolder; color: string; open?: boolean; locked?: boolean; size?: "xs" | "sm" }) {
  if (locked) return <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (folder.parentId === "in-clients") return <Avatar name={folder.name} size={size === "xs" ? "xs" : "sm"} />;
  const Icon = open ? FolderOpen : FolderClosed;
  return <Icon className={size === "xs" ? "h-4 w-4 shrink-0" : "h-5 w-5 shrink-0"} style={{ color: readable(color) }} />;
}

function NewBadge() {
  const tokens = useMotionTokens();
  return (
    <motion.span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium"
      style={{ background: tint(ACCENT.yellow, 30), color: readable(ACCENT.yellow) }}
      animate={tokens.base > 0 ? { boxShadow: [`0 0 0 0 ${tint(ACCENT.yellow, 55)}`, `0 0 0 5px ${tint(ACCENT.yellow, 0)}`] } : undefined}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
    >
      <Sparkles className="h-3 w-3" />Nuevo
    </motion.span>
  );
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
            <button key={id} role="tab" aria-selected={active} onClick={() => onChange(id)} className={cn("relative flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-(--motion-duration-fast)", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {active ? <motion.span layoutId="files-root-pill" className="absolute inset-0 rounded-xl bg-background shadow-sm" style={{ boxShadow: `inset 0 0 0 1.5px ${info.color}, 0 1px 2px rgb(0 0 0 / 0.06)` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(info.color, active ? 34 : 18), color: readable(info.color) }}><Icon className="h-5 w-5" /></span>
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
type Item = { type: "group"; label: string; count: number } | { type: "row"; row: Row };

const GRID = "grid items-center gap-x-3 grid-cols-[22px_minmax(0,1fr)_84px] sm:grid-cols-[22px_minmax(0,1fr)_100px_130px_76px]";

const TYPE_CHIPS: [FileKind | "all", string][] = [["all", "Todo"], ["image", "Imágenes"], ["video", "Vídeos"], ["document", "Documentos"], ["audio", "Audio"], ["spreadsheet", "Hojas"]];

/** Archivos as a lively file explorer: Entrada/Salida, tree, sortable details, drag to move, trash, favourites, quick look, share and ask-an-agent. */
export function FilesExplorer({ files: initialFiles, config }: { files: DemoFile[]; config: FilesConfig }) {
  const tokens = useMotionTokens();
  const [folders, setFolders] = useState(config.folders);
  const lockedFolders = useMemo(() => new Set(config.lockedFolderIds), [config.lockedFolderIds]);
  const lockedFiles = useMemo(() => new Set(config.lockedFileIds), [config.lockedFileIds]);
  const queue = useUploadQueue(config.uploads);
  // Open on the folder of the selected file, so the list and the preview agree.
  const selectedFolderId = initialFiles.find((file) => file.id === config.selectedId)?.folderId;
  const startFolder = folders.find((folder) => folder.id === (selectedFolderId ?? config.folderId)) ?? folders[0]!;
  const [files, setFiles] = useState(initialFiles);
  const [trash, setTrash] = useState<TrashedFile[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFiles.filter((file) => ["f2", "f8"].includes(file.id)).map((file) => file.id)));
  const [root, setRoot] = useState<Root>(startFolder.root);
  const [folderId, setFolderId] = useState(startFolder.id);
  const [history, setHistory] = useState<{ back: string[]; forward: string[] }>({ back: [], forward: [] });
  const [open, setOpen] = useState<Set<string>>(new Set(["in", "in-clients", "out"]));
  const [view, setView] = useState<ViewMode>("details");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [quick, setQuick] = useState<Quick>(null);
  const [roleFilter, setRoleFilter] = useState<ContextRole | "all">("all");
  const [typeFilter, setTypeFilter] = useState<FileKind | "all">("all");
  const [who, setWho] = useState<Who>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const [dragging, setDragging] = useState(false);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [shareFile, setShareFile] = useState<DemoFile | null>(null);
  const [askFiles, setAskFiles] = useState<DemoFile[]>([]);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [look, setLook] = useState<number | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const picker = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!menu && !importOpen && !filtersOpen && !bulkOpen && !computerOpen) return;
    const close = () => { setMenu(null); setImportOpen(false); setFiltersOpen(false); setBulkOpen(false); setComputerOpen(false); };
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [menu, importOpen, filtersOpen, bulkOpen, computerOpen]);

  const say = (text: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 3600);
  };
  const flashIds = (ids: string[]) => { setFlash(new Set(ids)); window.setTimeout(() => setFlash(new Set()), 2400); };
  const descendantsOf = (id: string) => {
    const ids = new Set<string>([id]);
    let grew = true;
    while (grew) { grew = false; for (const folder of folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); grew = true; } }
    return ids;
  };
  const rootIds = useMemo(() => descendantsOf(root), [root, folders]);
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
  const filtering = typeFilter !== "all" || who !== "all";
  const flat = Boolean(needle || quick || agentFilter);

  const items: Item[] = useMemo(() => {
    const keep = (file: DemoFile) =>
      (typeFilter === "all" || file.kind === typeFilter) && (who === "all" || (who === "agents" ? isAgent(file.by) : !isAgent(file.by)));
    let list: Row[];
    if (quick === "trash") {
      list = trash.filter(keep).map((file) => ({ kind: "file", file, place: `Estaba en ${file.from}`, locked: false }));
    } else if (flat) {
      const pool = rootFiles
        .filter((file) => !needle || file.name.toLowerCase().includes(needle))
        .filter((file) => quick !== "context" || (file.contextRole !== null && (roleFilter === "all" || file.contextRole === roleFilter)))
        .filter((file) => quick !== "expiring" || ["soon", "expired"].includes(expiryState(file.validUntil)))
        .filter((file) => quick !== "favorites" || favorites.has(file.id))
        .filter((file) => !agentFilter || file.by === agentFilter)
        .filter(keep);
      list = pool.map((file) => ({ kind: "file", file, place: folderChain(folders, file.folderId).map((item) => item.name).join(" › "), locked: lockedFiles.has(file.id) }));
    } else {
      const subfolders: Row[] = folders.filter((candidate) => candidate.parentId === folderId).map((item) => ({ kind: "folder", folder: item, count: countIn(item.id), locked: lockedFolders.has(item.id) }));
      const here: Row[] = files.filter((file) => file.folderId === folderId && keep(file)).map((file) => ({ kind: "file", file, place: "", locked: lockedFiles.has(file.id) }));
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
    if (groupBy === "none" || view !== "details") return sorted.map((row) => ({ type: "row", row }));
    const out: Item[] = [];
    const folderRows = sorted.filter((row) => row.kind === "folder");
    if (folderRows.length) { out.push({ type: "group", label: "Carpetas", count: folderRows.length }); folderRows.forEach((row) => out.push({ type: "row", row })); }
    const buckets = new Map<string, Row[]>();
    for (const row of sorted) {
      if (row.kind !== "file") continue;
      const label = groupBy === "type" ? KIND[row.file.kind].label : groupBy === "by" ? (isAgent(row.file.by) ? `${row.file.by} (agente)` : row.file.by) : dateBucket(agoMinutes(row.file.updatedAt));
      buckets.set(label, [...(buckets.get(label) ?? []), row]);
    }
    for (const [label, rows] of buckets) { out.push({ type: "group", label, count: rows.length }); rows.forEach((row) => out.push({ type: "row", row })); }
    return out;
  }, [flat, needle, quick, roleFilter, typeFilter, who, groupBy, view, agentFilter, rootFiles, files, trash, favorites, folders, folderId, sort, lockedFiles, lockedFolders]);

  const rows = items.filter((item): item is Extract<Item, { type: "row" }> => item.type === "row").map((item) => item.row);
  const shownItems = useMemo(() => { let seen = 0; return items.filter((item) => item.type === "group" ? seen < limit : ++seen <= limit); }, [items, limit]);
  const shown = shownItems.filter((item): item is Extract<Item, { type: "row" }> => item.type === "row").map((item) => item.row);
  const fileRows = rows.filter((row): row is Extract<Row, { kind: "file" }> => row.kind === "file");
  const lookFiles = fileRows.filter((row) => !row.locked).map((row) => row.file);
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
  const insights = useMemo(() => {
    const outIds = descendantsOf("out");
    const newFromTeam = files.filter((file) => outIds.has(file.folderId) && agoMinutes(file.updatedAt) <= 1440).length;
    const expiring = files.filter((file) => ["soon", "expired"].includes(expiryState(file.validUntil))).length;
    const heavy = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 2);
    const total = files.reduce((sum, file) => sum + file.bytes, 0) || 1;
    return { newFromTeam, expiring, heavy, heavyShare: Math.round((heavy.reduce((sum, file) => sum + file.bytes, 0) / total) * 100) };
  }, [files, folders]);

  function reset(options: { keepQuick?: boolean } = {}) {
    if (!options.keepQuick) setQuick(null);
    setAgentFilter(null); setQuery(""); setSelected(new Set()); setPreviewId(null); setLimit(60); setCreating(false); setRenaming(null);
  }
  function go(id: string, record = true) {
    if (record && id !== folderId) setHistory((current) => ({ back: [...current.back, folderId], forward: [] }));
    setFolderId(id);
    reset();
    const target = folders.find((candidate) => candidate.id === id);
    if (target) setRoot(target.root);
    if (target?.parentId && view === "activity") setView("details");
    setOpen((current) => new Set([...current, ...folderChain(folders, id).map((item) => item.id)]));
  }
  // Salida opens on what the team did; Entrada opens on the folders.
  function switchRoot(next: Root) { if (next !== root) { go(next); setView(next === "out" ? "activity" : "details"); } }
  function goBack() { const previous = history.back.at(-1); if (!previous) return; setHistory({ back: history.back.slice(0, -1), forward: [folderId, ...history.forward] }); go(previous, false); }
  function goForward() { const next = history.forward[0]; if (!next) return; setHistory({ back: [...history.back, folderId], forward: history.forward.slice(1) }); go(next, false); }
  function goUp() { if (folder.parentId) go(folder.parentId); }
  function openQuick(next: Quick) { reset({ keepQuick: true }); setQuick(quick === next ? null : next); }

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
    setPreviewId(multi ? null : quick === "trash" ? null : id);
  }
  function toggleCheck(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setAnchor(id); setPreviewId(null);
  }
  function sortBy(key: SortKey) { setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : 1 })); }
  const toggleFavorite = (id: string) => setFavorites((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  function removeFiles(ids: string[]) {
    if (config.readOnly || !ids.length) return;
    const removed = files.filter((file) => ids.includes(file.id));
    const where = (file: DemoFile) => folders.find((item) => item.id === file.folderId)?.name ?? "Entrada";
    setFiles((current) => current.filter((file) => !ids.includes(file.id)));
    setTrash((current) => [...removed.map((file) => ({ ...file, from: where(file) })), ...current]);
    setSelected(new Set()); setPreviewId(null);
    say(removed.length === 1 ? `«${removed[0]!.name}» está en la papelera` : `${removed.length} archivos en la papelera`, () => {
      setFiles((current) => [...removed, ...current]); setTrash((current) => current.filter((file) => !ids.includes(file.id))); flashIds(ids);
    });
  }
  function restore(file: TrashedFile) {
    const { from: _from, ...plain } = file;
    setTrash((current) => current.filter((item) => item.id !== file.id));
    setFiles((current) => [plain, ...current]);
    flashIds([file.id]);
    say(`«${file.name}» ha vuelto a ${file.from}`);
  }
  function moveFiles(ids: string[], targetId: string) {
    const target = folders.find((item) => item.id === targetId);
    if (!target || config.readOnly) return;
    if (lockedFolders.has(targetId)) { say("No tienes acceso a esa carpeta"); return; }
    const before = new Map(files.filter((file) => ids.includes(file.id)).map((file) => [file.id, file.folderId]));
    const moving = [...before.keys()].filter((id) => before.get(id) !== targetId);
    if (!moving.length) return;
    setFiles((current) => current.map((file) => moving.includes(file.id) ? { ...file, folderId: targetId } : file));
    flashIds(moving);
    say(`${moving.length === 1 ? "1 archivo movido" : `${moving.length} archivos movidos`} a ${target.name}`, () => {
      setFiles((current) => current.map((file) => before.has(file.id) ? { ...file, folderId: before.get(file.id)! } : file));
    });
    setSelected(new Set()); setPreviewId(null);
  }
  function createFolder(name: string) {
    const clean = name.trim() || "Carpeta nueva";
    const created: DemoFolder = { id: `new-folder-${Date.now()}`, name: clean, parentId: folderId, root: folder.root };
    setFolders((current) => [...current, created]);
    setOpen((current) => new Set([...current, folderId]));
    setCreating(false);
    flashIds([created.id]);
    say(`Carpeta «${clean}» creada`);
  }
  function rename(id: string, name: string) {
    const clean = name.trim();
    setRenaming(null);
    if (!clean) return;
    if (folders.some((item) => item.id === id)) setFolders((current) => current.map((item) => item.id === id ? { ...item, name: clean } : item));
    else setFiles((current) => current.map((file) => file.id === id ? { ...file, name: clean } : file));
    flashIds([id]);
  }
  function simulateUpload(count: number, label?: string, source?: string) {
    if (config.readOnly) return;
    const target = folder.root === "in" ? folder.id : "in";
    const created: DemoFile[] = Array.from({ length: count }, (_, index) => ({
      id: `new-${Date.now()}-${index}`, name: label ?? (count === 1 ? "Nuevo archivo.pdf" : `Archivo nuevo ${index + 1}.pdf`), folderId: target, kind: "document", contentType: "application/pdf",
      bytes: 1.2 * 1024 * 1024, by: "Tú", updatedAt: "ahora", agentVisible: false, contextRole: null, audienceKind: "company", audienceLabel: null, validUntil: null,
      usedIn: [], versions: [{ number: 1, by: "Tú", at: "ahora", note: source ? `Importado desde ${source}` : null, bytes: 1.2 * 1024 * 1024 }],
    }));
    setFiles((current) => [...created, ...current]);
    go(target);
    setSelected(new Set([created[0]!.id])); setPreviewId(created[0]!.id);
    flashIds(created.map((file) => file.id));
    say(`${count === 1 ? "1 archivo subido" : `${count} archivos subidos`} a ${folders.find((item) => item.id === target)?.name}. Por defecto los agentes aún no pueden leerlo.`);
  }
  function askAgent(agent: string, request: string, taskId: string) {
    const ids = askFiles.map((file) => file.id);
    setFiles((current) => current.map((file) => ids.includes(file.id) ? { ...file, usedIn: [{ id: taskId, title: request }, ...file.usedIn] } : file));
    setAskFiles([]);
    say(`Tarea ${taskId} creada: ${agent} se pone con «${request}»`);
  }

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" && target.getAttribute("type") !== "checkbox") return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
    const index = buttons.findIndex((button) => button === document.activeElement);
    const fileId = (document.activeElement as HTMLElement | null)?.dataset.fileId;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
    else if (event.key === "Backspace" || (event.altKey && event.key === "ArrowLeft")) { event.preventDefault(); if (event.altKey) goBack(); else goUp(); }
    else if (event.key === " " && fileId) { event.preventDefault(); const at = lookFiles.findIndex((file) => file.id === fileId); if (at >= 0) setLook(at); }
    else if (event.key === "F2" && fileId) { event.preventDefault(); setRenaming(fileId); }
    else if (event.key === "Delete" && (selected.size || fileId)) { event.preventDefault(); removeFiles(selected.size ? [...selected] : [fileId!]); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected(new Set(fileRows.map((row) => row.file.id))); setPreviewId(null); }
  }
  function handleDrop(event: DragEvent) { event.preventDefault(); setDragging(false); if (!dragIds) simulateUpload(event.dataTransfer?.files.length || 1); }

  const path = localPath(folders, folderId);
  const crumbs = folderChain(folders, folderId);
  const header = (key: SortKey, label: string, className?: string) => (
    <button type="button" onClick={() => sortBy(key)} className={cn("flex items-center gap-1 truncate text-left text-xs font-medium text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground", className)}>
      {label}
      {sort.key === key ? <ArrowDown className={cn("h-3 w-3 transition-transform duration-(--motion-duration-fast)", sort.dir === -1 && "rotate-180")} /> : null}
    </button>
  );
  const dropProps = (id: string) => dragIds ? {
    onDragOver: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); setDropTarget(id); },
    onDragLeave: () => setDropTarget((current) => current === id ? null : current),
    onDrop: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); setDropTarget(null); moveFiles(dragIds, id); setDragIds(null); },
  } : {};
  const renameInput = (id: string, initial: string) => (
    <input autoFocus defaultValue={initial} aria-label="Nuevo nombre" className="min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 py-0.5 text-sm outline-none"
      onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") rename(id, event.currentTarget.value); if (event.key === "Escape") setRenaming(null); }}
      onBlur={(event) => rename(id, event.currentTarget.value)} />
  );

  const renderTree = (item: DemoFolder, depth: number): ReactNode => {
    const children = folders.filter((candidate) => candidate.parentId === item.id);
    const isOpen = open.has(item.id);
    const active = !flat && folderId === item.id;
    const info = ROOT_INFO[item.root];
    const over = dropTarget === item.id;
    return (
      <div key={item.id}>
        <div className="relative flex items-center rounded-lg transition-colors duration-(--motion-duration-fast)" style={{ paddingLeft: depth * 12, background: over ? tint(ACCENT.turquoise, 28) : undefined, boxShadow: over ? `inset 0 0 0 1.5px ${ACCENT.turquoise}` : undefined }} {...dropProps(item.id)}>
          {active ? <motion.span layoutId="files-tree-active" className="absolute inset-y-0 right-0 rounded-lg" style={{ left: depth * 12, background: `linear-gradient(90deg, ${tint(info.color, 26)}, ${tint(info.color, 6)})` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
          <button type="button" aria-label={isOpen ? "Plegar" : "Desplegar"} onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className={cn("relative flex h-7 w-5 items-center justify-center text-muted-foreground", !children.length && "invisible")}>
            <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-3.5 w-3.5" /></motion.span>
          </button>
          <button type="button" onClick={() => go(item.id)} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, row: { kind: "folder", folder: item, count: countIn(item.id), locked: lockedFolders.has(item.id) } }); }} className={cn("relative flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm", active ? "font-medium" : "text-muted-foreground hover:text-foreground")}>
            <FolderGlyph folder={item} color={info.color} open={isOpen || active} locked={lockedFolders.has(item.id)} size="xs" />
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

  const renderRow = (row: Row, index: number): ReactNode => {
    if (row.kind === "folder") {
      const over = dropTarget === row.folder.id;
      return (
        <motion.div key={row.folder.id} data-row-wrap initial={{ opacity: 0 }} animate={{ opacity: 1, backgroundColor: over ? tint(ACCENT.turquoise, 28) : flash.has(row.folder.id) ? tint(ACCENT.yellow, 30) : "rgba(0,0,0,0)" }} transition={{ duration: tokens.fast, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger * 0.5 }}
          className={cn(GRID, "px-3 py-1.5 hover:bg-accent/40")} style={{ boxShadow: over ? `inset 0 0 0 1.5px ${ACCENT.turquoise}` : undefined }}
          onContextMenu={(event: MouseEvent) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, row }); }} {...dropProps(row.folder.id)}>
          <span />
          <span className="flex min-w-0 items-center gap-2.5 py-0.5">
            <FolderGlyph folder={row.folder} color={ROOT_INFO[row.folder.root].color} locked={row.locked} />
            {renaming === row.folder.id ? renameInput(row.folder.id, row.folder.name) : <button data-row type="button" onClick={() => go(row.folder.id)} className="min-w-0 flex-1 truncate rounded-md text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{row.folder.name}</button>}
          </span>
          <span className="text-xs text-muted-foreground">—</span>
          <span className="hidden text-xs text-muted-foreground sm:block">—</span>
          <span className="hidden text-xs text-muted-foreground sm:block">{row.locked ? "Privada" : `${row.count} elem.`}</span>
        </motion.div>
      );
    }
    const { file } = row;
    const isSelected = selected.has(file.id);
    const expiry = expiryState(file.validUntil);
    const minutes = agoMinutes(file.updatedAt);
    const trashed = quick === "trash";
    return (
      <div key={file.id} draggable={!trashed && !config.readOnly && !row.locked} onDragStart={(event: DragEvent) => { const ids = selected.has(file.id) ? [...selected] : [file.id]; event.dataTransfer.setData("text/plain", ids.join(",")); event.dataTransfer.effectAllowed = "move"; setDragIds(ids); setDragging(false); }} onDragEnd={() => { setDragIds(null); setDropTarget(null); }}
        onContextMenu={(event: MouseEvent) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, row }); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: dragIds?.includes(file.id) ? 0.45 : 1, backgroundColor: flash.has(file.id) ? tint(ACCENT.yellow, 34) : "rgba(0,0,0,0)" }} transition={{ duration: flash.has(file.id) ? tokens.slow : tokens.fast, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger * 0.5 }}
        className={cn(GRID, "group relative px-3 py-1.5 transition-colors duration-(--motion-duration-fast) hover:bg-accent/40", isSelected && "bg-accent/70")}>
        <input type="checkbox" aria-label={`Seleccionar ${file.name}`} checked={isSelected} onChange={() => toggleCheck(file.id)} className="h-4 w-4 accent-current" />
        <span className="flex min-w-0 items-center gap-2.5">
          <button data-row data-file-id={file.id} type="button" onClick={(event) => select(row, event)} onDoubleClick={() => { const at = lookFiles.findIndex((item) => item.id === file.id); if (at >= 0) setLook(at); }} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Thumb file={file} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {renaming === file.id ? renameInput(file.id, file.name) : <span className="truncate text-sm font-medium">{file.name}</span>}
                {expiry === "expired" ? <Pill color={ACCENT.risk}>Caducado</Pill> : expiry === "soon" ? <Pill color={ACCENT.yellow}><AlarmClock className="h-3 w-3" />Caduca pronto</Pill> : row.locked ? <Pill color={ACCENT.lilac}><Lock className="h-3 w-3" />Privado</Pill> : minutes <= 180 && !trashed ? <NewBadge /> : null}
              </span>
              {row.place ? <span className="block truncate text-xs text-muted-foreground">{row.place}</span> : null}
            </span>
          </button>
          {trashed ? null : <button type="button" aria-label={favorites.has(file.id) ? "Quitar de favoritos" : "Añadir a favoritos"} aria-pressed={favorites.has(file.id)} onClick={() => toggleFavorite(file.id)} className={cn("shrink-0 rounded-md p-1 transition-opacity duration-(--motion-duration-fast) hover:bg-accent", favorites.has(file.id) ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100")}><Star className="h-3.5 w-3.5" style={favorites.has(file.id) ? { fill: ACCENT.yellow, color: ACCENT.yellow } : undefined} /></button>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{trashed ? <Button size="sm" variant="outline" onClick={() => restore(file as TrashedFile)}><RotateCcw className="h-3 w-3" />Restaurar</Button> : file.updatedAt}</span>
        <span className="hidden min-w-0 items-center gap-1.5 text-xs sm:flex"><Avatar name={file.by} size="xs" /><span className="truncate">{file.by}</span></span>
        <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{formatBytes(file.bytes)}</span>
      </motion.div>
      </div>
    );
  };

  const empty = files.length === 0 && trash.length === 0;
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.bytes, 0);
  const rootColor = ROOT_INFO[root].color;
  const oneFile = selectedFiles.length === 1 ? selectedFiles[0]! : null;
  const activeFilters = (typeFilter !== "all" ? 1 : 0) + (who !== "all" ? 1 : 0) + (groupBy !== "none" ? 1 : 0) + (quick === "context" || quick === "expiring" ? 1 : 0);
  const quickLabels: Record<Exclude<Quick, null>, string> = { recent: "Recientes", context: "Contexto para agentes", expiring: "Caducan pronto", favorites: "Favoritos", trash: "Papelera" };

  const menuItems = (row: Row): { label: string; icon: LucideIcon; run: () => void; disabled?: boolean }[] => {
    if (row.kind === "folder") {
      return [
        { label: "Abrir", icon: FolderOpen, run: () => go(row.folder.id) },
        { label: "Nueva carpeta aquí", icon: FolderPlus, run: () => { go(row.folder.id); setCreating(true); }, disabled: config.readOnly },
        { label: "Copiar ruta", icon: Copy, run: () => say(`Ruta copiada: ${localPath(folders, row.folder.id)}`) },
        { label: "Mostrar en tu ordenador", icon: Laptop, run: () => say("Abriendo la carpeta en tu explorador de archivos") },
        { label: "Cambiar nombre", icon: Pencil, run: () => setRenaming(row.folder.id), disabled: config.readOnly },
      ];
    }
    const file = row.file;
    const at = lookFiles.findIndex((item) => item.id === file.id);
    return [
      { label: "Vista rápida", icon: Eye, run: () => { if (at >= 0) setLook(at); }, disabled: at < 0 },
      { label: "Pedir a un agente", icon: Send, run: () => setAskFiles(selected.has(file.id) && selectedFiles.length > 1 ? selectedFiles : [file]) },
      { label: "Compartir con un cliente", icon: Share2, run: () => setShareFile(file) },
      { label: favorites.has(file.id) ? "Quitar de favoritos" : "Añadir a favoritos", icon: Star, run: () => toggleFavorite(file.id) },
      { label: "Copiar ruta", icon: Copy, run: () => say(`Ruta copiada: ${localPath(folders, file.folderId)}/${file.name}`) },
      { label: "Mostrar en tu ordenador", icon: Laptop, run: () => say("Abriendo la carpeta en tu explorador de archivos") },
      { label: "Descargar", icon: Download, run: () => say("Descargando…") },
      { label: "Mover a…", icon: FolderInput, run: () => setMoveIds([file.id]), disabled: config.readOnly },
      { label: "Cambiar nombre", icon: Pencil, run: () => setRenaming(file.id), disabled: config.readOnly },
      { label: "Eliminar", icon: Trash2, run: () => removeFiles(selected.has(file.id) ? [...selected] : [file.id]), disabled: config.readOnly },
    ];
  };

  return (
    <div className="relative flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6" onDragOver={(event) => { if (config.readOnly || dragIds || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={handleDrop}>
      <input ref={picker} type="file" multiple className="sr-only" aria-label="Elegir archivos" onChange={(event) => { if (event.target.files?.length) simulateUpload(event.target.files.length); }} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Archivos</h1>
          {files.length ? <p className="text-sm text-muted-foreground">{greeting(9)}, Silviu.{insights.newFromTeam ? ` Tu equipo ha dejado ${insights.newFromTeam} ${insights.newFromTeam === 1 ? "archivo nuevo" : "archivos nuevos"} desde ayer.` : " Todo tranquilo por aquí."}</p> : null}
        </div>
        <div className="relative" onClick={(event) => event.stopPropagation()}>
          <Button disabled={config.readOnly} title={config.readOnly ? "Solo lectura: no puedes subir archivos" : undefined} aria-expanded={importOpen} onClick={() => setImportOpen(!importOpen)}><Upload className="h-4 w-4" />Subir<ChevronDown className="h-3.5 w-3.5" /></Button>
          <AnimatePresence>
            {importOpen ? (
              <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="absolute right-0 z-30 mt-2 flex w-64 flex-col rounded-xl border border-border bg-background p-1 text-sm shadow-lg">
                {([["Subir archivos", Upload, () => picker.current?.click()], ["Subir una carpeta", FolderInput, () => say("Elige la carpeta de tu ordenador")], ["Importar desde Drive o un enlace", Download, () => setUrlOpen(true)], ["Nueva carpeta", FolderPlus, () => setCreating(true)]] as [string, LucideIcon, () => void][]).map(([label, Icon, run]) => (
                  <button key={label} role="menuitem" onClick={() => { setImportOpen(false); run(); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/60"><Icon className="h-4 w-4 text-muted-foreground" />{label}</button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      {empty ? <EmptyFiles onPick={() => picker.current?.click()} /> : <>
        <RootSwitch root={root} counts={counts} onChange={switchRoot} />
        <FilesBanners config={config} files={files}
          onReviewExpired={() => { switchRoot("in"); setQuick("expiring"); }}
          onFreeSpace={() => { const biggest = [...files].sort((a, b) => b.bytes - a.bytes)[0]!; go(biggest.folderId); setSelected(new Set([biggest.id])); setPreviewId(biggest.id); say(`Empieza por el más pesado: ${biggest.name} (${formatBytes(biggest.bytes)}).`); }} />
        <UploadTray queue={queue} />

        {root === "out" && agentSummary.length ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Por agente">
            <span className="mr-1 text-xs text-muted-foreground">Por agente</span>
            {agentSummary.map(([name, info]) => (
              <button key={name} type="button" aria-pressed={agentFilter === name} title={`${name}: último archivo ${agoLabel(info.latest)}`} onClick={() => { setAgentFilter(agentFilter === name ? null : name); setQuick(null); setQuery(""); setSelected(new Set()); setPreviewId(null); }}
                className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors duration-(--motion-duration-fast)", agentFilter === name ? "border-transparent font-medium" : "border-border hover:bg-accent/50")}
                style={agentFilter === name ? { background: tint(ACCENT.mint, 30) } : undefined}>
                <Avatar name={name} size="xs" />{name}<span className="tabular-nums text-muted-foreground">{info.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={cn("relative grid min-w-0 gap-4 md:grid-cols-[210px_minmax(0,1fr)]", preview && "lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,320px)]")}>
          <nav aria-label="Carpetas" className="hidden min-w-0 flex-col gap-0.5 md:flex md:self-start">
            {([["recent", "Recientes", Clock, ACCENT.sky, null], ["favorites", "Favoritos", Star, ACCENT.yellow, favorites.size], ["trash", "Papelera", Trash2, ACCENT.muted, trash.length]] as [Exclude<Quick, null>, string, LucideIcon, string, number | null][]).map(([id, label, Icon, color, count]) => (
              <button key={id} type="button" aria-pressed={quick === id} onClick={() => openQuick(id)} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast)", quick === id ? "font-medium" : "text-muted-foreground hover:text-foreground")} style={quick === id ? { background: `linear-gradient(90deg, ${tint(color, 26)}, ${tint(color, 6)})` } : undefined}>
                <Icon className="h-4 w-4" style={{ color: readable(color) }} /><span className="flex-1">{label}</span>{count ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
              </button>
            ))}
            <div className="my-2 h-px bg-border" />
            <button type="button" onClick={() => go(root)} {...dropProps(root)} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast)", !flat && folderId === root ? "font-medium" : "text-muted-foreground hover:text-foreground")} style={!flat && folderId === root ? { background: `linear-gradient(90deg, ${tint(rootColor, 26)}, ${tint(rootColor, 6)})` } : dropTarget === root ? { background: tint(ACCENT.turquoise, 28) } : undefined}>
              <FolderOpen className="h-4 w-4" style={{ color: readable(rootColor) }} /><span className="flex-1">Todo en {ROOT_INFO[root].label}</span><span className="text-xs tabular-nums text-muted-foreground">{counts[root].total}</span>
            </button>
            <LayoutGroup id="files-tree">{folders.filter((item) => item.parentId === root).map((item) => renderTree(item, 0))}</LayoutGroup>
            <div className="mt-3 px-2"><QuotaMeter used={config.quota.usedBytes} total={config.quota.totalBytes} compact /></div>
          </nav>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5">
                <Button size="icon" variant="ghost" aria-label="Atrás" disabled={!history.back.length} onClick={goBack}><ArrowLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Subir un nivel" disabled={!folder.parentId} onClick={goUp}><ArrowUp className="h-4 w-4" /></Button>
              </div>
              <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden px-1 text-sm">
                {crumbs.map((crumb, index) => (
                  <span key={crumb.id} className={cn("min-w-0 items-center gap-0.5", index === crumbs.length - 1 && !flat ? "flex" : "hidden sm:flex")} {...dropProps(crumb.id)}>
                    {index > 0 ? <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" /> : null}
                    <button type="button" onClick={() => go(crumb.id)} className={cn("truncate rounded-md px-1.5 py-0.5 transition-colors duration-(--motion-duration-fast) hover:bg-accent/60", index === crumbs.length - 1 && !flat ? "font-semibold" : "text-muted-foreground")} style={dropTarget === crumb.id ? { background: tint(ACCENT.turquoise, 30) } : undefined}>{crumb.name}</button>
                  </span>
                ))}
                {flat ? <span className="flex items-center gap-0.5"><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate px-1.5 font-semibold">{needle ? `Búsqueda: ${query}` : agentFilter ? `Creado por ${agentFilter}` : quick ? quickLabels[quick] : ""}</span></span> : null}
              </nav>
              <div className="relative" onClick={(event) => event.stopPropagation()}>
                <Button size="icon" variant="ghost" aria-label="Esta carpeta en tu ordenador" title="Esta carpeta en tu ordenador" aria-expanded={computerOpen} onClick={() => setComputerOpen(!computerOpen)}><Laptop className="h-4 w-4" /></Button>
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
              <div className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm focus-within:border-foreground/30 sm:w-44">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar" aria-label="Buscar archivo" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(60); }} />
                {query ? <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button> : null}
              </div>
              <div className="relative" onClick={(event) => event.stopPropagation()}>
                <Button size="sm" variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />Filtros{activeFilters ? <span className="rounded-full px-1.5 text-xs tabular-nums" style={{ background: tint(ACCENT.turquoise, 40) }}>{activeFilters}</span> : null}
                </Button>
                <AnimatePresence>
                  {filtersOpen ? (
                    <motion.div role="dialog" aria-label="Filtros" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="absolute right-0 z-30 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-2xl border border-border bg-background p-4 shadow-lg">
                      <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Tipo</p>
                        <div className="flex flex-wrap gap-1.5">{TYPE_CHIPS.map(([id, label]) => (
                          <button key={id} type="button" aria-pressed={typeFilter === id} onClick={() => setTypeFilter(id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-(--motion-duration-fast)", typeFilter === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={typeFilter === id ? { background: tint(id === "all" ? rootColor : KIND[id].color, 30) } : undefined}>{label}</button>
                        ))}</div></div>
                      <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Quién lo creó</p>
                        <div className="flex flex-wrap gap-1.5">{([["all", "Todos"], ["mine", "Yo"], ["agents", "Agentes"]] as [Who, string][]).map(([id, label]) => (
                          <button key={id} type="button" aria-pressed={who === id} onClick={() => setWho(id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-(--motion-duration-fast)", who === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={who === id ? { background: tint(ACCENT.lilac, 28) } : undefined}>{label}</button>
                        ))}</div></div>
                      <div className="flex flex-col gap-1.5"><p className="text-xs font-medium text-muted-foreground">Mostrar solo</p>
                        <div className="flex flex-wrap gap-1.5">{([["context", "Contexto para agentes", ACCENT.lilac], ["expiring", "Caducan pronto", ACCENT.yellow]] as [Exclude<Quick, null>, string, string][]).map(([id, label, color]) => (
                          <button key={id} type="button" aria-pressed={quick === id} onClick={() => openQuick(id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-(--motion-duration-fast)", quick === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={quick === id ? { background: tint(color, 30) } : undefined}>{label}</button>
                        ))}</div></div>
                      {view === "details" ? (
                        <label className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">Agrupar por
                          <select aria-label="Agrupar por" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-normal text-foreground">
                            <option value="none">Sin agrupar</option><option value="type">Tipo</option><option value="by">Quién</option><option value="date">Fecha</option>
                          </select>
                        </label>
                      ) : null}
                      <div className="flex justify-between border-t border-border pt-3"><Button size="sm" variant="ghost" disabled={!activeFilters} onClick={() => { setTypeFilter("all"); setWho("all"); setGroupBy("none"); if (quick === "context" || quick === "expiring") setQuick(null); }}>Limpiar</Button><Button size="sm" onClick={() => setFiltersOpen(false)}>Listo</Button></div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
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
            {quick === "trash" ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: tint(ACCENT.muted, 14) }}>
                <Trash2 className="h-4 w-4" /><span className="min-w-0 flex-1">Lo que borras se queda aquí 30 días y después desaparece solo.</span>
                <Button size="sm" variant="outline" disabled={!trash.length} onClick={() => { const gone = trash; setTrash([]); say(`${gone.length} archivos eliminados para siempre`, () => setTrash(gone)); }}>Vaciar papelera</Button>
              </div>
            ) : null}

            <AnimatePresence initial={false}>
              {selectedFiles.length >= 1 && quick !== "trash" ? (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}>
                  <div className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: tint(rootColor, 18) }}>
                    <span className="shrink-0 font-medium">{selectedFiles.length === 1 ? "1 seleccionado" : `${selectedFiles.length} seleccionados`}</span>
                    <span className="hidden text-muted-foreground sm:inline">{formatBytes(totalBytes)}</span>
                    <span className="flex-1" />
                    <Button size="sm" onClick={() => setAskFiles(selectedFiles)} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}><Send className="h-3.5 w-3.5" />Pedir a un agente</Button>
                    {oneFile ? <Button size="sm" variant="outline" onClick={() => setShareFile(oneFile)}><Share2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Compartir</span></Button> : null}
                    <div className="relative" onClick={(event) => event.stopPropagation()}>
                      <Button size="icon" variant="outline" aria-label="Más acciones" aria-expanded={bulkOpen} onClick={() => setBulkOpen(!bulkOpen)}><MoreHorizontal className="h-4 w-4" /></Button>
                      <AnimatePresence>
                        {bulkOpen ? (
                          <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="absolute right-0 z-30 mt-2 flex w-56 flex-col rounded-xl border border-border bg-background p-1 text-sm shadow-lg">
                            {([
                              ...(oneFile ? [["Vista rápida", Eye, () => { const at = lookFiles.findIndex((file) => file.id === oneFile.id); if (at >= 0) setLook(at); }, false]] : []),
                              ["Descargar", Download, () => say(selectedFiles.length === 1 ? "Descargando…" : `Descargando ${selectedFiles.length} archivos como .zip`), false],
                              ["Mover a…", FolderInput, () => setMoveIds([...selected]), config.readOnly],
                              ["Eliminar", Trash2, () => removeFiles([...selected]), config.readOnly],
                              ["Quitar selección", X, () => setSelected(new Set()), false],
                            ] as [string, LucideIcon, () => void, boolean][]).map(([label, Icon, run, disabled]) => (
                              <button key={label} role="menuitem" disabled={disabled} onClick={() => { setBulkOpen(false); run(); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/60 disabled:opacity-40"><Icon className="h-4 w-4 text-muted-foreground" />{label}</button>
                            ))}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
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
            ) : rows.length === 0 && !creating ? (
              flat || filtering ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{quick === "trash" ? "La papelera está vacía. Nada que recuperar." : quick === "favorites" ? "Aún no tienes favoritos. Pulsa la estrella de un archivo." : "Nada coincide con esto."}</p>
              : <EmptyFolder root={folder.root} name={folder.name} readOnly={config.readOnly} onUpload={() => picker.current?.click()} onNewFolder={() => setCreating(true)} />
            ) : view === "icons" ? (
              <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-3">
                {creating ? <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-dashed border-border p-3"><IconTile icon={FolderPlus} color={rootColor} /><NewFolderInput onCreate={createFolder} onCancel={() => setCreating(false)} /></div> : null}
                {shown.map((row) => row.kind === "folder" ? (
                  <button key={row.folder.id} type="button" onClick={() => go(row.folder.id)} {...dropProps(row.folder.id)} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border p-3 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md" style={dropTarget === row.folder.id ? { boxShadow: `0 0 0 2px ${ACCENT.turquoise}` } : undefined}>
                    <FolderGlyph folder={row.folder} color={rootColor} locked={row.locked} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.folder.name}</span><span className="text-xs text-muted-foreground">{row.locked ? "Privada" : `${row.count} elementos`}</span></span>
                  </button>
                ) : (
                  <button key={row.file.id} type="button" draggable={!config.readOnly && !row.locked && quick !== "trash"} onDragStart={(event) => { const ids = selected.has(row.file.id) ? [...selected] : [row.file.id]; event.dataTransfer.setData("text/plain", ids.join(",")); setDragIds(ids); }} onDragEnd={() => { setDragIds(null); setDropTarget(null); }}
                    onClick={(event) => select(row, event)} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, row }); }}
                    className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", selected.has(row.file.id) ? "border-transparent" : "border-border")}
                    style={{ boxShadow: selected.has(row.file.id) ? `0 0 0 2px ${KIND[row.file.kind].color}` : flash.has(row.file.id) ? `0 0 0 2px ${ACCENT.yellow}` : undefined }}>
                    <Thumb file={row.file} />
                    <span className="min-w-0 px-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium">{row.file.name}</span>{agoMinutes(row.file.updatedAt) <= 180 && quick !== "trash" ? <NewBadge /> : null}</span><span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><Avatar name={row.file.by} size="xs" />{row.file.by} · {row.file.updatedAt}</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <div ref={listRef} onKeyDown={onListKey} className="min-w-0 overflow-hidden rounded-2xl border border-border">
                <div className={cn(GRID, "border-b border-border bg-muted/30 px-3 py-2")}>
                  <span />
                  {header("name", "Nombre")}
                  {header("modified", "Modificado", "justify-self-start")}
                  <span className="hidden sm:block">{header("by", "Creado por")}</span>
                  <span className="hidden sm:block">{header("size", "Tamaño")}</span>
                </div>
                <div className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {creating ? (
                      <motion.div key="new-folder" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={cn(GRID, "px-3 py-1.5")} style={{ background: tint(rootColor, 10) }}>
                        <span /><span className="flex min-w-0 items-center gap-2.5"><FolderPlus className="h-5 w-5 shrink-0" style={{ color: readable(rootColor) }} /><NewFolderInput onCreate={createFolder} onCancel={() => setCreating(false)} /></span>
                        <span className="text-xs text-muted-foreground">Enter para crear</span><span className="hidden sm:block" /><span className="hidden sm:block" /><span className="hidden sm:block" /><span className="hidden lg:block" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  {shownItems.map((item, index) => item.type === "group" ? (
                    <div key={`g-${item.label}`} className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: rootColor }} />{item.label}<span className="tabular-nums">{item.count}</span></div>
                  ) : renderRow(item.row, index))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                  <span>{rows.length} elementos{selectedFiles.length ? ` · ${selectedFiles.length} seleccionado${selectedFiles.length === 1 ? "" : "s"} (${formatBytes(totalBytes)})` : ""}</span>
                </div>
              </div>
            )}
            {rows.length > shown.length && view !== "activity" ? <Button variant="outline" onClick={() => setLimit(limit + 60)}>Mostrar {Math.min(60, rows.length - shown.length)} más · quedan {rows.length - shown.length}</Button> : null}
          </div>

          {preview ? (
            <div className="min-w-0 md:col-span-2 lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
              <AnimatePresence mode="wait">
                {lockedFiles.has(preview.id) ? (
                  <LockedPreview key={preview.id} file={preview} onClose={() => setPreviewId(null)} />
                ) : (
                  <PreviewPane key={preview.id} file={preview} readOnly={config.readOnly} onClose={() => setPreviewId(null)} onChange={(patch) => setFiles((current) => current.map((file) => file.id === preview.id ? { ...file, ...patch } : file))} />
                )}
              </AnimatePresence>
            </div>
          ) : null}

          <AnimatePresence>
            {dragging ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed" style={{ borderColor: ACCENT.turquoise, background: tint(ACCENT.turquoise, 16) }}>
                <span className="rounded-xl bg-background px-4 py-2 text-sm font-medium shadow-md">Suelta para subir a {folder.root === "in" ? folder.name : "Entrada"}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </>}

      <ShareDialog file={shareFile} customers={CUSTOMERS} onClose={() => setShareFile(null)} onCreate={(link, to) => { setShareFile(null); say(`Enlace copiado. ${to} ya puede abrirlo (${link}).`); }} />
      <AskAgentDialog files={askFiles} onClose={() => setAskFiles([])} onCreate={askAgent} />
      <MoveDialog open={moveIds !== null} folders={folders.filter((item) => !lockedFolders.has(item.id))} current={moveIds?.length ? files.find((file) => file.id === moveIds[0])?.folderId ?? "" : ""} onClose={() => setMoveIds(null)} onMove={(target) => { if (moveIds) moveFiles(moveIds, target); setMoveIds(null); }} />
      <UrlDialog open={urlOpen} onClose={() => setUrlOpen(false)} onImport={(name, source) => { setUrlOpen(false); simulateUpload(1, name, source); }} />
      <QuickLook files={lookFiles} index={look ?? 0} onClose={() => setLook(null)} onMove={setLook} onFavorite={toggleFavorite} favorites={favorites} {...(look === null ? { files: [] } : {})} />

      <AnimatePresence>
        {menu ? (
          <motion.div role="menu" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="fixed z-50 flex w-60 flex-col rounded-xl border border-border bg-background p-1 text-sm shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 256), top: Math.min(menu.y, window.innerHeight - 440) }} onClick={(event) => event.stopPropagation()}>
            {menuItems(menu.row).map((item) => (
              <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { item.run(); setMenu(null); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/60 disabled:opacity-40">
                <item.icon className="h-4 w-4 text-muted-foreground" />{item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
        {toast ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <CircleCheck className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0">{toast.text}</span>
            {toast.undo ? <Button size="sm" variant="ghost" onClick={() => { toast.undo?.(); setToast(null); }}><Undo2 className="h-3.5 w-3.5" />Deshacer</Button> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NewFolderInput({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  return (
    <input autoFocus placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta" className="min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 py-0.5 text-sm outline-none"
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") onCreate(event.currentTarget.value); if (event.key === "Escape") onCancel(); }}
      onBlur={(event) => { if (event.currentTarget.value.trim()) onCreate(event.currentTarget.value); else onCancel(); }} />
  );
}
