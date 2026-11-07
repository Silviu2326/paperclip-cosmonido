import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownUp, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Download, Rows3, Search, Rows4 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, Pill } from "../parts";
import type { ActivityKind } from "./demo-data";
import type { ActivityData } from "./scenarios";
import { ClipPill } from "./states";
import { KIND } from "./sections";

/**
 * Variant C — audit log. One dense, filterable table of every event with saved
 * views, expandable rows, pagination and CSV export: for the person who has to
 * answer "who did what, and when?".
 */

const SEVERITY: Record<ActivityKind, { label: string; color: string }> = {
  error: { label: "Alta", color: ACCENT.risk },
  cost: { label: "Media", color: ACCENT.yellow },
  agent: { label: "Media", color: ACCENT.yellow },
  approval: { label: "Baja", color: ACCENT.muted },
  task: { label: "Baja", color: ACCENT.muted },
  message: { label: "Baja", color: ACCENT.muted },
};

const SAVED_VIEWS: { id: string; label: string; kind?: ActivityKind; actor?: string }[] = [
  { id: "all", label: "Todo" },
  { id: "errors", label: "Solo errores", kind: "error" },
  { id: "approvals", label: "Aprobaciones", kind: "approval" },
  { id: "cost", label: "Gasto", kind: "cost" },
  { id: "me", label: "Lo que hice yo", actor: "Tú" },
];

const GRID = "md:grid-cols-[5.5rem_minmax(0,11rem)_minmax(0,1fr)_minmax(0,11rem)_6rem_5rem]";

export function ActivityAudit({ data, onExport, exporting }: { data: ActivityData; onExport: () => void; exporting: boolean }) {
  const tokens = useMotionTokens();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [actor, setActor] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [view, setView] = useState("all");
  const [dense, setDense] = useState(true);
  const [newestFirst, setNewestFirst] = useState(true);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const pageSize = 25;

  const actors = useMemo(() => [...new Set(data.events.map((event) => event.actor))].sort(), [data.events]);
  const customers = useMemo(() => [...new Set(data.events.map((event) => event.customer).filter((value): value is string => Boolean(value)))].sort(), [data.events]);
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const filtered = data.events.filter((event) =>
      (kind === "all" || event.kind === kind)
      && (actor === "all" || event.actor === actor)
      && (customer === "all" || event.customer === customer)
      && (!needle || `${event.actor} ${event.text} ${event.customer ?? ""}`.toLowerCase().includes(needle)));
    return newestFirst ? filtered : [...filtered].reverse();
  }, [data.events, kind, actor, customer, needle, newestFirst]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = rows.slice(current * pageSize, current * pageSize + pageSize);

  useEffect(() => { setPage(0); }, [kind, actor, customer, needle]);

  function applyView(id: string) {
    const saved = SAVED_VIEWS.find((candidate) => candidate.id === id)!;
    setView(id);
    setKind(saved.kind ?? "all");
    setActor(saved.actor ?? "all");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {SAVED_VIEWS.map((saved) => (
          <button key={saved.id} aria-pressed={view === saved.id} onClick={() => applyView(saved.id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", view === saved.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={view === saved.id ? { background: tint(ACCENT.lilac, 30) } : undefined}>{saved.label}</button>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar por persona, acción o cliente" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <NativeSelect aria-label="Tipo" className="w-36" value={kind} onChange={(event) => { setKind(event.target.value as ActivityKind | "all"); setView(""); }}>
          <option value="all">Todos los tipos</option>
          {(Object.keys(KIND) as ActivityKind[]).map((key) => <option key={key} value={key}>{KIND[key].label}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Quién" className="w-48" value={actor} onChange={(event) => { setActor(event.target.value); setView(""); }}>
          <option value="all">Cualquier persona</option>
          {actors.slice(0, 60).map((name) => <option key={name} value={name}>{name.length > 40 ? `${name.slice(0, 40)}…` : name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Cliente" className="w-48" value={customer} onChange={(event) => setCustomer(event.target.value)}>
          <option value="all">Cualquier cliente</option>
          {customers.map((name) => <option key={name} value={name}>{name.length > 40 ? `${name.slice(0, 40)}…` : name}</option>)}
        </NativeSelect>
        <Button size="icon" variant="outline" aria-label={dense ? "Filas cómodas" : "Filas compactas"} aria-pressed={dense} onClick={() => setDense(!dense)}>{dense ? <Rows4 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}</Button>
        <Button size="sm" variant="outline" disabled={exporting} onClick={onExport}><Download className="h-3.5 w-3.5" />Exportar {rows.length.toLocaleString("es-ES")} filas</Button>
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-border">
        <div className={cn("hidden gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid", GRID)}>
          <button onClick={() => setNewestFirst(!newestFirst)} className="flex items-center gap-1 text-left hover:text-foreground" aria-label="Ordenar por fecha"><ArrowDownUp className="h-3 w-3" />Cuándo</button>
          <span>Quién</span><span>Acción</span><span>Cliente</span><span>Tipo</span><span>Gravedad</span>
        </div>
        {slice.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Ningún evento coincide con los filtros.</p> : null}
        <div className="divide-y divide-border">
          {slice.map((event) => {
            const style = KIND[event.kind];
            const severity = SEVERITY[event.kind];
            const expanded = open === event.id;
            return (
              <div key={event.id}>
                <button
                  onClick={() => setOpen(expanded ? null : event.id)}
                  aria-expanded={expanded}
                  className={cn("grid w-full min-w-0 grid-cols-1 items-center gap-x-3 gap-y-1 px-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/40", dense ? "py-1.5" : "py-3", GRID)}
                >
                  <span className="text-xs tabular-nums text-muted-foreground">{event.day === "Esta semana" ? event.at : `${event.day} · ${event.at}`}</span>
                  <span className="flex min-w-0 items-center gap-2 text-sm"><Avatar name={event.actor} size="xs" /><span className="truncate" title={event.actor}>{event.actor}</span></span>
                  <span className={cn("min-w-0 text-sm", dense ? "truncate" : "break-words")} title={event.text}>{event.text}</span>
                  <span className="flex min-w-0 items-center text-sm">{event.customer ? <ClipPill color={ACCENT.mint}>{event.customer}</ClipPill> : <span className="text-xs text-muted-foreground">—</span>}</span>
                  <span className="flex items-center"><Pill color={style.color}>{style.label}</Pill></span>
                  <span className="flex items-center justify-between gap-1"><Pill color={severity.color}>{severity.label}</Pill><ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-(--motion-duration-fast)", expanded && "rotate-180")} /></span>
                </button>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                      <dl className="mx-3 mb-3 grid gap-x-6 gap-y-1 rounded-xl p-3 text-xs sm:grid-cols-2" style={{ background: tint(style.color, 10) }}>
                        <div className="min-w-0"><dt className="text-muted-foreground">ID del evento</dt><dd className="break-all font-mono">{event.id}</dd></div>
                        <div className="min-w-0"><dt className="text-muted-foreground">Origen</dt><dd className="break-words">{event.kind === "error" ? "Ejecución fallida (heartbeat run)" : event.kind === "cost" ? "Evento de coste" : "Registro de actividad"}</dd></div>
                        <div className="min-w-0 sm:col-span-2"><dt className="text-muted-foreground">Texto completo</dt><dd className="break-words">{event.actor} {event.text}</dd></div>
                        <div className="min-w-0"><dt className="text-muted-foreground">Cuándo</dt><dd>{event.day}, {event.at}</dd></div>
                        <div className="min-w-0"><dt className="text-muted-foreground">Cliente</dt><dd className="break-words">{event.customer ?? "Sin cliente"}</dd></div>
                      </dl>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>Mostrando {rows.length ? current * pageSize + 1 : 0}–{Math.min(rows.length, (current + 1) * pageSize)} de {rows.length.toLocaleString("es-ES")}{data.total > data.events.length ? ` · ${data.total.toLocaleString("es-ES")} en el historial completo` : ""}</span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tabular-nums">Página {current + 1} de {pages}</span>
            <Button size="icon" variant="ghost" aria-label="Página siguiente" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
