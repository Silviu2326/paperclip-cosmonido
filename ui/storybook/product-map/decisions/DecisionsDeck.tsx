import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { AlarmClock, ArrowLeft, ArrowRight, CheckCircle2, Clock, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Pill, Progress } from "../parts";
import { DecisionPreview } from "./DecisionPreview";
import { AllCaughtUp, GROUPS, RESTRICTED_VERBS, SEVERITY_COLOR, VERB, deadlineLabel, kindOf } from "./DecisionsProposal";
import type { DemoDecision, DemoVerb } from "./demo-data";

type Move = "yes" | "no" | "later";
interface Done { decision: DemoDecision; move: Move; label: string }

const THRESHOLD = 110;

/** Variant C: decide one at a time. A single large card; swipe or use the arrows: right = main action, left = postpone. */
export function DecisionsDeck({ decisions, canApprove = true }: { decisions: DemoDecision[]; canApprove?: boolean }) {
  const tokens = useMotionTokens();
  const ordered = useMemo(() => GROUPS.flatMap((group) => decisions.filter(group.match)), [decisions]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Done[]>([]);
  const [exit, setExit] = useState<Move>("yes");
  const [choice, setChoice] = useState<Record<string, number>>({});
  const current = ordered[index] ?? null;
  const total = ordered.length;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-8, 0, 8]);
  const yesOpacity = useTransform(x, [20, THRESHOLD], [0, 1]);
  const laterOpacity = useTransform(x, [-THRESHOLD, -20], [1, 0]);

  const primary: DemoVerb | undefined = current?.verbs.find((verb) => VERB[verb].primary);
  const reject: DemoVerb | undefined = current?.verbs.find((verb) => !VERB[verb].primary);
  const allowed = (verb: DemoVerb | undefined) => verb !== undefined && (canApprove || !RESTRICTED_VERBS.has(verb));
  const picked = current ? (choice[current.id] ?? (current.preview?.kind === "options" ? 1 : null)) : null;
  const canYes = allowed(primary);

  const decide = useCallback((move: Move) => {
    if (!current) return;
    if (move === "yes" && !canYes) return;
    if (move === "no" && !allowed(reject)) return;
    const label = move === "later" ? "Pospuesta" : move === "no" ? "Rechazada" : primary ? VERB[primary].label : "Hecho";
    setExit(move);
    setHistory((list) => [...list, { decision: current, move, label }]);
    setIndex((value) => value + 1);
    x.set(0);
  }, [canYes, current, primary, reject, x]);

  const undo = useCallback(() => {
    setExit("yes");
    setHistory((list) => list.slice(0, -1));
    setIndex((value) => Math.max(0, value - 1));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") { event.preventDefault(); decide("yes"); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); decide("later"); }
      else if (event.key.toLowerCase() === "r") decide("no");
      else if (event.key.toLowerCase() === "z") undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stats = history.reduce((acc, item) => { acc[item.move] += 1; return acc; }, { yes: 0, no: 0, later: 0 } as Record<Move, number>);
  const kind = current ? kindOf(current) : null;
  const deadline = current ? deadlineLabel(current.decideBy) : null;
  const severityColor = current ? SEVERITY_COLOR[current.severity] : ACCENT.muted;

  return (
    <div className="mx-auto flex min-h-160 w-full max-w-2xl min-w-0 flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Decisiones</h1>
            <p className="text-sm text-muted-foreground">{current ? `${index + 1} de ${total}` : total ? "Has terminado" : "Nada pendiente"}</p>
          </div>
          {history.length ? <Button size="sm" variant="ghost" onClick={undo}><Undo2 className="h-3.5 w-3.5" />Deshacer<kbd className="ml-1 rounded-md border border-border bg-muted px-1.5 text-xs">Z</kbd></Button> : null}
        </div>
        <Progress value={total ? (index / total) * 100 : 100} color={ACCENT.mint} />
        <div className="flex gap-1" aria-hidden="true">
          {ordered.slice(0, 40).map((decision, dotIndex) => (
            <motion.span key={decision.id} className="h-1.5 flex-1 rounded-full" animate={{ background: dotIndex < index ? ACCENT.mint : dotIndex === index ? SEVERITY_COLOR[decision.severity] : "var(--border)" }} transition={{ duration: tokens.base }} />
          ))}
        </div>
      </header>

      <div className="relative flex min-h-96 flex-1 items-start justify-center">
        <AnimatePresence mode="popLayout" custom={exit}>
          {current && kind ? (
            <motion.article
              key={current.id}
              custom={exit}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(_, info) => { if (info.offset.x > THRESHOLD) decide("yes"); else if (info.offset.x < -THRESHOLD) decide("later"); }}
              style={{ x, rotate }}
              variants={{
                enter: { opacity: 0, scale: 0.94, y: 16 },
                visible: { opacity: 1, scale: 1, y: 0, transition: { duration: tokens.base, ease: tokens.easeOut } },
                leave: (move: Move) => ({ opacity: 0, x: move === "yes" ? 320 : move === "no" ? 0 : -320, y: move === "no" ? 40 : 0, rotate: move === "yes" ? 10 : move === "later" ? -10 : 0, transition: { duration: tokens.base, ease: tokens.standard } }),
              }}
              initial="enter"
              animate="visible"
              exit="leave"
              className="relative flex w-full min-w-0 cursor-grab flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-background p-6 shadow-lg active:cursor-grabbing"
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: severityColor }} />
              <motion.span aria-hidden="true" style={{ opacity: yesOpacity, background: tint(ACCENT.mint, 30) }} className="pointer-events-none absolute inset-0 flex items-start justify-end p-5 text-sm font-semibold"><span style={{ color: readable(ACCENT.mint) }}>{primary ? VERB[primary].label : ""} →</span></motion.span>
              <motion.span aria-hidden="true" style={{ opacity: laterOpacity, background: tint(ACCENT.lilac, 30) }} className="pointer-events-none absolute inset-0 flex items-start p-5 text-sm font-semibold"><span style={{ color: readable(ACCENT.lilac) }}>← Posponer</span></motion.span>

              <div className="relative flex items-center gap-3">
                <IconTile icon={kind.icon} color={kind.color} />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Pill color={kind.color}>{kind.label}</Pill>
                  {deadline ? <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: deadline.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}><Clock className="h-3 w-3" />{deadline.text}</span> : null}
                </div>
              </div>
              <h2 className="relative break-words text-2xl font-semibold leading-snug">{current.title}</h2>
              <p className="relative break-words text-muted-foreground">{current.whyNow}</p>
              <div className="relative" onPointerDownCapture={(event) => event.stopPropagation()}>
                <DecisionPreview decision={current} choice={picked} onChoice={(value) => setChoice((state) => ({ ...state, [current.id]: value }))} />
              </div>
              <div className="relative flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {current.agent ? <span className="flex min-w-0 items-center gap-1.5"><Avatar name={current.agent} size="xs" /><span className="truncate">{current.agent}</span></span> : null}
                {current.customer ? <span className="max-w-full truncate"><Pill color={ACCENT.mint}>{current.customer}</Pill></span> : null}
              </div>
            </motion.article>
          ) : null}
        </AnimatePresence>
        {!current ? (
          <div className="flex w-full flex-col gap-4">
            <AllCaughtUp />
            {history.length ? (
              <p className="text-center text-sm text-muted-foreground">
                Esta tanda: <strong className="text-foreground">{stats.yes}</strong> resueltas · <strong className="text-foreground">{stats.no}</strong> rechazadas · <strong className="text-foreground">{stats.later}</strong> pospuestas
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {current ? (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-center gap-3 bg-background/90 px-1 py-3 backdrop-blur">
          <Button size="lg" variant="outline" onClick={() => decide("later")}><ArrowLeft className="h-4 w-4" />Posponer</Button>
          {reject ? <Button size="lg" variant="outline" disabled={!allowed(reject)} title={!allowed(reject) ? "Solo los administradores pueden hacerlo" : undefined} onClick={() => decide("no")}><XCircle className="h-4 w-4" />{VERB[reject].label}</Button> : null}
          {primary ? (
            <Button
              size="lg"
              disabled={!canYes}
              title={!canYes ? "Solo los administradores pueden hacerlo" : undefined}
              onClick={() => decide("yes")}
              style={canYes ? { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) } : undefined}
            >
              <CheckCircle2 className="h-4 w-4" />{current.bundle && primary === "approve" ? `Aprobar los ${current.bundle}` : VERB[primary].label}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {current ? <p className="text-center text-xs text-muted-foreground"><AlarmClock className="mr-1 inline h-3 w-3" />Desliza la tarjeta, o usa ← posponer · → acción principal · R rechazar · Z deshacer</p> : null}
    </div>
  );
}
