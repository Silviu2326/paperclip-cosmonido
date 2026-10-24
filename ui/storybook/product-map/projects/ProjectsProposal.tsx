import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AlertOctagon, ArrowLeft, CalendarClock, CheckCircle2, FolderKanban, Plus, Users } from "lucide-react";
import type { ProjectStatus } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, Pill, Progress } from "../parts";
import { STATUS_STYLE } from "../tasks/TasksProposal";
import { DEMO_TASKS, PROJECT_STATUS_LABEL, STATUS_LABEL, projectProgress, type DemoProject, type DemoTask } from "./demo-data";

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  backlog: ACCENT.muted, planned: ACCENT.sky, in_progress: ACCENT.turquoise, completed: ACCENT.mint, cancelled: ACCENT.muted,
};

const FILTERS: { id: "active" | "planned" | "all"; label: string; match: (project: DemoProject) => boolean }[] = [
  { id: "active", label: "En curso", match: (project) => project.status === "in_progress" },
  { id: "planned", label: "Próximos", match: (project) => project.status === "planned" || project.status === "backlog" },
  { id: "all", label: "Todos", match: () => true },
];

function targetLabel(date: string | null) {
  if (!date) return "Sin fecha";
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function AgentStack({ agents }: { agents: string[] }) {
  if (!agents.length) return <span className="text-xs text-muted-foreground">Sin agentes</span>;
  return (
    <span className="flex items-center">
      {agents.slice(0, 4).map((agent, index) => (
        <span key={agent} className={cn(index > 0 && "-ml-1")} title={agent}><Avatar name={agent} size="sm" ring="var(--background)" /></span>
      ))}
    </span>
  );
}

function ProjectCard({ project, tasks, index, onOpen }: { project: DemoProject; tasks: DemoTask[]; index: number; onOpen: () => void }) {
  const tokens = useMotionTokens();
  const progress = projectProgress(project.id, tasks);
  const accent = BRAND(project.color);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      onClick={onOpen}
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border p-4 text-left",
        "transition-[transform,box-shadow] duration-(--motion-duration-fast) ease-(--motion-ease-out-expo) hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accent}, ${tint(accent, 30)})` }} />
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(accent, 28), color: readable(accent) }}><FolderKanban className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{project.customer ?? "Proyecto interno"}</p>
        </div>
        <Pill color={PROJECT_STATUS_COLOR[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Pill>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{progress.total ? `${progress.done} de ${progress.total} ${progress.total === 1 ? "tarea hecha" : "tareas hechas"}` : "Sin tareas todavía"}</span>
          <span className="tabular-nums">{progress.percent} %</span>
        </div>
        <Progress value={progress.percent} color={accent} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <AgentStack agents={project.agents} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {progress.blocked ? <Pill color={ACCENT.risk} strong><AlertOctagon className="h-3 w-3" />{progress.blocked}</Pill> : null}
          <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{targetLabel(project.targetDate)}</span>
        </div>
      </div>
    </motion.button>
  );
}

function ProjectDetail({ project, tasks, onBack }: { project: DemoProject; tasks: DemoTask[]; onBack: () => void }) {
  const tokens = useMotionTokens();
  const progress = projectProgress(project.id, tasks);
  const own = tasks.filter((task) => task.projectId === project.id);
  const accent = BRAND(project.color);
  const columns: { status: DemoTask["status"]; items: DemoTask[] }[] = (["blocked", "todo", "in_progress", "in_review", "done"] as const).map((status) => ({ status, items: own.filter((task) => task.status === status) }));
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-5">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}><ArrowLeft className="h-4 w-4" />Todos los proyectos</Button>
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border p-5" style={{ background: `linear-gradient(135deg, ${tint(accent, 22)}, transparent 65%)` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{project.name}</h2><Pill color={PROJECT_STATUS_COLOR[project.status]} strong>{PROJECT_STATUS_LABEL[project.status]}</Pill></div>
            <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
          </div>
          <Button size="sm"><Plus className="h-4 w-4" />Tarea en este proyecto</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5"><span className="text-xs text-muted-foreground">Progreso</span><span className="text-lg font-semibold tabular-nums">{progress.percent} %</span><Progress value={progress.percent} color={accent} /></div>
          <div className="flex min-w-0 flex-col gap-1.5"><span className="text-xs text-muted-foreground">Cliente y fecha</span><span className="truncate text-sm font-medium">{project.customer ?? "Interno"}</span><span className="text-xs text-muted-foreground">Objetivo: {targetLabel(project.targetDate)}</span></div>
          <div className="flex min-w-0 flex-col gap-1.5"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Equipo{project.lead ? ` · lidera ${project.lead}` : ""}</span><AgentStack agents={project.agents} /></div>
        </div>
      </div>

      {own.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Este proyecto aún no tiene tareas. Encarga la primera y aparecerá aquí.</p>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {columns.map((column) => {
            const style = STATUS_STYLE[column.status];
            return (
              <section key={column.status} className="flex min-w-0 flex-col gap-2 rounded-xl p-2" style={{ background: tint(style.color, 7) }}>
                <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />{STATUS_LABEL[column.status]}<span className="font-normal tabular-nums">{column.items.length}</span></h3>
                {column.items.length === 0 ? <p className="px-1 py-3 text-xs text-muted-foreground">—</p> : null}
                {column.items.map((task, index) => (
                  <motion.article key={task.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
                    className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5 text-sm shadow-sm transition-shadow duration-(--motion-duration-fast) hover:shadow-md">
                    <p className="text-xs text-muted-foreground tabular-nums">{task.identifier}</p>
                    <p className={cn("font-medium leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
                    <div className="flex items-center justify-between gap-2">{task.assignee ? <Avatar name={task.assignee} size="xs" /> : <span className="text-xs text-muted-foreground">Sin asignar</span>}{task.dueDate && task.status !== "done" ? <span className="text-xs text-muted-foreground">{targetLabel(task.dueDate)}</span> : null}</div>
                  </motion.article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function NewProjectForm({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (name.trim()) onCreate(name.trim()); }
  return (
    <motion.form onSubmit={submit} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="flex items-center gap-2 rounded-2xl border border-border p-2">
        <input autoFocus aria-label="Nombre del proyecto" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del proyecto, p. ej. «Campaña de Navidad»" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={!name.trim()}>Crear</Button>
      </div>
    </motion.form>
  );
}

/** Proyectos: cards with progress, customer, agents and blockers; detail with the tasks grouped by state. */
export function ProjectsProposal({ projects: initial }: { projects: DemoProject[] }) {
  const tokens = useMotionTokens();
  const [projects, setProjects] = useState(initial);
  const [filter, setFilter] = useState<"active" | "planned" | "all">("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const active = FILTERS.find((candidate) => candidate.id === filter)!;
  const visible = useMemo(() => projects.filter(active.match), [projects, active]);
  const open = projects.find((project) => project.id === openId) ?? null;
  const totals = useMemo(() => ({
    open: DEMO_TASKS.filter((task) => task.projectId && task.status !== "done" && task.status !== "cancelled").length,
    blocked: DEMO_TASKS.filter((task) => task.projectId && task.status === "blocked").length,
  }), []);

  function create(name: string) {
    const id = `new-${Date.now()}`;
    setProjects((current) => [{ id, name, description: "Proyecto nuevo. Añade tareas para empezar.", status: "planned", customer: null, lead: null, agents: [], targetDate: null, color: 4 }, ...current]);
    setFilter("all");
    setCreating(false);
    setOpenId(id);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <AnimatePresence mode="wait">
        {open ? <ProjectDetail key={open.id} project={open} tasks={DEMO_TASKS} onBack={() => setOpenId(null)} /> : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex min-w-0 flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Proyectos</h1>
                {projects.length ? <p className="text-sm text-muted-foreground">{projects.filter((project) => project.status === "in_progress").length} en curso · {totals.open} tareas abiertas · {totals.blocked} bloqueadas</p> : null}
              </div>
              <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo proyecto</Button>
            </header>
            <AnimatePresence>{creating ? <NewProjectForm onCreate={create} onCancel={() => setCreating(false)} /> : null}</AnimatePresence>

            {projects.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
                <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.lilac}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><FolderKanban className="h-8 w-8" /></motion.span>
                <div><h2 className="text-lg font-semibold">Agrupa tu trabajo en proyectos</h2><p className="mx-auto max-w-sm text-sm text-muted-foreground">Es opcional: puedes encargar tareas sin proyecto. Úsalos cuando algo tenga varias tareas, un cliente y una fecha.</p></div>
                <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Crear el primero</Button>
              </div>
            ) : <>
              <LayoutGroup id="project-filters">
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((candidate) => {
                    const selected = filter === candidate.id;
                    return (
                      <button key={candidate.id} onClick={() => setFilter(candidate.id)} className={cn("relative rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", selected ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
                        {selected ? <motion.span layoutId="project-filter-pill" className="absolute inset-0 rounded-full" style={{ background: tint(ACCENT.turquoise, 30) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                        <span className="relative">{candidate.label} · {projects.filter(candidate.match).length}</span>
                      </button>
                    );
                  })}
                </div>
              </LayoutGroup>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {visible.map((project, index) => <ProjectCard key={project.id} project={project} tasks={DEMO_TASKS} index={index} onOpen={() => setOpenId(project.id)} />)}
                </AnimatePresence>
              </div>
              {visible.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Ningún proyecto en esta vista.</p> : null}
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />El progreso es el porcentaje de tareas hechas. Pulsa un proyecto para ver sus tareas por estado.</p>
            </>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
