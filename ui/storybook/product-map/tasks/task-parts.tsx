import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  GitBranch,
  Inbox,
  Link2,
  Mail,
  Pause,
  Plus,
  Send,
  Square,
  ThumbsUp,
  Undo2,
  X,
} from "lucide-react";
import type { IssuePriority, IssueStatus } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Pill, Progress, SectionTitle } from "../parts";
import { DEMO_PROJECTS, PRIORITY_LABEL, STATUS_LABEL, type DemoMessage, type DemoTask } from "./demo-data";

/** Pieces shared by the three Tareas variants (list, kanban, command line). */

export const STATUS_STYLE: Record<IssueStatus, { color: string; icon: LucideIcon }> = {
  backlog: { color: ACCENT.muted, icon: CircleDashed },
  todo: { color: ACCENT.sky, icon: Circle },
  in_progress: { color: ACCENT.turquoise, icon: CircleDot },
  in_review: { color: ACCENT.lilac, icon: Clock },
  done: { color: ACCENT.mint, icon: CheckCircle2 },
  blocked: { color: ACCENT.risk, icon: AlertOctagon },
  cancelled: { color: ACCENT.muted, icon: X },
};

export const PRIORITY_COLOR: Record<IssuePriority, string> = { critical: ACCENT.risk, high: ACCENT.yellow, medium: ACCENT.sky, low: ACCENT.muted };

export function dueLabel(dueDate: string | null, done: boolean): { text: string; urgent: boolean } | null {
  if (!dueDate || done) return null;
  const days = Math.round((new Date(dueDate).getTime() - new Date("2026-10-24").getTime()) / 86_400_000);
  if (days < 0) return { text: "Vencida", urgent: true };
  if (days === 0) return { text: "Hoy", urgent: true };
  if (days === 1) return { text: "Mañana", urgent: false };
  return { text: new Date(dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" }), urgent: false };
}

export function StatusDot({ status }: { status: IssueStatus }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return <span className="flex h-5 w-5 shrink-0 items-center justify-center" style={{ color: style.color }} aria-label={STATUS_LABEL[status]}><Icon className="h-4 w-4" /></span>;
}

export function ResultCard({ result }: { result: NonNullable<DemoTask["result"]> }) {
  const icon = result.kind === "video" ? Clapperboard : result.kind === "email" ? Mail : result.kind === "link" ? Link2 : FileText;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.mint, 14)}, transparent 70%)` }}>
      <IconTile icon={icon} color={ACCENT.mint} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{result.title}</p><p className="text-xs text-muted-foreground">{result.note}</p></div>
      <Button size="sm" variant="outline">Abrir</Button>
    </div>
  );
}

const EXTRA_LOG_LINES = [
  "Comprobado el contraste del texto sobre el fondo",
  "Maquetada la diapositiva 5",
  "Maquetando la diapositiva 6: icono y titular",
  "Maquetada la diapositiva 6",
  "Maquetando la diapositiva 7: llamada a la acción",
];

/** Tail of what an agent is doing. New lines appear while the task runs, with a blinking cursor on the last one. */
export function RunLog({ lines, running = true }: { lines: string[]; running?: boolean }) {
  const tokens = useMotionTokens();
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setExtra((count) => Math.min(count + 1, EXTRA_LOG_LINES.length)), 1600);
    return () => window.clearInterval(timer);
  }, [running]);
  const all = [...lines, ...EXTRA_LOG_LINES.slice(0, extra)];
  const shown = all.slice(-6);
  const offset = all.length - shown.length;
  return (
    <div role="log" aria-label="Registro de la ejecución" className="flex min-w-0 flex-col gap-1 rounded-xl p-3 font-mono text-xs" style={{ background: tint(ACCENT.muted, 12) }}>
      <AnimatePresence initial={false}>
        {shown.map((line, index) => {
          const last = index === shown.length - 1;
          const minute = 31 + (index + offset) * 2;
          return (
            <motion.p key={line} initial={{ opacity: 0, y: 4 }} animate={{ opacity: last ? 1 : 0.7, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 gap-2 break-words">
              <span className="shrink-0 tabular-nums text-muted-foreground">08:{String(minute).padStart(2, "0")}</span>
              <span className="min-w-0">{line}{last && running ? <motion.span aria-hidden="true" className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5" style={{ background: ACCENT.turquoise }} animate={tokens.base === 0 ? undefined : { opacity: [1, 0, 1] }} transition={{ duration: 1.1, repeat: Infinity }} /> : null}</span>
            </motion.p>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function BlockedBy({ items, readOnly }: { items: NonNullable<DemoTask["blockedBy"]>; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: tint(ACCENT.risk, 40), background: tint(ACCENT.risk, 8) }}>
      <SectionTitle color={ACCENT.risk} icon={GitBranch}>Bloqueada por {items.length === 1 ? "otra tarea" : `${items.length} tareas`}</SectionTitle>
      {items.map((item) => (
        <div key={item.identifier} className="flex min-w-0 items-center gap-2 rounded-lg bg-background/70 p-2">
          <StatusDot status={item.status} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground tabular-nums">{item.identifier} · {STATUS_LABEL[item.status]}{item.assignee ? ` · ${item.assignee}` : ""}</p></div>
          <Button size="sm" variant="ghost">Abrir</Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Se desbloquea sola cuando se completen. Si no puede esperar, pide que se priorice.</p>
      <Button size="sm" variant="outline" className="self-start" disabled={readOnly}>Pedir que se priorice</Button>
    </div>
  );
}

function RunCard({ run, readOnly }: { run: NonNullable<DemoTask["run"]>; readOnly: boolean }) {
  const percent = Math.round((run.stepIndex / run.steps) * 100);
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.turquoise, 14)}, transparent 70%)` }}>
      <SectionTitle color={ACCENT.turquoise} icon={CircleDot} action={<span className="text-xs tabular-nums text-muted-foreground">desde las {run.startedAt}</span>}>En ejecución</SectionTitle>
      <div className="flex min-w-0 items-center gap-2"><Avatar name={run.agent} size="xs" /><p className="min-w-0 flex-1 truncate text-sm">{run.step}</p></div>
      <Progress value={percent} color={ACCENT.turquoise} />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums"><span>Paso {run.stepIndex} de {run.steps}</span><span>{(run.costCents / 100).toFixed(2).replace(".", ",")} € hasta ahora</span></div>
      <RunLog lines={run.logs} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={readOnly}><Pause className="h-3.5 w-3.5" />Pausar</Button>
        <Button size="sm" variant="ghost" disabled={readOnly}><Square className="h-3.5 w-3.5" />Detener</Button>
      </div>
    </div>
  );
}

function ReviewCard({ review, readOnly, onApprove, onChanges }: { review: NonNullable<DemoTask["review"]>; readOnly: boolean; onApprove: () => void; onChanges: () => void }) {
  const [checked, setChecked] = useState(() => review.checklist.map((item) => item.ok));
  const missing = checked.filter((ok) => !ok).length;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.lilac, 14)}, transparent 70%)` }}>
      <SectionTitle color={ACCENT.lilac} icon={Clock}>Revisión pendiente</SectionTitle>
      <p className="text-sm text-muted-foreground">{review.requestedBy} pide tu visto bueno: {review.summary}</p>
      <ul className="flex flex-col gap-1.5">
        {review.checklist.map((item, index) => (
          <li key={item.text}>
            <label className={cn("flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", !checked[index] && "bg-background/70")} style={!checked[index] ? { boxShadow: `inset 0 0 0 1px ${tint(ACCENT.yellow, 60)}` } : undefined}>
              <input type="checkbox" className="mt-1" checked={checked[index]} disabled={readOnly} onChange={() => setChecked((current) => current.map((value, position) => (position === index ? !value : value)))} />
              <span className="min-w-0">{item.text}{!item.ok && !checked[index] ? <span className="block text-xs" style={{ color: readable(ACCENT.yellow) }}>Marta no pudo comprobarlo: te toca a ti.</span> : null}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={readOnly} onClick={onApprove} style={readOnly ? undefined : { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>
          <ThumbsUp className="h-3.5 w-3.5" />{missing ? `Aprobar (faltan ${missing})` : "Aprobar"}
        </Button>
        <Button size="sm" variant="outline" disabled={readOnly} onClick={onChanges}><Undo2 className="h-3.5 w-3.5" />Pedir cambios</Button>
      </div>
    </div>
  );
}

export function TaskPanel({ task, onClose, onReply, onStatus, readOnly = false }: {
  task: DemoTask;
  onClose: () => void;
  onReply: (text: string) => void;
  onStatus: (status: IssueStatus) => void;
  readOnly?: boolean;
}) {
  const tokens = useMotionTokens();
  const [draft, setDraft] = useState("");
  const project = DEMO_PROJECTS.find((candidate) => candidate.id === task.projectId);
  const style = STATUS_STYLE[task.status];
  const nextAction: { label: string; status: IssueStatus } | null =
    task.review ? null
    : task.status === "in_review" ? { label: "Aprobar y cerrar", status: "done" }
    : task.status === "blocked" ? { label: "Desbloquear", status: "in_progress" }
    : task.status === "todo" || task.status === "backlog" ? { label: "Empezar", status: "in_progress" }
    : task.status === "in_progress" ? { label: "Pasar a revisión", status: "in_review" } : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnly || !draft.trim()) return;
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
          <p className="truncate text-xs text-muted-foreground tabular-nums">{task.identifier}{project ? ` · ${project.name}` : ""}</p>
          <h2 className="mt-0.5 break-words text-lg font-semibold leading-snug">{task.title}</h2>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <Pill color={style.color} strong={task.status === "blocked"}>{STATUS_LABEL[task.status]}</Pill>
            <Pill color={PRIORITY_COLOR[task.priority]}>{PRIORITY_LABEL[task.priority]}</Pill>
            {task.customer ? <span className="min-w-0 max-w-full truncate"><Pill color={ACCENT.mint}>{task.customer}</Pill></span> : null}
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {task.assignee ? <><Avatar name={task.assignee} size="sm" /><span>{task.assignee}</span></> : <span className="text-muted-foreground">Sin asignar</span>}
        {task.dueDate ? <span className="ml-auto text-xs text-muted-foreground">Fecha: {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</span> : null}
      </div>

      {task.description ? <p className="break-words text-sm text-muted-foreground">{task.description}</p> : null}

      {task.blockedBy?.length ? <BlockedBy items={task.blockedBy} readOnly={readOnly} /> : null}
      {task.run ? <RunCard run={task.run} readOnly={readOnly} /> : null}
      {task.review ? <ReviewCard review={task.review} readOnly={readOnly} onApprove={() => onStatus("done")} onChanges={() => onStatus("in_progress")} /> : null}

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
                <p className="break-words">{message.text}</p>
                <p className="mt-0.5 text-xs opacity-70">{message.from} · {message.at}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            aria-label="Responder"
            value={draft}
            disabled={readOnly}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={readOnly ? "Solo lectura" : task.assignee ? `Escribe a ${task.assignee}…` : "Escribe una instrucción…"}
            className="min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors duration-(--motion-duration-fast) focus:border-foreground/30 disabled:opacity-60"
          />
          <Button type="submit" size="icon" disabled={readOnly || !draft.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
        </form>
      </div>

      {nextAction && !readOnly ? (
        <Button onClick={() => onStatus(nextAction.status)} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>
          <CheckCircle2 className="h-4 w-4" />{nextAction.label}
        </Button>
      ) : null}
    </motion.aside>
  );
}

export function TasksEmptyState({ onCreate, readOnly = false }: { onCreate: () => void; readOnly?: boolean }) {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.sky}, ${ACCENT.turquoise})`, color: ink(ACCENT.sky) }}>
        <CheckCircle2 className="h-8 w-8" />
      </motion.span>
      <div><h2 className="text-lg font-semibold">Encarga tu primera tarea</h2><p className="mx-auto max-w-sm text-sm text-muted-foreground">Pide algo concreto a un agente («Escribe 4 posts para la clínica») y revisa el resultado aquí.</p></div>
      {readOnly ? null : <Button onClick={onCreate}><Plus className="h-4 w-4" />Nueva tarea</Button>}
    </div>
  );
}
