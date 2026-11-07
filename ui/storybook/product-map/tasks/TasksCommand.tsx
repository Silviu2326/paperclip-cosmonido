import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, CheckCircle2, ChevronRight, Flag, Folder, User } from "lucide-react";
import type { IssuePriority, IssueStatus } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar } from "../parts";
import { DEMO_CUSTOMERS } from "../customers/demo-data";
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER, type DemoTask } from "./demo-data";
import { LoadMore, ReadOnlyBanner } from "./state-parts";
import { PRIORITY_COLOR, STATUS_STYLE, StatusDot, TasksEmptyState, dueLabel } from "./task-parts";

const AGENTS = ["Marta", "Diego", "Leo", "Nora"];
const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6 };
const TODAY = new Date("2026-10-24T00:00:00Z");

export interface ParsedTask {
  title: string;
  assignee: string | null;
  customer: string | null;
  dueDate: string | null;
  dueLabel: string | null;
  priority: IssuePriority;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const plusDays = (days: number) => new Date(TODAY.getTime() + days * 86_400_000);

/**
 * Turns «revisar el vídeo de Yoga mañana @leo urgente» into a title plus the
 * assignee, customer, date and priority it found. Understands hoy, mañana,
 * pasado mañana and weekday names; customers by any word of their name.
 */
export function parseTaskText(text: string): ParsedTask {
  let rest = ` ${text.trim()} `;
  const take = (pattern: RegExp) => {
    const match = rest.match(pattern);
    if (match) rest = rest.replace(pattern, " ");
    return match;
  };

  let assignee: string | null = null;
  const mention = take(/\s@([\p{L}]+)/iu);
  if (mention) assignee = AGENTS.find((agent) => agent.toLowerCase() === mention[1]!.toLowerCase()) ?? null;

  let priority: IssuePriority = "medium";
  if (take(/\s(urgente|ya|asap)(?=\s)/i) || take(/\s!{1,2}(?=\s)/)) priority = "high";
  if (take(/\s(sin prisa|cuando puedas)(?=\s)/i)) priority = "low";

  let dueDate: string | null = null;
  let label: string | null = null;
  if (take(/\spasado mañana(?=\s)/i)) { dueDate = iso(plusDays(2)); label = "pasado mañana"; }
  else if (take(/\smañana(?=\s)/i)) { dueDate = iso(plusDays(1)); label = "mañana"; }
  else if (take(/\shoy(?=\s)/i)) { dueDate = iso(plusDays(0)); label = "hoy"; }
  else {
    const weekday = take(/\s(?:el\s)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?=\s)/i);
    if (weekday) {
      const target = WEEKDAYS[weekday[1]!.toLowerCase()]!;
      const diff = ((target - TODAY.getUTCDay() + 7) % 7) || 7;
      dueDate = iso(plusDays(diff));
      label = weekday[1]!.toLowerCase();
    }
  }

  const lower = rest.toLowerCase();
  const customer = DEMO_CUSTOMERS.find((candidate) => candidate.name.toLowerCase().split(/\s+/).some((word) => word.length >= 4 && !["clínica", "estudio", "taller", "panadería", "dental", "mecánico"].includes(word) && lower.includes(word)))?.name ?? null;
  if (!assignee && customer) assignee = DEMO_CUSTOMERS.find((candidate) => candidate.name === customer)?.owner.split(" ")[0] ?? null;

  const title = rest.replace(/\s+/g, " ").trim();
  return { title: title ? title[0]!.toUpperCase() + title.slice(1) : "", assignee: assignee && AGENTS.includes(assignee) ? assignee : null, customer, dueDate, dueLabel: label, priority };
}

const SHORTCUTS: [string, string][] = [["j / k", "bajar / subir"], ["Intro", "abrir"], ["x", "marcar hecha"], ["a", "avanzar de estado"], ["/", "filtrar"], ["n", "nueva"]];

function Chip({ icon: Icon, color, children }: { icon: typeof User; color: string; children: string }) {
  const tokens = useMotionTokens();
  return (
    <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tint(color, 22), color: readable(color) }}>
      <Icon className="h-3 w-3" />{children}
    </motion.span>
  );
}

const NEXT: Partial<Record<IssueStatus, IssueStatus>> = { backlog: "todo", todo: "in_progress", in_progress: "in_review", in_review: "done", blocked: "in_progress" };
const PAGE = 40;

/** Variant C: dense list driven from the keyboard. Type to create (natural language) or "/" to filter. */
export function TasksCommand({ initial, scenario, readOnly }: { initial: DemoTask[]; scenario: string; readOnly: boolean }) {
  const tokens = useMotionTokens();
  const [tasks, setTasks] = useState(initial);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [openId, setOpenId] = useState<string | null>(scenario === "bloqueada-con-dependencia" ? "t2" : scenario === "con-revision" ? "t1" : scenario === "en-ejecucion" ? "t5" : null);
  const [flash, setFlash] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const filtering = text.startsWith("/");
  const needle = filtering ? text.slice(1).trim().toLowerCase() : "";
  const sorted = useMemo(() => [...tasks].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)), [tasks]);
  const rows = useMemo(() => sorted.filter((task) => !needle || `${task.title} ${task.identifier} ${task.customer ?? ""} ${task.assignee ?? ""} ${STATUS_LABEL[task.status]}`.toLowerCase().includes(needle)), [sorted, needle]);
  const parsed = useMemo(() => (filtering ? null : parseTaskText(text)), [text, filtering]);
  const current = rows[Math.min(cursor, rows.length - 1)] ?? null;

  useEffect(() => { setCursor(0); }, [needle]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${current?.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current?.id]);

  function advance(task: DemoTask, status: IssueStatus) {
    if (readOnly) return;
    setTasks((all) => all.map((candidate) => (candidate.id === task.id ? { ...candidate, status, unread: false, review: status === "done" ? undefined : candidate.review } : candidate)));
    setFlash(`${task.identifier} → ${STATUS_LABEL[status]}`);
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (readOnly || filtering || !parsed?.title) return;
    const id = `new-${Date.now()}`;
    const task: DemoTask = {
      id, identifier: `PAP-${440 + tasks.length}`, title: parsed.title, status: "todo", priority: parsed.priority, assignee: parsed.assignee ?? "Marta", projectId: null, customer: parsed.customer, dueDate: parsed.dueDate,
      updatedAt: "ahora", mine: true, unread: false, description: "", result: null, thread: [],
    };
    setTasks((all) => [task, ...all]);
    setText("");
    setCursor(0);
    setFlash(`${task.identifier} creada${parsed.assignee ? ` para ${parsed.assignee}` : ""}${parsed.dueLabel ? ` · ${parsed.dueLabel}` : ""}`);
  }
  function onListKey(event: KeyboardEvent) {
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    const last = Math.min(rows.length, limit) - 1;
    if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(value + 1, last)); }
    else if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)); }
    else if (event.key === "Enter" && current) { event.preventDefault(); setOpenId((id) => (id === current.id ? null : current.id)); }
    else if (event.key === "x" && current && current.status !== "done") advance(current, "done");
    else if (event.key === "a" && current && NEXT[current.status]) advance(current, NEXT[current.status]!);
    else if (event.key === "/" || event.key === "n") { event.preventDefault(); input.current?.focus(); if (event.key === "/") setText("/"); }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tareas</h1>
          <p className="text-sm text-muted-foreground">{tasks.filter((task) => task.status !== "done").length} abiertas · {tasks.filter((task) => task.status === "blocked").length} bloqueadas</p>
        </div>
      </header>
      {readOnly ? <ReadOnlyBanner /> : null}

      <form onSubmit={create} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border p-3 transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30" style={{ background: tint(ACCENT.turquoise, 6) }}>
        <div className="flex items-center gap-2 font-mono text-sm">
          <span aria-hidden="true" style={{ color: readable(ACCENT.turquoise) }}>{filtering ? "/" : "›"}</span>
          <input
            ref={input}
            aria-label="Escribe una tarea o un filtro"
            value={filtering ? text.slice(1) : text}
            disabled={readOnly}
            onChange={(event) => setText(filtering ? `/${event.target.value}` : event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { setText(""); (event.target as HTMLInputElement).blur(); list.current?.focus(); } if (event.key === "Backspace" && filtering && text === "/") setText(""); }}
            placeholder={readOnly ? "Solo lectura" : "revisar el vídeo de Yoga mañana @leo urgente"}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 text-xs text-muted-foreground sm:block">{filtering ? "Esc" : "Intro"}</kbd>
        </div>
        <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
          {filtering ? <span className="text-muted-foreground">Filtrando: {rows.length} de {tasks.length} tareas</span>
            : parsed?.title ? <>
              <span className="text-muted-foreground">Se creará:</span>
              <span className="min-w-0 max-w-full truncate font-medium">{parsed.title}</span>
              {parsed.assignee ? <Chip icon={User} color={ACCENT.turquoise}>{parsed.assignee}</Chip> : <Chip icon={User} color={ACCENT.muted}>Marta (sugerida)</Chip>}
              {parsed.customer ? <Chip icon={Folder} color={ACCENT.mint}>{parsed.customer}</Chip> : null}
              {parsed.dueLabel ? <Chip icon={CalendarDays} color={ACCENT.sky}>{parsed.dueLabel}</Chip> : null}
              {parsed.priority !== "medium" ? <Chip icon={Flag} color={PRIORITY_COLOR[parsed.priority]}>{`Prioridad ${PRIORITY_LABEL[parsed.priority].toLowerCase()}`}</Chip> : null}
            </> : <span className="text-muted-foreground">Escribe como hablas: personas con @, fechas como «mañana» o «el viernes», «urgente» para subir la prioridad. «/» filtra.</span>}
        </div>
      </form>

      <AnimatePresence>
        {flash ? (
          <motion.div role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm" style={{ background: tint(ACCENT.mint, 24) }}>
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />{flash}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {tasks.length === 0 ? <TasksEmptyState readOnly={readOnly} onCreate={() => input.current?.focus()} /> : (
        <div ref={list} tabIndex={0} role="listbox" aria-label="Tareas" onKeyDown={onListKey} className="flex min-w-0 flex-col rounded-2xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Ninguna tarea coincide con «{needle}».</p> : null}
          {rows.slice(0, limit).map((task, index) => {
            const due = dueLabel(task.dueDate, task.status === "done");
            const isCursor = current?.id === task.id;
            const open = openId === task.id;
            return (
              <div key={task.id} data-row={task.id} role="option" aria-selected={isCursor} className={cn("min-w-0 border-b border-border last:border-b-0", isCursor && "bg-accent/50")} style={isCursor ? { boxShadow: `inset 3px 0 0 ${STATUS_STYLE[task.status].color}` } : undefined}>
                <button type="button" tabIndex={-1} onClick={() => { setCursor(index); setOpenId(open ? null : task.id); }} className="flex h-9 w-full min-w-0 items-center gap-2.5 px-3 text-left text-sm">
                  <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex text-muted-foreground"><ChevronRight className="h-3.5 w-3.5" /></motion.span>
                  <StatusDot status={task.status} />
                  <span className="hidden w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:block">{task.identifier}</span>
                  <span className={cn("min-w-0 flex-1 truncate", task.unread && "font-semibold", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span>
                  {task.customer ? <span className="hidden max-w-40 shrink-0 truncate text-xs text-muted-foreground md:block">{task.customer}</span> : null}
                  {due ? <span className="shrink-0 text-xs font-medium" style={{ color: due.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>{due.text}</span> : null}
                  {task.assignee ? <Avatar name={task.assignee} size="xs" /> : <span className="h-5 w-5 shrink-0 rounded-md border border-dashed border-border" />}
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                      <div className="flex min-w-0 flex-col gap-2 px-10 pb-3 text-sm">
                        {task.description ? <p className="break-words text-muted-foreground">{task.description}</p> : null}
                        {task.blockedBy?.length ? <p className="break-words text-xs" style={{ color: readable(ACCENT.risk) }}>Bloqueada por: {task.blockedBy.map((item) => `${item.identifier} ${item.title}`).join(" · ")}</p> : null}
                        {task.run ? <p className="font-mono text-xs text-muted-foreground">▸ {task.run.agent}: {task.run.step} ({task.run.stepIndex}/{task.run.steps})</p> : null}
                        {task.review ? <p className="text-xs text-muted-foreground">Revisión: {task.review.summary}</p> : null}
                        {task.thread.length ? <p className="break-words text-xs text-muted-foreground">Último mensaje · {task.thread[task.thread.length - 1]!.from}: {task.thread[task.thread.length - 1]!.text}</p> : null}
                        {readOnly ? null : (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {NEXT[task.status] ? <button type="button" className="rounded-lg border border-border px-2 py-1 transition-colors duration-(--motion-duration-fast) hover:bg-accent" onClick={() => advance(task, NEXT[task.status]!)}>Avanzar a {STATUS_LABEL[NEXT[task.status]!]} <kbd className="ml-1 text-muted-foreground">a</kbd></button> : null}
                            {task.status !== "done" ? <button type="button" className="rounded-lg border border-border px-2 py-1 transition-colors duration-(--motion-duration-fast) hover:bg-accent" onClick={() => advance(task, "done")}>Marcar hecha <kbd className="ml-1 text-muted-foreground">x</kbd></button> : null}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
      <div className="px-1"><LoadMore shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit((value) => value + 40)} step={40} /></div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Atajos de teclado">
        {SHORTCUTS.map(([key, label]) => <li key={key}><kbd className="rounded border border-border px-1.5 font-mono">{key}</kbd> {label}</li>)}
      </ul>
    </div>
  );
}
