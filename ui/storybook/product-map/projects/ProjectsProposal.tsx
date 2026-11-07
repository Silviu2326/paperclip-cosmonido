import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CheckCircle2, Plus, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT } from "../parts";
import { ErrorState, LoadMore, LoadingFrame, ReadOnlyBanner, Skel, VariantFrame, useScenario, type BaseScenario } from "../tasks/state-parts";
import { LONG_PROJECTS, LONG_TASKS, MANY_PROJECTS, MANY_TASKS } from "../tasks/demo-extra";
import { DEMO_PROJECTS, DEMO_TASKS, type DemoProject, type DemoTask } from "../tasks/demo-data";
import { ProjectsGantt } from "./ProjectsGantt";
import { ProjectsTable } from "./ProjectsTable";
import { NewProjectForm, ProjectCard, ProjectDetail, ProjectsEmpty, budgetState } from "./project-parts";

export type ProjectsScenario = BaseScenario | "archivado" | "sin-cliente" | "presupuesto-excedido";
export type ProjectsVariant = "a" | "b" | "c";

type Filter = "active" | "planned" | "all" | "archived";
const FILTERS: { id: Filter; label: string; match: (project: DemoProject) => boolean }[] = [
  { id: "active", label: "En curso", match: (project) => !project.archived && project.status === "in_progress" },
  { id: "planned", label: "Próximos", match: (project) => !project.archived && (project.status === "planned" || project.status === "backlog") },
  { id: "all", label: "Todos", match: (project) => !project.archived },
  { id: "archived", label: "Archivados", match: (project) => Boolean(project.archived) },
];
const PAGE = 12;

function dataFor(scenario: ProjectsScenario, projects: DemoProject[], tasks: DemoTask[]): { projects: DemoProject[]; tasks: DemoTask[] } {
  switch (scenario) {
    case "many": return { projects: MANY_PROJECTS, tasks: MANY_TASKS };
    case "long": return { projects: LONG_PROJECTS, tasks: LONG_TASKS };
    case "sin-cliente": return { projects: projects.map((project) => (["pj2", "pj3", "pj4"].includes(project.id) ? { ...project, customer: null } : project)), tasks };
    case "presupuesto-excedido": return { projects: projects.map((project) => (project.id === "pj1" ? { ...project, spentCents: 97200 } : project.id === "pj3" ? { ...project, spentCents: 38500 } : project)), tasks };
    default: return { projects, tasks };
  }
}

/** Projects with the shared toolbar. `scenario` picks the state and `variant` the design (cards, Gantt, table). */
function ProjectsPage({ initial, tasks, scenario, variant, readOnly }: { initial: DemoProject[]; tasks: DemoTask[]; scenario: ProjectsScenario; variant: ProjectsVariant; readOnly: boolean }) {
  const tokens = useMotionTokens();
  const [projects, setProjects] = useState(initial);
  const [filter, setFilter] = useState<Filter>(scenario === "archivado" ? "archived" : scenario === "many" || scenario === "long" ? "all" : "active");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(scenario === "presupuesto-excedido" ? "pj1" : null);
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [flash, setFlash] = useState<string | null>(null);

  const active = FILTERS.find((candidate) => candidate.id === filter)!;
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => projects.filter(active.match).filter((project) => !needle || `${project.name} ${project.customer ?? ""} ${project.lead ?? ""}`.toLowerCase().includes(needle)), [projects, active, needle]);
  const visible = variant === "a" || variant === "c" ? filtered.slice(0, shown) : filtered.slice(0, Math.max(shown, 10));
  const open = projects.find((project) => project.id === openId) ?? null;
  const live = projects.filter((project) => !project.archived);
  const totals = useMemo(() => {
    const ids = new Set(live.map((project) => project.id));
    return {
      open: tasks.filter((task) => task.projectId && ids.has(task.projectId) && task.status !== "done" && task.status !== "cancelled").length,
      blocked: tasks.filter((task) => task.projectId && ids.has(task.projectId) && task.status === "blocked").length,
    };
  }, [live, tasks]);
  const noCustomer = live.filter((project) => !project.customer);
  const over = live.filter((project) => budgetState(project)?.over);

  function create(name: string) {
    const id = `new-${Date.now()}`;
    setProjects((current) => [{ id, name, description: "Proyecto nuevo. Añade tareas para empezar.", status: "planned", customer: null, lead: null, agents: [], targetDate: null, color: 4, startDate: "2026-10-24" }, ...current]);
    setFilter("all");
    setCreating(false);
    setOpenId(id);
  }
  function restore(project: DemoProject) {
    if (readOnly) return;
    setProjects((current) => current.map((candidate) => (candidate.id === project.id ? { ...candidate, archived: false } : candidate)));
    setFlash(`«${project.name}» restaurado: vuelve a las listas`);
    window.setTimeout(() => setFlash(null), 3500);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <AnimatePresence mode="wait">
        {open ? <ProjectDetail key={open.id} project={open} tasks={tasks} readOnly={readOnly} onBack={() => setOpenId(null)} onRestore={() => restore(open)} /> : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex min-w-0 flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Proyectos</h1>
                {projects.length ? <p className="text-sm text-muted-foreground">{live.filter((project) => project.status === "in_progress").length} en curso · {totals.open} tareas abiertas · {totals.blocked} bloqueadas</p> : null}
              </div>
              {readOnly ? null : <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo proyecto</Button>}
            </header>
            {readOnly ? <ReadOnlyBanner /> : null}
            <AnimatePresence>{creating ? <NewProjectForm onCreate={create} onCancel={() => setCreating(false)} /> : null}</AnimatePresence>
            <AnimatePresence>
              {flash ? (
                <motion.div role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm" style={{ background: tint(ACCENT.mint, 24) }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />{flash}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {scenario === "presupuesto-excedido" && over.length ? (
              <div role="alert" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: tint(ACCENT.risk, 14) }}>
                <Wallet className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.risk) }} />
                <span className="min-w-0"><strong>{over.length === 1 ? "1 proyecto ha superado" : `${over.length} proyectos han superado`} su presupuesto:</strong> {over.map((project) => project.name).join(", ")}.</span>
              </div>
            ) : null}
            {scenario === "sin-cliente" && noCustomer.length ? (
              <div className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: tint(ACCENT.yellow, 22) }}>
                <span className="min-w-0"><strong>{noCustomer.length} proyectos no tienen cliente.</strong> Su coste y su trabajo no se cuentan en ninguna ficha de cliente. Pulsa «Asignar cliente» en cada tarjeta.</span>
              </div>
            ) : null}

            {projects.length === 0 ? <ProjectsEmpty readOnly={readOnly} onCreate={() => setCreating(true)} /> : <>
              <div className="flex flex-wrap items-center gap-3">
                <LayoutGroup id="project-filters">
                  <div className="flex flex-wrap gap-1.5">
                    {FILTERS.map((candidate) => {
                      const selected = filter === candidate.id;
                      const count = projects.filter(candidate.match).length;
                      if (candidate.id === "archived" && count === 0) return null;
                      return (
                        <button key={candidate.id} onClick={() => { setFilter(candidate.id); setShown(PAGE); }} className={cn("relative rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", selected ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
                          {selected ? <motion.span layoutId="project-filter-pill" className="absolute inset-0 rounded-full" style={{ background: tint(ACCENT.turquoise, 30) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                          <span className="relative">{candidate.label} · {count}</span>
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
                {projects.length > 8 ? (
                  <div className="flex min-w-40 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input aria-label="Buscar proyecto" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar por nombre, cliente o responsable" value={query} onChange={(event) => { setQuery(event.target.value); setShown(PAGE); }} />
                  </div>
                ) : null}
              </div>

              {variant === "b" ? <ProjectsGantt projects={visible} tasks={tasks} onOpen={setOpenId} />
                : variant === "c" ? <ProjectsTable projects={visible} tasks={tasks} onOpen={setOpenId} />
                : (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence mode="popLayout">
                      {visible.map((project, index) => (
                        <ProjectCard key={project.id} project={project} tasks={tasks} index={index} readOnly={readOnly} highlightNoCustomer={scenario === "sin-cliente"} onOpen={() => setOpenId(project.id)} onRestore={() => restore(project)} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              {filtered.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{needle ? `Ningún proyecto coincide con «${query}».` : "Ningún proyecto en esta vista."}</p> : null}
              <LoadMore shown={Math.min(visible.length, filtered.length)} total={filtered.length} step={12} onMore={() => setShown((value) => value + 12)} />
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />El progreso es el porcentaje de tareas hechas. Pulsa un proyecto para ver sus tareas por estado.</p>
            </>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectsSkeleton({ variant }: { variant: ProjectsVariant }) {
  return (
    <div className="p-4 sm:p-6">
      <LoadingFrame label="Cargando proyectos">
        <div className="flex items-end justify-between gap-3"><div className="flex flex-col gap-2"><Skel className="h-7 w-36" /><Skel className="h-4 w-64" delay={0.1} /></div><Skel className="h-9 w-36 rounded-lg" delay={0.15} /></div>
        <div className="flex gap-2">{["w-20", "w-24", "w-16"].map((width, index) => <Skel key={index} className={cn("h-7 rounded-full", width)} delay={index * 0.08} />)}</div>
        {variant === "a" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                <div className="flex gap-3"><Skel className="h-10 w-10 rounded-xl" delay={index * 0.06} /><div className="flex flex-1 flex-col gap-2"><Skel className="h-4 w-3/4" delay={index * 0.06} /><Skel className="h-3 w-1/2" delay={index * 0.06} /></div></div>
                <Skel className="h-3 w-full" delay={index * 0.06} /><Skel className="h-1.5 w-full rounded-full" delay={index * 0.06} /><Skel className="h-6 w-24 rounded-full" delay={index * 0.06} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">{Array.from({ length: 7 }, (_, index) => <Skel key={index} className={cn("w-full", variant === "b" ? "h-11" : "h-10")} delay={index * 0.07} />)}</div>
        )}
      </LoadingFrame>
    </div>
  );
}

/** Proyectos: cards with progress, customer, agents, budget and blockers; detail with the tasks grouped by state. */
export function ProjectsProposal({ projects, scenario: initialScenario = "normal", variant = "a" }: { projects: DemoProject[]; scenario?: ProjectsScenario; variant?: ProjectsVariant }) {
  const { scenario, retry, retrying } = useScenario<ProjectsScenario>(initialScenario, "normal");
  if (scenario === "loading" || (retrying && scenario === "error")) return <ProjectsSkeleton variant={variant} />;
  if (scenario === "error") return <div className="p-4 sm:p-6"><ErrorState what="tus proyectos" onRetry={retry} retrying={retrying} /></div>;
  const base = projects.length === 0 ? { projects, tasks: DEMO_TASKS } : dataFor(scenario, projects, DEMO_TASKS);
  return <ProjectsPage key={`${variant}-${scenario}`} initial={base.projects} tasks={base.tasks} scenario={scenario} variant={variant} readOnly={scenario === "readonly"} />;
}

/** The three designs as tabs, each with one line on what it prioritises. */
export function ProjectsVariants({ projects }: { projects: DemoProject[] }) {
  return (
    <VariantFrame id="projects" variants={[
      { id: "a", label: "A · Tarjetas", summary: "reconocer cada proyecto de un vistazo: progreso, equipo, presupuesto y bloqueos en una tarjeta. Es la más visual.", render: () => <ProjectsProposal projects={projects} variant="a" /> },
      { id: "b", label: "B · Línea de tiempo", summary: "el calendario: cuándo empieza y acaba cada proyecto, qué se solapa y qué llega tarde. Útil para repartir carga entre meses.", render: () => <ProjectsProposal projects={projects} variant="b" /> },
      { id: "c", label: "C · Tabla", summary: "comparar y ordenar muchos proyectos por progreso, coste o fecha. La más densa y la que mejor escala a decenas.", render: () => <ProjectsProposal projects={projects} variant="c" /> },
    ]} />
  );
}

