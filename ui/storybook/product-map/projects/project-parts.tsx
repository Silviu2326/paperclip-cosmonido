import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertOctagon, ArrowLeft, CalendarClock, FolderKanban, Plus, RotateCcw, Users, Wallet } from "lucide-react";
import type { ProjectStatus } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euros } from "../customers/demo-data";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, Pill, Progress } from "../parts";
import { STATUS_STYLE } from "../tasks/task-parts";
import { PROJECT_STATUS_LABEL, STATUS_LABEL, projectProgress, type DemoProject, type DemoTask } from "../tasks/demo-data";
import { ReadOnlyBanner } from "../tasks/state-parts";

/** Pieces shared by the three Proyectos variants (cards, Gantt, table). */

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  backlog: ACCENT.muted, planned: ACCENT.sky, in_progress: ACCENT.turquoise, completed: ACCENT.mint, cancelled: ACCENT.muted,
};

export function targetLabel(date: string | null | undefined) {
  if (!date) return "Sin fecha";
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function AgentStack({ agents }: { agents: string[] }) {
  if (!agents.length) return <span className="text-xs text-muted-foreground">Sin agentes</span>;
  return (
    <span className="flex items-center">
      {agents.slice(0, 4).map((agent, index) => (
        <span key={agent} className={cn(index > 0 && "-ml-1")} title={agent}><Avatar name={agent} size="sm" ring="var(--background)" /></span>
      ))}
      {agents.length > 4 ? <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">+{agents.length - 4}</span> : null}
    </span>
  );
}

export function budgetState(project: DemoProject): { percent: number; over: boolean; color: string; spent: number; budget: number } | null {
  if (!project.budgetCents) return null;
  const spent = project.spentCents ?? 0;
  const percent = Math.round((spent / project.budgetCents) * 100);
  return { percent, over: percent > 100, color: percent > 100 ? ACCENT.risk : percent >= 85 ? ACCENT.yellow : ACCENT.mint, spent, budget: project.budgetCents };
}

export function BudgetMeter({ project, compact = false }: { project: DemoProject; compact?: boolean }) {
  const state = budgetState(project);
  if (!state) return compact ? <span className="text-xs text-muted-foreground">Sin presupuesto</span> : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">Coste {euros(state.spent)} de {euros(state.budget)}</span>
        <span className="shrink-0 font-medium tabular-nums" style={{ color: state.over ? readable(ACCENT.risk) : undefined }}>{state.percent} %</span>
      </div>
      <Progress value={Math.min(100, state.percent)} color={state.color} />
      {state.over && !compact ? <p className="text-xs" style={{ color: readable(ACCENT.risk) }}>Excedido en {euros(state.spent - state.budget)}</p> : null}
    </div>
  );
}

export function ProjectCard({ project, tasks, index, readOnly, highlightNoCustomer, onOpen, onRestore }: {
  project: DemoProject; tasks: DemoTask[]; index: number; readOnly: boolean; highlightNoCustomer: boolean; onOpen: () => void; onRestore: () => void;
}) {
  const tokens = useMotionTokens();
  const progress = projectProgress(project.id, tasks);
  const accent = BRAND(project.color);
  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); }
  }
  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: project.archived ? 0.8 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      onClick={onOpen}
      onKeyDown={onKey}
      className={cn(
        "group relative flex min-w-0 cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl border border-border p-4 text-left",
        "transition-[transform,box-shadow] duration-(--motion-duration-fast) ease-(--motion-ease-out-expo) hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: project.archived ? tint(ACCENT.muted, 40) : `linear-gradient(90deg, ${accent}, ${tint(accent, 30)})` }} />
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint(project.archived ? ACCENT.muted : accent, 28), color: readable(project.archived ? ACCENT.muted : accent) }}><FolderKanban className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{project.customer ?? "Proyecto interno"}</p>
        </div>
        <Pill color={project.archived ? ACCENT.muted : PROJECT_STATUS_COLOR[project.status]}>{project.archived ? "Archivado" : PROJECT_STATUS_LABEL[project.status]}</Pill>
      </div>
      <p className="line-clamp-2 break-words text-sm text-muted-foreground">{project.description}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{progress.total ? `${progress.done} de ${progress.total} ${progress.total === 1 ? "tarea hecha" : "tareas hechas"}` : "Sin tareas todavía"}</span>
          <span className="tabular-nums">{progress.percent} %</span>
        </div>
        <Progress value={progress.percent} color={accent} />
      </div>
      <BudgetMeter project={project} compact />
      <div className="flex items-center justify-between gap-2">
        <AgentStack agents={project.agents} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {progress.blocked ? <Pill color={ACCENT.risk} strong><AlertOctagon className="h-3 w-3" />{progress.blocked}</Pill> : null}
          <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{targetLabel(project.targetDate)}</span>
        </div>
      </div>
      {highlightNoCustomer && !project.customer ? (
        <button type="button" disabled={readOnly} onClick={(event) => { event.stopPropagation(); }} className="self-start rounded-full border border-dashed px-2.5 py-0.5 text-xs transition-colors duration-(--motion-duration-fast) hover:bg-accent disabled:opacity-50" style={{ borderColor: ACCENT.yellow, color: readable(ACCENT.yellow) }}>Asignar cliente</button>
      ) : null}
      {project.archived ? (
        <Button size="sm" variant="outline" className="self-start" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onRestore(); }}><RotateCcw className="h-3.5 w-3.5" />Restaurar</Button>
      ) : null}
    </motion.div>
  );
}

export function ProjectDetail({ project, tasks, readOnly, onBack, onRestore }: { project: DemoProject; tasks: DemoTask[]; readOnly: boolean; onBack: () => void; onRestore: () => void }) {
  const tokens = useMotionTokens();
  const progress = projectProgress(project.id, tasks);
  const own = tasks.filter((task) => task.projectId === project.id);
  const accent = BRAND(project.color);
  const budget = budgetState(project);
  const columns: { status: DemoTask["status"]; items: DemoTask[] }[] = (["blocked", "todo", "in_progress", "in_review", "done"] as const).map((status) => ({ status, items: own.filter((task) => task.status === status) }));
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-5">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}><ArrowLeft className="h-4 w-4" />Todos los proyectos</Button>

      {budget?.over && !project.archived ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.risk, 14), boxShadow: `inset 0 0 0 1px ${tint(ACCENT.risk, 45)}` }}>
          <Wallet className="h-5 w-5 shrink-0" style={{ color: readable(ACCENT.risk) }} />
          <span className="min-w-0 flex-1"><strong>Presupuesto superado.</strong> Lleva {euros(budget.spent)} de {euros(budget.budget)} ({budget.percent} %). Sus agentes siguen consumiendo hasta que decidas.</span>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" disabled={readOnly} style={readOnly ? undefined : { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>Subir presupuesto</Button>
            <Button size="sm" variant="outline" disabled={readOnly}>Pausar agentes</Button>
          </span>
        </div>
      ) : null}
      {project.archived ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.muted, 14) }}>
          <span className="min-w-0 flex-1"><strong>Proyecto archivado.</strong> No aparece en las listas ni recibe tareas nuevas; sus tareas y su historial se conservan.</span>
          <Button size="sm" variant="outline" disabled={readOnly} onClick={onRestore}><RotateCcw className="h-3.5 w-3.5" />Restaurar</Button>
        </div>
      ) : null}

      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border p-5" style={{ background: `linear-gradient(135deg, ${tint(accent, 22)}, transparent 65%)` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words text-xl font-semibold">{project.name}</h2><Pill color={PROJECT_STATUS_COLOR[project.status]} strong>{PROJECT_STATUS_LABEL[project.status]}</Pill></div>
            <p className="mt-1 break-words text-sm text-muted-foreground">{project.description}</p>
          </div>
          {readOnly || project.archived ? null : <Button size="sm"><Plus className="h-4 w-4" />Tarea en este proyecto</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5"><span className="text-xs text-muted-foreground">Progreso</span><span className="text-lg font-semibold tabular-nums">{progress.percent} %</span><Progress value={progress.percent} color={accent} /></div>
          <div className="flex min-w-0 flex-col gap-1.5"><span className="text-xs text-muted-foreground">Cliente y fecha</span><span className="truncate text-sm font-medium">{project.customer ?? "Interno"}</span><span className="text-xs text-muted-foreground">Objetivo: {targetLabel(project.targetDate)}</span></div>
          <div className="flex min-w-0 flex-col gap-1.5"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Equipo{project.lead ? ` · lidera ${project.lead}` : ""}</span><AgentStack agents={project.agents} /></div>
          <div className="flex min-w-0 flex-col gap-1.5"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" />Presupuesto</span>{budget ? <BudgetMeter project={project} /> : <span className="text-sm text-muted-foreground">Sin presupuesto</span>}</div>
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
                    <p className={cn("break-words font-medium leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
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

export function NewProjectForm({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
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

export function ProjectsEmpty({ onCreate, readOnly }: { onCreate: () => void; readOnly: boolean }) {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.lilac}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><FolderKanban className="h-8 w-8" /></motion.span>
      <div><h2 className="text-lg font-semibold">Agrupa tu trabajo en proyectos</h2><p className="mx-auto max-w-sm text-sm text-muted-foreground">Es opcional: puedes encargar tareas sin proyecto. Úsalos cuando algo tenga varias tareas, un cliente y una fecha.</p></div>
      {readOnly ? null : <Button onClick={onCreate}><Plus className="h-4 w-4" />Crear el primero</Button>}
    </div>
  );
}

export { ReadOnlyBanner };
