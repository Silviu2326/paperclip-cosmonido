import { useEffect, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, GripVertical, Plus } from "lucide-react";
import type { IssueStatus } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar } from "../parts";
import { DEMO_PROJECTS, STATUS_LABEL, type DemoTask } from "./demo-data";
import { LoadMore, ReadOnlyBanner } from "./state-parts";
import { PRIORITY_COLOR, STATUS_STYLE, TaskPanel, TasksEmptyState, dueLabel } from "./task-parts";

type ColumnKey = "todo" | "in_progress" | "in_review" | "blocked" | "done";
const COLUMNS: { key: ColumnKey; label: string; hint: string; statuses: IssueStatus[] }[] = [
  { key: "todo", label: "Por hacer", hint: "Suéltala aquí para dejarla en cola", statuses: ["todo", "backlog"] },
  { key: "in_progress", label: "En curso", hint: "Un agente está trabajando en ello", statuses: ["in_progress"] },
  { key: "in_review", label: "En revisión", hint: "Esperan tu visto bueno", statuses: ["in_review"] },
  { key: "blocked", label: "Bloqueadas", hint: "Algo impide avanzar", statuses: ["blocked"] },
  { key: "done", label: "Hechas", hint: "Cerradas y entregadas", statuses: ["done"] },
];
const columnOf = (task: DemoTask): ColumnKey => COLUMNS.find((column) => column.statuses.includes(task.status))?.key ?? "todo";

const PAGE = 6;

function Card({ task, selected, readOnly, onSelect, onMove, onDragStart }: {
  task: DemoTask; selected: boolean; readOnly: boolean; onSelect: () => void; onMove: (direction: -1 | 1) => void; onDragStart: (event: DragEvent) => void;
}) {
  const tokens = useMotionTokens();
  const due = dueLabel(task.dueDate, task.status === "done");
  const project = DEMO_PROJECTS.find((candidate) => candidate.id === task.projectId);
  function onKey(event: KeyboardEvent) {
    if (readOnly || !event.shiftKey) return;
    if (event.key === "ArrowRight") { event.preventDefault(); onMove(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); onMove(-1); }
  }
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="min-w-0">
      <article
        draggable={!readOnly}
        onDragStart={onDragStart}
        data-task-id={task.id}
        className={cn(
          "group relative flex min-w-0 flex-col gap-2 rounded-xl border bg-background p-3 text-left shadow-sm",
          "transition-[box-shadow,transform,border-color] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md",
          readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          selected ? "border-transparent" : "border-border",
        )}
        style={selected ? { boxShadow: `0 0 0 2px ${STATUS_STYLE[task.status].color}` } : undefined}
      >
        {task.unread ? <span aria-label="Sin leer" className="absolute -left-1 top-3 h-2 w-2 rounded-full" style={{ background: ACCENT.sky }} /> : null}
        <button type="button" onClick={onSelect} onKeyDown={onKey} aria-label={`${task.identifier} ${task.title}`} className="flex min-w-0 flex-col gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {readOnly ? null : <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" aria-hidden="true" />}
            <span className="shrink-0">{task.identifier}</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[task.priority] }} />
            {project ? <span className="min-w-0 truncate">{project.name}</span> : null}
          </span>
          <span className={cn("break-words text-sm font-medium leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span>
        </button>
        <div className="flex min-w-0 items-center justify-between gap-2">
          {task.customer ? <span className="min-w-0 truncate rounded-full px-2 py-0.5 text-xs" style={{ background: tint(ACCENT.mint, 18), color: readable(ACCENT.mint) }}>{task.customer}</span> : <span />}
          <span className="flex shrink-0 items-center gap-1.5">
            {due ? <span className="text-xs font-medium" style={{ color: due.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>{due.text}</span> : null}
            {task.assignee ? <Avatar name={task.assignee} size="xs" /> : <span className="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">?</span>}
          </span>
        </div>
      </article>
    </motion.div>
  );
}

/** Variant B: kanban. Drag a card to another column (or focus it and press Shift + ← / →) to change its state. */
export function TasksKanban({ initial, scenario, readOnly }: { initial: DemoTask[]; scenario: string; readOnly: boolean }) {
  const tokens = useMotionTokens();
  const [tasks, setTasks] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(scenario === "bloqueada-con-dependencia" ? "t2" : scenario === "con-revision" ? "t1" : scenario === "en-ejecucion" ? "t5" : null);
  const [overColumn, setOverColumn] = useState<ColumnKey | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [shown, setShown] = useState<Partial<Record<ColumnKey, number>>>({});
  const limited = scenario === "many";

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  function moveTo(id: string, column: ColumnKey) {
    const target = COLUMNS.find((candidate) => candidate.key === column)!;
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task || columnOf(task) === column) return;
    setTasks((current) => current.map((candidate) => (candidate.id === id
      ? { ...candidate, status: target.statuses[0]!, unread: false, review: column === "done" ? undefined : candidate.review }
      : candidate)));
    setFlash(`${task.identifier} → ${target.label}`);
  }
  function shift(task: DemoTask, direction: -1 | 1) {
    const index = COLUMNS.findIndex((column) => column.key === columnOf(task));
    const next = COLUMNS[index + direction];
    if (next) moveTo(task.id, next.key);
  }
  function create(event: FormEvent) {
    event.preventDefault();
    const title = quick.trim();
    if (!title || readOnly) return;
    const id = `new-${Date.now()}`;
    setTasks((current) => [{ id, identifier: `PAP-${440 + current.length}`, title, status: "todo", priority: "medium", assignee: "Marta", projectId: null, customer: null, dueDate: null, updatedAt: "ahora", mine: true, unread: false, description: "", result: null, thread: [] }, ...current]);
    setQuick("");
    setFlash("Tarea creada en «Por hacer» y asignada a Marta");
  }
  function reply(text: string) {
    if (!selected) return;
    setTasks((current) => current.map((task) => task.id === selected.id ? { ...task, thread: [...task.thread, { id: `r-${Date.now()}`, from: "Tú", fromKind: "human", text, at: "ahora" }] } : task));
  }
  function setStatus(status: IssueStatus) {
    if (!selected) return;
    setTasks((current) => current.map((task) => (task.id === selected.id ? { ...task, status, review: status === "done" ? undefined : task.review } : task)));
    setFlash(`${selected.identifier} → ${STATUS_LABEL[status]}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tareas</h1>
          <p className="text-sm text-muted-foreground">{tasks.filter((task) => task.status !== "done").length} abiertas · {tasks.filter((task) => task.status === "blocked").length} bloqueadas</p>
        </div>
        {readOnly ? null : (
          <form onSubmit={create} className="flex min-w-56 max-w-md flex-1 items-center gap-2 rounded-2xl border border-border p-1.5 focus-within:border-foreground/30">
            <Plus className="ml-1.5 h-4 w-4 text-muted-foreground" />
            <input aria-label="Nueva tarea" value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="Nueva tarea en «Por hacer»" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <Button type="submit" size="sm" disabled={!quick.trim()}>Añadir</Button>
          </form>
        )}
      </header>
      {readOnly ? <ReadOnlyBanner /> : null}
      <AnimatePresence>
        {flash ? (
          <motion.div role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm" style={{ background: tint(ACCENT.mint, 24) }}>
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />{flash}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {tasks.length === 0 ? <TasksEmptyState readOnly={readOnly} onCreate={() => undefined} /> : (
        <div className={cn("grid min-w-0 gap-5", selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
          <div className="min-w-0 overflow-x-auto pb-2" aria-label="Tablero de tareas">
            <div className="flex min-w-max gap-3">
              {COLUMNS.map((column) => {
                const items = tasks.filter((task) => columnOf(task) === column.key);
                const limit = limited ? shown[column.key] ?? PAGE : items.length;
                const color = STATUS_STYLE[column.statuses[0]!].color;
                const over = overColumn === column.key && dragId !== null;
                return (
                  <section
                    key={column.key}
                    aria-label={column.label}
                    onDragOver={(event) => { if (readOnly) return; event.preventDefault(); setOverColumn(column.key); }}
                    onDragLeave={() => setOverColumn((current) => (current === column.key ? null : current))}
                    onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || dragId; if (id) moveTo(id, column.key); setOverColumn(null); setDragId(null); }}
                    className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl p-2 transition-[background-color,box-shadow] duration-(--motion-duration-fast)"
                    style={{ background: tint(color, over ? 18 : 7), boxShadow: over ? `inset 0 0 0 2px ${color}` : undefined }}
                  >
                    <header className="flex items-center justify-between gap-2 px-1.5 pt-1">
                      <h2 className="flex items-center gap-1.5 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{column.label}<span className="text-xs font-normal text-muted-foreground tabular-nums">{items.length}</span></h2>
                    </header>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {items.slice(0, limit).map((task) => (
                        <Card key={task.id} task={task} selected={task.id === selectedId} readOnly={readOnly}
                          onSelect={() => setSelectedId(task.id === selectedId ? null : task.id)} onMove={(direction) => shift(task, direction)}
                          onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDragId(task.id); }} />
                      ))}
                    </AnimatePresence>
                    {items.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{over ? "Suelta aquí" : column.hint}</p> : null}
                    {limited ? <LoadMore shown={limit} total={items.length} onMore={() => setShown((current) => ({ ...current, [column.key]: limit + 20 }))} /> : null}
                  </section>
                );
              })}
            </div>
          </div>
          <AnimatePresence>
            {selected ? <div key={selected.id} className="min-w-0 xl:sticky xl:top-4 xl:self-start"><TaskPanel task={selected} readOnly={readOnly} onClose={() => setSelectedId(null)} onReply={reply} onStatus={setStatus} /></div> : null}
          </AnimatePresence>
        </div>
      )}
      {readOnly ? null : <p className="text-xs text-muted-foreground">Arrastra una tarjeta a otra columna, o enfócala y pulsa Mayús + ← / → para moverla con el teclado.</p>}
    </div>
  );
}
