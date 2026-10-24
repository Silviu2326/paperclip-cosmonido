import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, readable, tint, useMotionTokens } from "../motion";
import { ACCENT } from "../parts";
import { PRIORITY_COLOR } from "../tasks/task-parts";
import { PROJECT_STATUS_LABEL, projectProgress, type DemoProject, type DemoTask } from "../tasks/demo-data";
import { AgentStack } from "./project-parts";

const RANGE_START = new Date("2026-09-01T00:00:00Z").getTime();
const RANGE_END = new Date("2027-03-01T00:00:00Z").getTime();
const TODAY = new Date("2026-10-24T00:00:00Z").getTime();
const DAY = 86_400_000;
const MONTHS = ["sep", "oct", "nov", "dic", "ene", "feb"];

const pct = (time: number) => ((Math.max(RANGE_START, Math.min(RANGE_END, time)) - RANGE_START) / (RANGE_END - RANGE_START)) * 100;

/** Start and end of a project bar, with flags for what the data does not say. */
function span(project: DemoProject) {
  const target = project.targetDate ? new Date(project.targetDate).getTime() : null;
  const start = project.startDate ? new Date(project.startDate).getTime() : target ? target - 60 * DAY : TODAY;
  // Without a target date the bar keeps running: it reaches a few weeks past today and is drawn dashed.
  const end = target ?? Math.max(start + 45 * DAY, TODAY + 21 * DAY);
  return { start, end, openEnd: target === null, guessedStart: !project.startDate, beyond: end > RANGE_END, before: end < RANGE_START };
}

/** Variant B: each project is a bar from its start to its target date, with progress, today and task due dates. */
export function ProjectsGantt({ projects, tasks, onOpen }: { projects: DemoProject[]; tasks: DemoTask[]; onOpen: (id: string) => void }) {
  const tokens = useMotionTokens();
  const todayLeft = pct(TODAY);
  return (
    <div className="min-w-0 overflow-x-auto rounded-2xl border border-border" aria-label="Línea de tiempo de proyectos">
      <div className="relative min-w-max sm:min-w-0">
        <div className="grid grid-cols-[11rem_minmax(36rem,1fr)] border-b border-border text-xs text-muted-foreground sm:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="px-3 py-2 font-medium">Proyecto</div>
          <div className="relative h-8">
            {MONTHS.map((month, index) => (
              <span key={month} className="absolute top-0 flex h-full items-center border-l border-border pl-2 font-medium uppercase tracking-wide" style={{ left: `${(index / MONTHS.length) * 100}%`, width: `${100 / MONTHS.length}%` }}>{month}</span>
            ))}
          </div>
        </div>

        <div className="relative">
          {projects.map((project, index) => {
            const range = span(project);
            const left = pct(range.start);
            const right = pct(range.end);
            const width = Math.max(1.5, right - left);
            const progress = projectProgress(project.id, tasks);
            const accent = BRAND(project.color);
            const dots = tasks.filter((task) => task.projectId === project.id && task.dueDate && task.status !== "done").slice(0, 5);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpen(project.id)}
                title={`${project.name} · ${PROJECT_STATUS_LABEL[project.status]} · ${progress.percent} %`}
                className="grid w-full grid-cols-[11rem_minmax(36rem,1fr)] items-center border-b border-border text-left transition-colors duration-(--motion-duration-fast) last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[15rem_minmax(0,1fr)]"
              >
                <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="min-w-0 truncate">{project.customer ?? "Interno"}</span><AgentStack agents={project.agents.slice(0, 2)} /></span>
                </div>
                <div className="relative h-12">
                  {range.before ? null : (
                    <motion.div
                      className={cn("absolute top-3 flex h-6 items-center overflow-hidden rounded-lg", range.openEnd && "border border-dashed")}
                      style={{ left: `${left}%`, width: `${width}%`, background: tint(accent, range.openEnd ? 14 : 30), borderColor: range.openEnd ? accent : undefined }}
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: project.archived ? 0.6 : 1 }}
                      transition={{ duration: tokens.slow, ease: tokens.easeOut, delay: Math.min(index, 10) * tokens.stagger }}
                    >
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${progress.percent}%`, background: accent }} />
                      <span className="relative truncate px-2 text-xs font-medium" style={{ color: readable(accent) }}>{progress.percent} %</span>
                    </motion.div>
                  )}
                  {range.beyond ? <ArrowRight aria-label="Termina después de febrero" className="absolute right-1 top-4 h-4 w-4" style={{ color: readable(accent) }} /> : null}
                  {dots.map((task) => {
                    const at = pct(new Date(task.dueDate!).getTime());
                    return <span key={task.id} title={`${task.identifier} · ${task.title}`} className="absolute top-1.5 h-2 w-2 rotate-45 rounded-sm" style={{ left: `calc(${at}% - 4px)`, background: PRIORITY_COLOR[task.priority] }} />;
                  })}
                </div>
              </button>
            );
          })}
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px sm:right-auto" style={{ left: `calc(11rem + (100% - 11rem) * ${todayLeft / 100})`, background: ACCENT.risk, opacity: 0.55 }} />
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded" style={{ background: ACCENT.turquoise }} />progreso</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded border border-dashed" style={{ borderColor: ACCENT.turquoise }} />sin fecha de fin (estimada)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rotate-45" style={{ background: ACCENT.sky }} />tarea con fecha</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px" style={{ background: ACCENT.risk }} />hoy</span>
      </p>
    </div>
  );
}
