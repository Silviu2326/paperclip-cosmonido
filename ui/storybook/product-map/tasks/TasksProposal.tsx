import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CheckCircle2, ChevronRight, Plus, Search } from "lucide-react";
import type { IssueStatus } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar } from "../parts";
import { DEMO_PROJECTS, PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER, type DemoTask } from "./demo-data";
import { LONG_TASKS, MANY_TASKS } from "./demo-extra";
import { ErrorState, LoadMore, LoadingFrame, ReadOnlyBanner, Skel, VariantFrame, useScenario, type BaseScenario } from "./state-parts";
import { TasksCommand } from "./TasksCommand";
import { TasksKanban } from "./TasksKanban";
import { PRIORITY_COLOR, STATUS_STYLE, StatusDot, TaskPanel, TasksEmptyState, dueLabel } from "./task-parts";

export { STATUS_STYLE } from "./task-parts";

export type TasksScenario = BaseScenario | "bloqueada-con-dependencia" | "con-revision" | "en-ejecucion";
export type TasksVariant = "a" | "b" | "c";

type View = "mine" | "unread" | "blocked" | "all";
type GroupBy = "status" | "project";

export const TASK_VIEWS: { id: View; label: string; match: (task: DemoTask) => boolean; accent: string }[] = [
  { id: "mine", label: "Mías", match: (task) => task.mine && task.status !== "done", accent: ACCENT.turquoise },
  { id: "unread", label: "Sin leer", match: (task) => task.unread, accent: ACCENT.sky },
  { id: "blocked", label: "Bloqueadas", match: (task) => task.status === "blocked", accent: ACCENT.risk },
  { id: "all", label: "Todo", match: () => true, accent: ACCENT.lilac },
];

function TaskRow({ task, index, selected, onSelect }: { task: DemoTask; index: number; selected: boolean; onSelect: () => void }) {
  const tokens = useMotionTokens();
  const due = dueLabel(task.dueDate, task.status === "done");
  const project = DEMO_PROJECTS.find((candidate) => candidate.id === task.projectId);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      onClick={onSelect}
      className={cn(
        "relative flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
        "transition-[border-color,box-shadow,background-color] duration-(--motion-duration-fast) hover:bg-accent/40",
        selected ? "border-transparent shadow-md" : "border-border",
      )}
      style={selected ? { boxShadow: `0 0 0 2px ${STATUS_STYLE[task.status].color}` } : undefined}
    >
      {task.unread ? <span aria-label="Sin leer" className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: ACCENT.sky }} /> : null}
      <StatusDot status={task.status} />
      <span className="hidden w-16 shrink-0 text-xs tabular-nums text-muted-foreground sm:block">{task.identifier}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", task.unread && "font-semibold", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
          {task.customer ? <span className="truncate">{task.customer}</span> : null}
          {project ? <span className="hidden truncate sm:inline">· {project.name}</span> : null}
        </p>
      </div>
      <span className="hidden h-2 w-2 shrink-0 rounded-full sm:block" style={{ background: PRIORITY_COLOR[task.priority] }} title={`Prioridad ${PRIORITY_LABEL[task.priority].toLowerCase()}`} />
      {due ? <span className="shrink-0 text-xs font-medium" style={{ color: due.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>{due.text}</span> : null}
      {task.assignee ? <Avatar name={task.assignee} size="sm" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground" title="Sin asignar">?</span>}
    </motion.button>
  );
}

const PAGE = 8;

/** Variant A: list grouped by state or project, with a detail panel. */
function TasksList({ initial, scenario, readOnly }: { initial: DemoTask[]; scenario: TasksScenario; readOnly: boolean }) {
  const tokens = useMotionTokens();
  const [tasks, setTasks] = useState(initial);
  const focus = scenario === "bloqueada-con-dependencia" ? "t2" : scenario === "con-revision" ? "t1" : scenario === "en-ejecucion" ? "t5" : null;
  const [view, setView] = useState<View>(focus === "t5" ? "all" : "mine");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(focus ?? initial[0]?.id ?? null);
  const [flash, setFlash] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Record<string, number>>({});
  const limited = scenario === "many";

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const active = TASK_VIEWS.find((candidate) => candidate.id === view)!;
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => tasks.filter(active.match).filter((task) => !needle || `${task.title} ${task.identifier} ${task.customer ?? ""} ${task.assignee ?? ""}`.toLowerCase().includes(needle)), [tasks, active, needle]);
  const groups = useMemo(() => {
    if (groupBy === "status") {
      return STATUS_ORDER.map((status) => ({ key: status as string, label: STATUS_LABEL[status], color: STATUS_STYLE[status].color, items: visible.filter((task) => task.status === status) })).filter((group) => group.items.length);
    }
    const keys = [...DEMO_PROJECTS.map((project) => project.id), "pj-long", "none"];
    return keys.map((key) => ({
      key, label: key === "none" ? "Sin proyecto" : key === "pj-long" ? "Programa integral de transformación digital, comunicación y captación de socios del Polígono Industrial «Las Encinas de Arriba» y Comarca 2026–2028" : DEMO_PROJECTS.find((project) => project.id === key)!.name, color: key === "none" ? ACCENT.muted : ACCENT.turquoise,
      items: visible.filter((task) => (task.projectId ?? "none") === key),
    })).filter((group) => group.items.length);
  }, [visible, groupBy]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const counts = Object.fromEntries(TASK_VIEWS.map((candidate) => [candidate.id, tasks.filter(candidate.match).length])) as Record<View, number>;

  function createQuick(event: FormEvent) {
    event.preventDefault();
    const title = quick.trim();
    if (!title || readOnly) return;
    const id = `new-${Date.now()}`;
    const task: DemoTask = {
      id, identifier: `PAP-${440 + tasks.length}`, title, status: "todo", priority: "medium", assignee: "Marta", projectId: null, customer: null, dueDate: null,
      updatedAt: "ahora", mine: true, unread: false, description: "", result: null, thread: [],
    };
    setTasks((current) => [task, ...current]);
    setView("mine");
    setSelectedId(id);
    setQuick("");
    setFlash(`${task.identifier} asignada a Marta. Te avisará cuando haya algo que revisar.`);
  }
  function reply(text: string) {
    if (!selected) return;
    setTasks((current) => current.map((task) => task.id === selected.id
      ? { ...task, thread: [...task.thread, { id: `r-${Date.now()}`, from: "Tú", fromKind: "human", text, at: "ahora" }], unread: false } : task));
  }
  function setStatus(status: IssueStatus) {
    if (!selected) return;
    setTasks((current) => current.map((task) => (task.id === selected.id ? { ...task, status, unread: false, review: status === "done" ? undefined : task.review } : task)));
    setFlash(`${selected.identifier} → ${STATUS_LABEL[status]}`);
  }
  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tareas</h1>
          <p className="text-sm text-muted-foreground">{tasks.length ? `${counts.mine} son tuyas · ${counts.blocked} bloqueadas · ${counts.unread} sin leer` : "Nada en marcha todavía"}</p>
        </div>
      </header>

      {readOnly ? <ReadOnlyBanner /> : (
        <form onSubmit={createQuick} className="flex items-center gap-2 rounded-2xl border border-border p-2 transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(ACCENT.turquoise, 26), color: readable(ACCENT.turquoise) }}><Plus className="h-4 w-4" /></span>
          <input id="tasks-quick-create" aria-label="Nueva tarea" value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="Encarga algo: «Escribe el copy del carrusel de la clínica»" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <Button type="submit" size="sm" disabled={!quick.trim()}>Encargar</Button>
        </form>
      )}

      <AnimatePresence>
        {flash ? (
          <motion.div role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm" style={{ background: tint(ACCENT.mint, 24) }}>
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />{flash}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {tasks.length === 0 ? <TasksEmptyState readOnly={readOnly} onCreate={() => document.getElementById("tasks-quick-create")?.focus()} /> : <>
        <div className="flex flex-wrap items-center gap-3">
          <LayoutGroup id="task-views">
            <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
              {TASK_VIEWS.map((candidate) => (
                <button key={candidate.id} role="tab" aria-selected={view === candidate.id} onClick={() => setView(candidate.id)}
                  className={cn("relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", view === candidate.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {view === candidate.id ? <motion.span layoutId="task-view-pill" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                  <span className="relative">{candidate.label}</span>
                  <span className="relative rounded-full px-1.5 text-xs tabular-nums" style={counts[candidate.id] ? { background: tint(candidate.accent, 24), color: readable(candidate.accent) } : undefined}>{counts[candidate.id]}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <div className="flex min-w-40 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input aria-label="Buscar" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar tarea, cliente o agente" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5 text-xs">
            {([["status", "Por estado"], ["project", "Por proyecto"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setGroupBy(id)} className={cn("rounded-lg px-2.5 py-1 transition-colors duration-(--motion-duration-fast)", groupBy === id ? "font-medium" : "text-muted-foreground")} style={groupBy === id ? { background: tint(ACCENT.lilac, 28) } : undefined}>{label}</button>
            ))}
          </div>
        </div>

        <div className={cn("grid min-w-0 gap-6", selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
          <div className="flex min-w-0 flex-col gap-5">
            {groups.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{view === "blocked" ? "Nada bloqueado. Buen trabajo." : view === "unread" ? "Todo leído." : "Ninguna tarea coincide."}</p> : null}
            {groups.map((group) => {
              const key = `${groupBy}-${group.key}`;
              const isCollapsed = collapsed.has(key);
              const limit = limited ? shown[key] ?? PAGE : group.items.length;
              return (
                <section key={key} className="flex min-w-0 flex-col gap-1.5">
                  <button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(key)} className="flex min-w-0 items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
                    <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronRight className="h-3.5 w-3.5" /></motion.span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: group.color }} /><span className="min-w-0 truncate">{group.label}</span><span className="font-normal tabular-nums">{group.items.length}</span>
                  </button>
                  {isCollapsed ? null : <>
                    <AnimatePresence initial={false}>
                      {group.items.slice(0, limit).map((task, index) => <TaskRow key={task.id} task={task} index={index} selected={task.id === selectedId} onSelect={() => { setSelectedId(task.id === selectedId ? null : task.id); setTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...candidate, unread: false } : candidate)); }} />)}
                    </AnimatePresence>
                    {limited ? <LoadMore shown={limit} total={group.items.length} onMore={() => setShown((current) => ({ ...current, [key]: limit + 20 }))} /> : null}
                  </>}
                </section>
              );
            })}
          </div>
          <AnimatePresence>
            {selected ? <div key={selected.id} className="min-w-0 lg:sticky lg:top-4 lg:self-start"><TaskPanel task={selected} readOnly={readOnly} onClose={() => setSelectedId(null)} onReply={reply} onStatus={setStatus} /></div> : null}
          </AnimatePresence>
        </div>
      </>}
    </div>
  );
}

/** Skeleton with the shape of the chosen variant, so the page does not jump when data arrives. */
function TasksSkeleton({ variant }: { variant: TasksVariant }) {
  return (
    <div className="p-4 sm:p-6">
      <LoadingFrame label="Cargando tareas">
        <div className="flex flex-col gap-2"><Skel className="h-7 w-32" /><Skel className="h-4 w-64" delay={0.1} /></div>
        {variant === "c" ? <Skel className="h-12 w-full rounded-2xl" delay={0.1} /> : <Skel className="h-14 w-full rounded-2xl" delay={0.1} />}
        <div className="flex gap-3"><Skel className="h-9 w-72 rounded-xl" delay={0.2} /><Skel className="h-9 flex-1 rounded-xl" delay={0.25} /></div>
        {variant === "b" ? (
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, column) => (
              <div key={column} className="flex flex-col gap-2 rounded-xl bg-muted/30 p-2">
                <Skel className="h-4 w-24" delay={column * 0.08} />
                {Array.from({ length: 3 - (column % 2) }, (_, card) => <Skel key={card} className="h-20 w-full rounded-lg" delay={0.1 + card * 0.1 + column * 0.05} />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, row) => (
              <div key={row} className={cn("flex items-center gap-3 rounded-xl border border-border px-3", variant === "c" ? "h-8" : "py-3")}>
                <Skel className="h-4 w-4 rounded-full" delay={row * 0.07} /><Skel className="hidden h-3 w-14 sm:block" delay={row * 0.07} />
                <Skel className={cn("h-3.5", row % 3 === 0 ? "w-2/3" : row % 3 === 1 ? "w-1/2" : "w-3/5")} delay={row * 0.07} /><Skel className="ml-auto h-6 w-6 rounded-xl" delay={row * 0.07} />
              </div>
            ))}
          </div>
        )}
      </LoadingFrame>
    </div>
  );
}

/** Tareas. `scenario` picks the state (loading, error, lots of data…) and `variant` the design (list, kanban, command line). */
export function TasksProposal({ tasks, scenario: initialScenario = "normal", variant = "a" }: { tasks: DemoTask[]; scenario?: TasksScenario; variant?: TasksVariant }) {
  const { scenario, retry, retrying } = useScenario<TasksScenario>(initialScenario, "normal");
  const readOnly = scenario === "readonly";
  const data = scenario === "many" ? MANY_TASKS : scenario === "long" ? LONG_TASKS : tasks;

  if (scenario === "loading" || (retrying && scenario === "error")) return <TasksSkeleton variant={variant} />;
  if (scenario === "error") return <div className="p-4 sm:p-6"><ErrorState what="tus tareas" onRetry={retry} retrying={retrying} /></div>;
  const key = `${variant}-${scenario}`;
  if (variant === "b") return <TasksKanban key={key} initial={data} scenario={scenario} readOnly={readOnly} />;
  if (variant === "c") return <TasksCommand key={key} initial={data} scenario={scenario} readOnly={readOnly} />;
  return <TasksList key={key} initial={data} scenario={scenario} readOnly={readOnly} />;
}

/** The three designs side by side, as tabs, each with one line on what it prioritises. */
export function TasksVariants({ tasks }: { tasks: DemoTask[] }) {
  return (
    <VariantFrame id="tasks" variants={[
      { id: "a", label: "A · Lista", summary: "leer y decidir: todo agrupado, con el detalle y la conversación a mano. La más completa y la que mejor escala.", render: () => <TasksProposal tasks={tasks} variant="a" /> },
      { id: "b", label: "B · Tablero", summary: "ver el flujo de un vistazo y moverlo con el ratón: arrastras una tarjeta de columna y cambia de estado.", render: () => <TasksProposal tasks={tasks} variant="b" /> },
      { id: "c", label: "C · Línea de comandos", summary: "velocidad con teclado: creas escribiendo en lenguaje natural y te mueves con j/k. Pensada para quien gestiona muchas tareas al día.", render: () => <TasksProposal tasks={tasks} variant="c" /> },
    ]} />
  );
}
