import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, readable, useMotionTokens } from "../motion";
import { ACCENT, Pill, Progress } from "../parts";
import { PROJECT_STATUS_LABEL, projectProgress, type DemoProject, type DemoTask } from "../tasks/demo-data";
import { AgentStack, BudgetMeter, PROJECT_STATUS_COLOR, budgetState, targetLabel } from "./project-parts";

type SortKey = "name" | "customer" | "status" | "progress" | "open" | "cost" | "target";
type Direction = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "name", label: "Proyecto" },
  { key: "customer", label: "Cliente", className: "hidden md:table-cell" },
  { key: "status", label: "Estado" },
  { key: "progress", label: "Progreso" },
  { key: "open", label: "Abiertas", className: "hidden sm:table-cell" },
  { key: "cost", label: "Coste / presupuesto", className: "hidden lg:table-cell" },
  { key: "target", label: "Fecha" },
];

/** Variant C: sortable table. Click a header to sort; click again to reverse; click a row to open the project. */
export function ProjectsTable({ projects, tasks, onOpen }: { projects: DemoProject[]; tasks: DemoTask[]; onOpen: (id: string) => void }) {
  const tokens = useMotionTokens();
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: "target", direction: "asc" });

  const rows = useMemo(() => {
    const decorated = projects.map((project) => ({ project, progress: projectProgress(project.id, tasks), budget: budgetState(project) }));
    const value = (row: (typeof decorated)[number]): string | number => {
      switch (sort.key) {
        case "name": return row.project.name.toLowerCase();
        case "customer": return (row.project.customer ?? "￿").toLowerCase();
        case "status": return row.project.status;
        case "progress": return row.progress.percent;
        case "open": return row.progress.open;
        case "cost": return row.budget?.percent ?? -1;
        case "target": return row.project.targetDate ?? "9999";
      }
    };
    return [...decorated].sort((a, b) => {
      const first = value(a);
      const second = value(b);
      const order = first < second ? -1 : first > second ? 1 : 0;
      return sort.direction === "asc" ? order : -order;
    });
  }, [projects, tasks, sort]);

  function toggle(key: SortKey) {
    setSort((current) => (current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "progress" || key === "cost" || key === "open" ? "desc" : "asc" }));
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-0 border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th key={column.key} scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", column.className)}>
                  <button type="button" onClick={() => toggle(column.key)} className={cn("inline-flex items-center gap-1 transition-colors duration-(--motion-duration-fast) hover:text-foreground", active && "text-foreground")}>
                    {column.label}<Icon className={cn("h-3 w-3", !active && "opacity-40")} />
                  </button>
                </th>
              );
            })}
            <th scope="col" className="hidden px-3 py-2 font-medium xl:table-cell">Equipo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ project, progress, budget }, index) => (
            <motion.tr
              key={project.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: project.archived ? 0.65 : 1 }}
              transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 10) * tokens.stagger }}
              tabIndex={0}
              onClick={() => onOpen(project.id)}
              onKeyDown={(event) => { if (event.key === "Enter") onOpen(project.id); }}
              className="cursor-pointer border-b border-border transition-colors duration-(--motion-duration-fast) last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <td className="max-w-64 min-w-40 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{ background: BRAND(project.color) }} />
                  <div className="min-w-0"><p className="truncate font-medium">{project.name}</p><p className="truncate text-xs text-muted-foreground md:hidden">{project.customer ?? "Interno"}</p></div>
                </div>
              </td>
              <td className="hidden max-w-40 px-3 py-2.5 md:table-cell"><span className="block truncate text-muted-foreground">{project.customer ?? "Interno"}</span></td>
              <td className="px-3 py-2.5"><Pill color={project.archived ? ACCENT.muted : PROJECT_STATUS_COLOR[project.status]}>{project.archived ? "Archivado" : PROJECT_STATUS_LABEL[project.status]}</Pill></td>
              <td className="w-36 px-3 py-2.5">
                <div className="flex items-center gap-2"><div className="min-w-12 flex-1"><Progress value={progress.percent} color={BRAND(project.color)} /></div><span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{progress.percent} %</span></div>
              </td>
              <td className="hidden px-3 py-2.5 tabular-nums sm:table-cell">{progress.open}{progress.blocked ? <span className="ml-1.5 text-xs" style={{ color: readable(ACCENT.risk) }}>({progress.blocked} bloq.)</span> : null}</td>
              <td className="hidden w-52 px-3 py-2.5 lg:table-cell">{budget ? <BudgetMeter project={project} compact /> : <span className="text-xs text-muted-foreground">Sin presupuesto</span>}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{targetLabel(project.targetDate)}</td>
              <td className="hidden px-3 py-2.5 xl:table-cell"><AgentStack agents={project.agents} /></td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
