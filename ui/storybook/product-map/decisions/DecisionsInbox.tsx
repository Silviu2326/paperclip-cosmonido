import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AlarmClock, CheckCircle2, Clock, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Pill } from "../parts";
import { LoadMoreButton, useLoadMore } from "../customers/scenario-parts";
import { DecisionPreview } from "./DecisionPreview";
import {
  AllCaughtUp,
  GROUPS,
  RESTRICTED_VERBS,
  SEVERITY_COLOR,
  VERB,
  deadlineLabel,
  kindOf,
} from "./DecisionsProposal";
import type { DemoDecision, DemoVerb } from "./demo-data";

const KEYS: { key: string; label: string }[] = [
  { key: "J / K", label: "moverte" },
  { key: "A", label: "acción principal" },
  { key: "R", label: "rechazar" },
  { key: "S", label: "posponer" },
  { key: "Z", label: "deshacer" },
];

function Key({ children }: { children: string }) {
  return <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium">{children}</kbd>;
}

/** Variant B: a compact mail-style inbox. One line per decision, a reading pane on the right, everything doable from the keyboard. */
export function DecisionsInbox({ decisions, canApprove = true, pageSize }: { decisions: DemoDecision[]; canApprove?: boolean; pageSize?: number }) {
  const tokens = useMotionTokens();
  const [pending, setPending] = useState(decisions);
  const [selectedId, setSelectedId] = useState<string | null>(decisions[0]?.id ?? null);
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [last, setLast] = useState<{ decision: DemoDecision; at: number; text: string } | null>(null);
  const ordered = useMemo(() => GROUPS.flatMap((group) => pending.filter(group.match)), [pending]);
  const page = useLoadMore(ordered, pageSize);
  const selected = ordered.find((decision) => decision.id === selectedId) ?? ordered[0] ?? null;
  const total = decisions.length;

  const advance = useCallback((from: DemoDecision) => {
    const index = ordered.findIndex((decision) => decision.id === from.id);
    const next = ordered[index + 1] ?? ordered[index - 1] ?? null;
    setSelectedId(next && next.id !== from.id ? next.id : null);
  }, [ordered]);

  const resolve = useCallback((decision: DemoDecision, text: string) => {
    setPending((current) => current.filter((item) => item.id !== decision.id));
    setLast({ decision, at: ordered.findIndex((item) => item.id === decision.id), text });
    advance(decision);
  }, [advance, ordered]);

  const snooze = useCallback((decision: DemoDecision) => {
    setPending((current) => current.filter((item) => item.id !== decision.id));
    setLast({ decision, at: ordered.findIndex((item) => item.id === decision.id), text: `Pospuesta: ${decision.title}` });
    advance(decision);
  }, [advance, ordered]);

  const undo = useCallback(() => {
    if (!last) return;
    setPending((current) => [...current, last.decision].sort((a, b) => decisions.indexOf(a) - decisions.indexOf(b)));
    setSelectedId(last.decision.id);
    setLast(null);
  }, [decisions, last]);

  const primaryVerb = (decision: DemoDecision): DemoVerb | undefined => decision.verbs.find((verb) => VERB[verb].primary);
  const rejectVerb = (decision: DemoDecision): DemoVerb | undefined => decision.verbs.find((verb) => !VERB[verb].primary);
  const allowed = (verb: DemoVerb | undefined) => verb !== undefined && (canApprove || !RESTRICTED_VERBS.has(verb));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = selected ? ordered.findIndex((decision) => decision.id === selected.id) : -1;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "arrowdown") { event.preventDefault(); const next = ordered[Math.min(index + 1, ordered.length - 1)]; if (next) setSelectedId(next.id); }
      else if (key === "k" || key === "arrowup") { event.preventDefault(); const next = ordered[Math.max(index - 1, 0)]; if (next) setSelectedId(next.id); }
      else if (key === "a" && selected) { const verb = primaryVerb(selected); if (verb && allowed(verb)) resolve(selected, `${VERB[verb].label}: ${selected.title}`); }
      else if (key === "r" && selected) { const verb = rejectVerb(selected); if (verb && allowed(verb)) resolve(selected, `Rechazada: ${selected.title}`); }
      else if (key === "s" && selected) snooze(selected);
      else if (key === "z") undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!last) return;
    const timer = window.setTimeout(() => setLast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [last]);

  const kind = selected ? kindOf(selected) : null;
  const deadline = selected ? deadlineLabel(selected.decideBy) : null;
  const verb = selected ? primaryVerb(selected) : undefined;
  const reject = selected ? rejectVerb(selected) : undefined;
  const pickedChoice = selected ? (choice[selected.id] ?? (selected.preview?.kind === "options" ? 1 : null)) : null;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decisiones</h1>
          <p className="text-sm text-muted-foreground">{pending.length ? `${pending.length} pendientes · ${total - pending.length} decididas hoy` : "Nada pendiente"}</p>
        </div>
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:flex" aria-label="Atajos de teclado">
          {KEYS.map((item) => <span key={item.key} className="flex items-center gap-1.5"><Key>{item.key}</Key>{item.label}</span>)}
        </div>
      </header>

      {pending.length === 0 ? <AllCaughtUp /> : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <LayoutGroup id="decisions-inbox">
            <div role="listbox" aria-label="Decisiones pendientes" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border">
              {GROUPS.map((group) => {
                const items = page.visible.filter(group.match);
                if (!items.length) return null;
                return (
                  <div key={group.id}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />{group.label}
                      <span className="font-normal text-muted-foreground tabular-nums">{pending.filter(group.match).length}</span>
                    </div>
                    <AnimatePresence initial={false}>
                      {items.map((decision) => {
                        const rowKind = kindOf(decision);
                        const isSelected = decision.id === selected?.id;
                        const rowDeadline = deadlineLabel(decision.decideBy);
                        return (
                          <motion.button
                            key={decision.id}
                            layout
                            role="option"
                            aria-selected={isSelected}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, x: -24, height: 0 }}
                            transition={{ duration: tokens.base, ease: tokens.easeOut }}
                            onClick={() => setSelectedId(decision.id)}
                            className="relative flex w-full min-w-0 items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            {isSelected ? <motion.span layoutId="inbox-row-pill" className="absolute inset-0" style={{ background: tint(rowKind.color, 16) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                            <span aria-hidden="true" className="relative h-2 w-2 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[decision.severity] }} />
                            <span className="relative flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium">{decision.title}</span>
                              <span className="truncate text-xs text-muted-foreground">{decision.customer ?? decision.agent ?? rowKind.label}</span>
                            </span>
                            {rowDeadline ? <span className="relative shrink-0 text-xs font-medium" style={{ color: rowDeadline.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>{rowDeadline.text.replace("Decide antes de las ", "hasta ").replace("Decide antes del ", "hasta ")}</span> : null}
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                );
              })}
              <div className="flex justify-center p-2"><LoadMoreButton remaining={page.remaining} onClick={page.more} noun="decisiones" /></div>
            </div>
          </LayoutGroup>

          <AnimatePresence mode="wait">
            {selected && kind ? (
              <motion.section
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: tokens.base, ease: tokens.easeOut }}
                aria-label="Detalle de la decisión"
                className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-5 lg:sticky lg:top-4 lg:self-start"
              >
                <div className="flex items-start gap-3">
                  <IconTile icon={kind.icon} color={kind.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill color={kind.color}>{kind.label}</Pill>
                      {deadline ? <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: deadline.urgent ? readable(ACCENT.risk) : "var(--muted-foreground)" }}><Clock className="h-3 w-3" />{deadline.text}</span> : null}
                    </div>
                    <h2 className="mt-1.5 break-words text-lg font-semibold leading-snug">{selected.title}</h2>
                  </div>
                </div>
                <p className="break-words text-sm text-muted-foreground">{selected.whyNow}</p>
                <DecisionPreview decision={selected} choice={pickedChoice} onChoice={(index) => setChoice((current) => ({ ...current, [selected.id]: index }))} />
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {selected.agent ? <span className="flex min-w-0 items-center gap-1.5"><Avatar name={selected.agent} size="xs" /><span className="truncate">{selected.agent}</span></span> : null}
                  {selected.customer ? <span className="max-w-full truncate"><Pill color={ACCENT.mint}>{selected.customer}</Pill></span> : null}
                  {selected.task ? <span className="min-w-0 max-w-full truncate">· {selected.task}</span> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {verb ? (
                    <Button
                      disabled={!allowed(verb) || (verb === "answer" && selected.preview?.kind === "options" && pickedChoice === null)}
                      title={!allowed(verb) ? "Solo los administradores pueden hacerlo" : undefined}
                      onClick={() => resolve(selected, `${VERB[verb].label}: ${selected.title}`)}
                      style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}
                    >
                      <CheckCircle2 className="h-4 w-4" />{selected.bundle && verb === "approve" ? `Aprobar los ${selected.bundle}` : VERB[verb].label}<Key>A</Key>
                    </Button>
                  ) : null}
                  {reject ? (
                    <Button variant="outline" disabled={!allowed(reject)} title={!allowed(reject) ? "Solo los administradores pueden hacerlo" : undefined} onClick={() => resolve(selected, `Rechazada: ${selected.title}`)}>
                      <XCircle className="h-4 w-4" />{VERB[reject].label}<Key>R</Key>
                    </Button>
                  ) : null}
                  <Button variant="ghost" onClick={() => snooze(selected)}><AlarmClock className="h-4 w-4" />Posponer<Key>S</Key></Button>
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {last ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-50 flex max-w-full -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} />
            <span className="max-w-xs truncate">{last.text}</span>
            <Button size="sm" variant="ghost" onClick={undo}><Undo2 className="h-3.5 w-3.5" />Deshacer<Key>Z</Key></Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
