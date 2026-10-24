import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  AlertOctagon,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock,
  Eye,
  FileCheck2,
  Gavel,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  Undo2,
  UserPlus,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, Progress, SectionTitle } from "../parts";
import { DEMO_DECIDED, type DemoDecision, type DemoVerb } from "./demo-data";

const KIND: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  approval: { label: "Aprobación", icon: ShieldCheck, color: ACCENT.mint },
  decision: { label: "Decisión", icon: Gavel, color: ACCENT.lilac },
  issue_thread_interaction: { label: "Pregunta", icon: CircleHelp, color: ACCENT.sky },
  review: { label: "Revisión", icon: FileCheck2, color: ACCENT.turquoise },
  failed_run: { label: "Fallo", icon: AlertOctagon, color: ACCENT.risk },
  budget_alert: { label: "Presupuesto", icon: Wallet, color: ACCENT.yellow },
  agent_error_alert: { label: "Agente con error", icon: AlertOctagon, color: ACCENT.risk },
  join_request: { label: "Acceso", icon: UserPlus, color: ACCENT.lilac },
};
const kindOf = (decision: DemoDecision) => KIND[decision.sourceKind] ?? { label: "Aviso", icon: CircleHelp, color: ACCENT.muted };

const SEVERITY_COLOR: Record<DemoDecision["severity"], string> = {
  critical: ACCENT.risk, high: ACCENT.yellow, medium: ACCENT.sky, low: ACCENT.muted,
};

const VERB: Record<DemoVerb, { label: string; outcome: "approved" | "rejected" | "answered"; primary: boolean }> = {
  approve: { label: "Aprobar", outcome: "approved", primary: true },
  accept: { label: "Dar acceso", outcome: "approved", primary: true },
  raise_budget: { label: "Subir presupuesto", outcome: "approved", primary: true },
  retry: { label: "Reintentar", outcome: "approved", primary: true },
  review: { label: "Dar visto bueno", outcome: "approved", primary: true },
  answer: { label: "Responder", outcome: "answered", primary: true },
  reject: { label: "Rechazar", outcome: "rejected", primary: false },
};

const FILTERS: { id: string; label: string; match: (decision: DemoDecision) => boolean }[] = [
  { id: "all", label: "Todas", match: () => true },
  { id: "urgent", label: "Urgentes", match: (decision) => decision.severity === "critical" || decision.severity === "high" },
  { id: "approvals", label: "Aprobaciones", match: (decision) => decision.sourceKind === "approval" || decision.sourceKind === "decision" },
  { id: "questions", label: "Preguntas", match: (decision) => decision.sourceKind === "issue_thread_interaction" },
  { id: "reviews", label: "Revisiones", match: (decision) => decision.sourceKind === "review" },
  { id: "incidents", label: "Incidencias", match: (decision) => ["failed_run", "budget_alert", "agent_error_alert"].includes(decision.sourceKind) },
  { id: "team", label: "Equipo", match: (decision) => decision.sourceKind === "join_request" },
];

const GROUPS: { id: string; label: string; hint: string; match: (decision: DemoDecision) => boolean; color: string }[] = [
  { id: "now", label: "Ahora", hint: "Bloquean trabajo o tienen fecha hoy", match: (decision) => decision.severity === "critical" || decision.severity === "high", color: ACCENT.yellow },
  { id: "week", label: "Esta semana", hint: "Importantes, sin prisa de hoy", match: (decision) => decision.severity === "medium", color: ACCENT.sky },
  { id: "later", label: "Cuando puedas", hint: "Nadie está esperando", match: (decision) => decision.severity === "low", color: ACCENT.muted },
];

function deadlineLabel(decideBy: string | null): { text: string; urgent: boolean } | null {
  if (!decideBy) return null;
  const hours = Math.round((new Date(decideBy).getTime() - new Date("2026-10-24T09:00:00Z").getTime()) / 3_600_000);
  if (hours <= 12) return { text: `Decide antes de las ${new Date(decideBy).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`, urgent: true };
  return { text: `Decide antes del ${new Date(decideBy).toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}`, urgent: false };
}

function DecisionCard({ decision, index, onResolve, onSnooze }: {
  decision: DemoDecision;
  index: number;
  onResolve: (decision: DemoDecision, outcome: "approved" | "rejected" | "answered") => void;
  onSnooze: (decision: DemoDecision) => void;
}) {
  const tokens = useMotionTokens();
  const kind = kindOf(decision);
  const severity = SEVERITY_COLOR[decision.severity];
  const [open, setOpen] = useState(index === 0);
  const [choice, setChoice] = useState<number | null>(decision.preview?.kind === "options" ? 1 : null);
  const deadline = deadlineLabel(decision.decideBy);
  const needsChoice = decision.verbs.includes("answer") && decision.preview?.kind === "options";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 60, transition: { duration: tokens.base, ease: tokens.standard } }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-background"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: severity }} />
      <div className="flex flex-col gap-3 p-4 pl-5">
        <div className="flex items-start gap-3">
          <IconTile icon={kind.icon} color={kind.color} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill color={kind.color}>{kind.label}</Pill>
              {decision.bundle ? <Pill color={ACCENT.mint} strong><ListChecks className="h-3 w-3" />{decision.bundle} elementos</Pill> : null}
              {deadline ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: deadline.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>
                  <Clock className="h-3 w-3" />{deadline.text}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1.5 font-semibold leading-snug">{decision.title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{decision.whyNow}</p>
          </div>
          {decision.preview ? (
            <Button size="icon" variant="ghost" aria-expanded={open} aria-label={open ? "Ocultar detalle" : "Ver detalle"} onClick={() => setOpen(!open)}>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
            </Button>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {open && decision.preview ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: tokens.base, ease: tokens.easeOut }}
              className="overflow-hidden"
            >
              <div className="rounded-xl p-3 text-sm" style={{ background: tint(kind.color, 10) }}>
                {decision.preview.kind === "options" ? (
                  <div role="radiogroup" aria-label="Opciones" className="flex flex-col gap-1.5">
                    {decision.preview.lines.map((line, optionIndex) => (
                      <button
                        key={line}
                        role="radio"
                        aria-checked={choice === optionIndex}
                        onClick={() => setChoice(optionIndex)}
                        className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-(--motion-duration-fast)", choice === optionIndex ? "border-transparent font-medium" : "border-border hover:bg-accent/50")}
                        style={choice === optionIndex ? { background: tint(kind.color, 24), boxShadow: `inset 0 0 0 1.5px ${kind.color}` } : undefined}
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current">
                          {choice === optionIndex ? <span className="h-2 w-2 rounded-full bg-current" /> : null}
                        </span>
                        {line}
                      </button>
                    ))}
                  </div>
                ) : decision.preview.kind === "list" ? (
                  <ol className="flex flex-col gap-1.5">
                    {decision.preview.lines.map((line, lineIndex) => (
                      <li key={line} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-semibold" style={{ background: tint(kind.color, 30), color: readable(kind.color) }}>{lineIndex + 1}</span>{line}</li>
                    ))}
                  </ol>
                ) : decision.preview.kind === "budget" ? (
                  <div className="flex flex-col gap-2">
                    <Progress value={96} color={ACCENT.yellow} />
                    {decision.preview.lines.map((line) => <p key={line}>{line}</p>)}
                  </div>
                ) : (
                  decision.preview.lines.map((line) => <p key={line} className="flex items-center gap-2"><Eye className="h-3.5 w-3.5 text-muted-foreground" />{line}</p>)
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {decision.agent ? <span className="flex items-center gap-1.5"><Avatar name={decision.agent} size="xs" />{decision.agent}</span> : null}
            {decision.customer ? <Pill color={ACCENT.mint}>{decision.customer}</Pill> : null}
            {decision.task ? <span className="truncate">· {decision.task}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => onSnooze(decision)}><AlarmClock className="h-3.5 w-3.5" />Posponer</Button>
            {decision.verbs.filter((verb) => !VERB[verb].primary).map((verb) => (
              <Button key={verb} size="sm" variant="outline" onClick={() => onResolve(decision, VERB[verb].outcome)}><XCircle className="h-3.5 w-3.5" />{VERB[verb].label}</Button>
            ))}
            {decision.verbs.filter((verb) => VERB[verb].primary).map((verb) => (
              <Button
                key={verb}
                size="sm"
                disabled={needsChoice && choice === null}
                onClick={() => onResolve(decision, VERB[verb].outcome)}
                style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />{decision.bundle && verb === "approve" ? `Aprobar los ${decision.bundle}` : VERB[verb].label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function AllCaughtUp() {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
      <motion.span
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}
      >
        <CheckCheck className="h-8 w-8" />
      </motion.span>
      <h2 className="text-lg font-semibold">Todo al día</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Nadie está esperando una decisión tuya. Te avisaremos cuando un agente o un cliente te necesite.</p>
    </div>
  );
}

const OUTCOME_LABEL = { approved: "Aprobada", rejected: "Rechazada", answered: "Respondida" } as const;
const OUTCOME_COLOR = { approved: ACCENT.mint, rejected: ACCENT.muted, answered: ACCENT.sky } as const;

/** Decisions inbox: grouped by urgency, each item with its context, the real actions, undo and today's progress. */
export function DecisionsProposal({ decisions: initial }: { decisions: DemoDecision[] }) {
  const tokens = useMotionTokens();
  const [pending, setPending] = useState(initial);
  const [snoozed, setSnoozed] = useState<DemoDecision[]>([]);
  const [decided, setDecided] = useState(DEMO_DECIDED);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState<{ decision: DemoDecision; text: string; from: "pending" } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const total = initial.length;
  const doneToday = total - pending.length;
  const active = FILTERS.find((candidate) => candidate.id === filter)!;
  const visible = useMemo(() => pending.filter(active.match), [pending, active]);

  function resolve(decision: DemoDecision, outcome: "approved" | "rejected" | "answered") {
    setPending((current) => current.filter((item) => item.id !== decision.id));
    setDecided((current) => [{ id: decision.id, title: decision.title, outcome, at: "ahora" }, ...current]);
    setToast({ decision, text: `${OUTCOME_LABEL[outcome]}: ${decision.title}`, from: "pending" });
  }
  function snooze(decision: DemoDecision) {
    setPending((current) => current.filter((item) => item.id !== decision.id));
    setSnoozed((current) => [decision, ...current]);
    setToast({ decision, text: `Pospuesta hasta mañana: ${decision.title}`, from: "pending" });
  }
  function undo() {
    if (!toast) return;
    const { decision } = toast;
    setDecided((current) => current.filter((item) => item.id !== decision.id));
    setSnoozed((current) => current.filter((item) => item.id !== decision.id));
    setPending((current) => [...current, decision].sort((a, b) => initial.indexOf(a) - initial.indexOf(b)));
    setToast(null);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Decisiones</h1>
          <p className="text-sm text-muted-foreground">
            {pending.length ? `${pending.length} esperan tu respuesta · ${pending.filter((item) => item.severity === "critical" || item.severity === "high").length} para ahora` : "Nada pendiente"}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex min-w-0 flex-col gap-5">
          {pending.length ? <LayoutGroup id="decision-filters">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((candidate) => {
                const count = pending.filter(candidate.match).length;
                const selected = filter === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    onClick={() => setFilter(candidate.id)}
                    className={cn("relative rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", selected ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    {selected ? <motion.span layoutId="decision-filter-pill" className="absolute inset-0 rounded-full" style={{ background: tint(ACCENT.yellow, 34) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                    <span className="relative">{candidate.label}{count ? ` · ${count}` : ""}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup> : null}

          {pending.length === 0 ? <AllCaughtUp /> : visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nada en este filtro.</p>
          ) : (
            GROUPS.map((group) => {
              const items = visible.filter(group.match);
              if (!items.length) return null;
              return (
                <section key={group.id} className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: group.color }} />
                    <h2 className="text-sm font-semibold">{group.label}</h2>
                    <span className="text-xs text-muted-foreground">{group.hint}</span>
                  </div>
                  <AnimatePresence mode="popLayout">
                    {items.map((decision, index) => (
                      <DecisionCard key={decision.id} decision={decision} index={index} onResolve={resolve} onSnooze={snooze} />
                    ))}
                  </AnimatePresence>
                </section>
              );
            })
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Panel>
            <SectionTitle color={ACCENT.mint} icon={CheckCheck}>Hoy</SectionTitle>
            {total ? <p className="text-2xl font-semibold tabular-nums">{doneToday} <span className="text-sm font-normal text-muted-foreground">de {total} decididas</span></p> : <p className="text-sm text-muted-foreground">Hoy no ha llegado nada que decidir.</p>}
            <Progress value={total ? (doneToday / total) * 100 : 100} color={ACCENT.mint} />
          </Panel>
          <Panel>
            <SectionTitle color={ACCENT.sky} icon={RotateCcw}>Decididas recientemente</SectionTitle>
            <AnimatePresence initial={false}>
              {decided.slice(0, 5).map((item) => (
                <motion.div key={item.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{item.title}</span>
                  <Pill color={OUTCOME_COLOR[item.outcome]}>{OUTCOME_LABEL[item.outcome]}</Pill>
                </motion.div>
              ))}
            </AnimatePresence>
          </Panel>
          {snoozed.length ? (
            <Panel>
              <SectionTitle color={ACCENT.lilac} icon={AlarmClock}>Pospuestas</SectionTitle>
              {snoozed.map((item) => <p key={item.id} className="truncate text-sm text-muted-foreground">{item.title}</p>)}
            </Panel>
          ) : null}
        </aside>
      </div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />
            <span className="max-w-xs truncate">{toast.text}</span>
            <Button size="sm" variant="ghost" onClick={undo}><Undo2 className="h-3.5 w-3.5" />Deshacer</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
