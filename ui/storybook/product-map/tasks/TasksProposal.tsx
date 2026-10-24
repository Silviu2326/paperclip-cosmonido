import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Clapperboard,
  Clock,
  FileText,
  Inbox,
  Link2,
  Mail,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import type { IssuePriority, IssueStatus } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Pill, SectionTitle } from "../parts";
import { DEMO_PROJECTS, PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER, type DemoMessage, type DemoTask } from "./demo-data";

export const STATUS_STYLE: Record<IssueStatus, { color: string; icon: LucideIcon }> = {
  backlog: { color: ACCENT.muted, icon: CircleDashed },
  todo: { color: ACCENT.sky, icon: Circle },
  in_progress: { color: ACCENT.turquoise, icon: CircleDot },
  in_review: { color: ACCENT.lilac, icon: Clock },
  done: { color: ACCENT.mint, icon: CheckCircle2 },
  blocked: { color: ACCENT.risk, icon: AlertOctagon },
  cancelled: { color: ACCENT.muted, icon: X },
};

const PRIORITY_COLOR: Record<IssuePriority, string> = { critical: ACCENT.risk, high: ACCENT.yellow, medium: ACCENT.sky, low: ACCENT.muted };

type View = "mine" | "unread" | "blocked" | "all";
type GroupBy = "status" | "project";

const VIEWS: { id: View; label: string; match: (task: DemoTask) => boolean; accent: string }[] = [
  { id: "mine", label: "Mías", match: (task) => task.mine && task.status !== "done", accent: ACCENT.turquoise },
  { id: "unread", label: "Sin leer", match: (task) => task.unread, accent: ACCENT.sky },
  { id: "blocked", label: "Bloqueadas", match: (task) => task.status === "blocked", accent: ACCENT.risk },
  { id: "all", label: "Todo", match: () => true, accent: ACCENT.lilac },
];

function dueLabel(dueDate: string | null, done: boolean): { text: string; urgent: boolean } | null {
  if (!dueDate || done) return null;
  const days = Math.round((new Date(dueDate).getTime() - new Date("2026-10-24").getTime()) / 86_400_000);
  if (days < 0) return { text: "Vencida", urgent: true };
  if (days === 0) return { text: "Hoy", urgent: true };
  if (days === 1) return { text: "Mañana", urgent: false };
  return { text: new Date(dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" }), urgent: false };
}

function StatusDot({ status }: { status: IssueStatus }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return <span className="flex h-5 w-5 shrink-0 items-center justify-center" style={{ color: style.color }} aria-label={STATUS_LABEL[status]}><Icon className="h-4 w-4" /></span>;
}

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
        "relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
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

function ResultCard({ result }: { result: NonNullable<DemoTask["result"]> }) {
  const icon = result.kind === "video" ? Clapperboard : result.kind === "email" ? Mail : result.kind === "link" ? Link2 : FileText;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.mint, 14)}, transparent 70%)` }}>
      <IconTile icon={icon} color={ACCENT.mint} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{result.title}</p><p className="text-xs text-muted-foreground">{result.note}</p></div>
      <Button size="sm" variant="outline">Abrir</Button>
    </div>
  );
}

function TaskPanel({ task, onClose, onReply, onStatus }: { task: DemoTask; onClose: () => void; onReply: (text: string) => void; onStatus: (status: IssueStatus) => void }) {
  const tokens = useMotionTokens();
  const [draft, setDraft] = useState("");
  const project = DEMO_PROJECTS.find((candidate) => candidate.id === task.projectId);
  const style = STATUS_STYLE[task.status];
  const nextAction: { label: string; status: IssueStatus } | null =
    task.status === "in_review" ? { label: "Aprobar y cerrar", status: "done" }
    : task.status === "blocked" ? { label: "Desbloquear", status: "in_progress" }
    : task.status === "todo" || task.status === "backlog" ? { label: "Empezar", status: "in_progress" }
    : task.status === "in_progress" ? { label: "Pasar a revisión", status: "in_review" } : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onReply(draft.trim());
    setDraft("");
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-5 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground tabular-nums">{task.identifier}{project ? ` · ${project.name}` : ""}</p>
          <h2 className="mt-0.5 text-lg font-semibold leading-snug">{task.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill color={style.color} strong={task.status === "blocked"}>{STATUS_LABEL[task.status]}</Pill>
            <Pill color={PRIORITY_COLOR[task.priority]}>{PRIORITY_LABEL[task.priority]}</Pill>
            {task.customer ? <Pill color={ACCENT.mint}>{task.customer}</Pill> : null}
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {task.assignee ? <><Avatar name={task.assignee} size="sm" /><span>{task.assignee}</span></> : <span className="text-muted-foreground">Sin asignar</span>}
        {task.dueDate ? <span className="ml-auto text-xs text-muted-foreground">Fecha: {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</span> : null}
      </div>

      <p className="text-sm text-muted-foreground">{task.description}</p>

      {task.result ? <div className="flex flex-col gap-2"><SectionTitle color={ACCENT.mint} icon={CheckCircle2}>Resultado</SectionTitle><ResultCard result={task.result} /></div> : null}

      <div className="flex min-w-0 flex-col gap-3">
        <SectionTitle color={ACCENT.sky} icon={Inbox}>Conversación</SectionTitle>
        {task.thread.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay mensajes. Escribe para dar instrucciones.</p> : null}
        <AnimatePresence initial={false}>
          {task.thread.map((message: DemoMessage) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: tokens.base, ease: tokens.easeOut }}
              className={cn("flex min-w-0 gap-2.5", message.fromKind === "human" && "flex-row-reverse")}
            >
              <Avatar name={message.from} size="sm" />
              <div className={cn("min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-sm", message.fromKind === "human" ? "rounded-tr-sm" : "rounded-tl-sm")}
                style={message.fromKind === "human" ? { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) } : { background: tint(ACCENT.sky, 14) }}>
                <p>{message.text}</p>
                <p className="mt-0.5 text-xs opacity-70">{message.from} · {message.at}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            aria-label="Responder"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={task.assignee ? `Escribe a ${task.assignee}…` : "Escribe una instrucción…"}
            className="min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors duration-(--motion-duration-fast) focus:border-foreground/30"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
        </form>
      </div>

      {nextAction ? (
        <Button onClick={() => onStatus(nextAction.status)} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>
          <CheckCircle2 className="h-4 w-4" />{nextAction.label}
        </Button>
      ) : null}
    </motion.aside>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.sky}, ${ACCENT.turquoise})`, color: ink(ACCENT.sky) }}>
        <CheckCircle2 className="h-8 w-8" />
      </motion.span>
      <div><h2 className="text-lg font-semibold">Encarga tu primera tarea</h2><p className="mx-auto max-w-sm text-sm text-muted-foreground">Pide algo concreto a un agente («Escribe 4 posts para la clínica») y revisa el resultado aquí.</p></div>
      <Button onClick={onCreate}><Plus className="h-4 w-4" />Nueva tarea</Button>
    </div>
  );
}

/** Tareas: views with counts, grouping, quick create, rows with the essentials and a detail panel with conversation and result. */
export function TasksProposal({ tasks: initial }: { tasks: DemoTask[] }) {
  const tokens = useMotionTokens();
  const [tasks, setTasks] = useState(initial);
  const [view, setView] = useState<View>("mine");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const active = VIEWS.find((candidate) => candidate.id === view)!;
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => tasks.filter(active.match).filter((task) => !needle || `${task.title} ${task.identifier} ${task.customer ?? ""} ${task.assignee ?? ""}`.toLowerCase().includes(needle)), [tasks, active, needle]);
  const groups = useMemo(() => {
    if (groupBy === "status") {
      return STATUS_ORDER.map((status) => ({ key: status, label: STATUS_LABEL[status], color: STATUS_STYLE[status].color, items: visible.filter((task) => task.status === status) })).filter((group) => group.items.length);
    }
    const keys = [...DEMO_PROJECTS.map((project) => project.id), "none"];
    return keys.map((key) => ({
      key, label: key === "none" ? "Sin proyecto" : DEMO_PROJECTS.find((project) => project.id === key)!.name, color: key === "none" ? ACCENT.muted : ACCENT.turquoise,
      items: visible.filter((task) => (task.projectId ?? "none") === key),
    })).filter((group) => group.items.length);
  }, [visible, groupBy]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const counts = Object.fromEntries(VIEWS.map((candidate) => [candidate.id, tasks.filter(candidate.match).length])) as Record<View, number>;

  function createQuick(event: FormEvent) {
    event.preventDefault();
    const title = quick.trim();
    if (!title) return;
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
    setTasks((current) => current.map((task) => (task.id === selected.id ? { ...task, status, unread: false } : task)));
    setFlash(`${selected.identifier} → ${STATUS_LABEL[status]}`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tareas</h1>
          <p className="text-sm text-muted-foreground">{tasks.length ? `${counts.mine} son tuyas · ${counts.blocked} bloqueadas · ${counts.unread} sin leer` : "Nada en marcha todavía"}</p>
        </div>
      </header>

      <form onSubmit={createQuick} className="flex items-center gap-2 rounded-2xl border border-border p-2 transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(ACCENT.turquoise, 26), color: readable(ACCENT.turquoise) }}><Plus className="h-4 w-4" /></span>
        <input id="tasks-quick-create" aria-label="Nueva tarea" value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="Encarga algo: «Escribe el copy del carrusel de la clínica»" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <Button type="submit" size="sm" disabled={!quick.trim()}>Encargar</Button>
      </form>

      <AnimatePresence>
        {flash ? (
          <motion.div role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm" style={{ background: tint(ACCENT.mint, 24) }}>
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />{flash}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {tasks.length === 0 ? <EmptyState onCreate={() => document.getElementById("tasks-quick-create")?.focus()} /> : <>
        <div className="flex flex-wrap items-center gap-3">
          <LayoutGroup id="task-views">
            <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
              {VIEWS.map((candidate) => (
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
            {groups.map((group) => (
              <section key={`${groupBy}-${group.key}`} className="flex min-w-0 flex-col gap-1.5">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />{group.label}<span className="font-normal tabular-nums">{group.items.length}</span>
                </h2>
                <AnimatePresence initial={false}>
                  {group.items.map((task, index) => <TaskRow key={task.id} task={task} index={index} selected={task.id === selectedId} onSelect={() => { setSelectedId(task.id === selectedId ? null : task.id); setTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...candidate, unread: false } : candidate)); }} />)}
                </AnimatePresence>
              </section>
            ))}
          </div>
          <AnimatePresence>
            {selected ? <div key={selected.id} className="min-w-0 lg:sticky lg:top-4 lg:self-start"><TaskPanel task={selected} onClose={() => setSelectedId(null)} onReply={reply} onStatus={setStatus} /></div> : null}
          </AnimatePresence>
        </div>
      </>}
    </div>
  );
}
