import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ChevronDown, Clock, PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, Pill } from "../parts";
import { CHANNEL, ContextPanel, HEALTH, ThreadRow, ThreadView } from "./ConversationsProposal";
import type { Channel, DemoMessage, DemoThread } from "./demo-data";

/** Local thread state shared by the two alternative layouts: select, send and close. */
function useThreads(initial: DemoThread[], preselect = false) {
  const [threads, setThreads] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(preselect ? initial.find((thread) => thread.status !== "closed")?.id ?? null : null);
  const [toast, setToast] = useState<string | null>(null);
  const select = (thread: DemoThread) => {
    setSelectedId(thread.id);
    setThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, unread: 0 } : item)));
  };
  const send = (thread: DemoThread, body: string) => {
    const message: DemoMessage = { id: `n-${Date.now()}`, direction: "outbound", actor: "user", author: "Tú", body, at: "Ahora", delivery: "sent" };
    setThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, messages: [...item.messages, message], status: "waiting_them", slaDueLabel: null, slaLate: false, lastLabel: "ahora", preview: body, suggestion: null } : item)));
    setToast(`Enviado a ${thread.contact}`);
    window.setTimeout(() => setToast(null), 3000);
  };
  const close = (thread: DemoThread) => {
    setThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, status: "closed", slaDueLabel: null, slaLate: false } : item)));
    setToast("Conversación cerrada");
    window.setTimeout(() => setToast(null), 3000);
  };
  return { threads, selectedId, setSelectedId, select, send, close, toast };
}

function Toast({ text }: { text: string | null }) {
  const tokens = useMotionTokens();
  return (
    <AnimatePresence>
      {text ? (
        <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-6 left-1/2 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0 truncate">{text}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Variant B — two panels. Focus on reading and answering: the customer context
 * is out of the way in a drawer you open when you need it.
 */
export function ConversationsDrawer({ threads: initial, disconnected = [] }: { threads: DemoThread[]; disconnected?: Channel[] }) {
  const tokens = useMotionTokens();
  const { threads, selectedId, setSelectedId, select, send, close, toast } = useThreads(initial, true);
  const [drawer, setDrawer] = useState(false);
  const [onlyMine, setOnlyMine] = useState(true);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => threads
    .filter((thread) => (onlyMine ? thread.status === "waiting_us" || thread.status === "open" : thread.status !== "closed"))
    .filter((thread) => !needle || `${thread.contact} ${thread.customer} ${thread.subject}`.toLowerCase().includes(needle)), [threads, onlyMine, needle]);
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const [showList, setShowList] = useState(true);
  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Conversaciones</h1><p className="text-sm text-muted-foreground">{threads.filter((thread) => thread.status === "waiting_us").length} esperan tu respuesta</p></div>
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 text-sm">
          {[[true, "Para mí"], [false, "Todas"]].map(([value, label]) => (
            <button key={String(label)} onClick={() => setOnlyMine(value as boolean)} className={cn("rounded-lg px-3 py-1 transition-colors duration-(--motion-duration-fast)", onlyMine === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label as string}</button>
          ))}
        </div>
      </header>
      <div className={cn("grid min-w-0 gap-4", "lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]")}>
        <aside className={cn("flex min-w-0 flex-col gap-2", selected && !showList && "max-lg:hidden")}>
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30"><Search className="h-4 w-4 text-muted-foreground" /><input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          {visible.map((thread, index) => <ThreadRow key={thread.id} thread={thread} index={index} active={thread.id === selectedId} onSelect={() => { select(thread); setShowList(false); }} />)}
          {visible.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nada pendiente. 🎉</p> : null}
        </aside>
        <div className={cn("relative flex min-w-0 flex-col gap-3", !selected || showList ? "max-lg:hidden" : "")}>
          {selected ? (
            <>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Avatar name={selected.customer} size="xs" /><span className="truncate font-medium">{selected.customer}</span><Pill color={HEALTH[selected.context.health].color}>{HEALTH[selected.context.health].label}</Pill></span>
                <Button size="sm" variant={drawer ? "secondary" : "outline"} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>{drawer ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}Cliente y llamadas</Button>
              </div>
              <div className="relative min-w-0">
                <ThreadView key={selected.id} thread={selected} onBack={() => setShowList(true)} onSend={send} onClose={close} disconnected={disconnected.includes(selected.channel)} />
                <AnimatePresence>
                  {drawer ? (
                    <motion.aside key="drawer" initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 32, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="absolute bottom-0 right-0 top-18 z-10 flex w-full max-w-xs flex-col overflow-y-auto rounded-2xl border border-border bg-background p-3 shadow-xl">
                      <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Contexto</h2><Button size="icon" variant="ghost" aria-label="Cerrar" onClick={() => setDrawer(false)}><X className="h-4 w-4" /></Button></div>
                      <ContextPanel thread={selected} />
                    </motion.aside>
                  ) : null}
                </AnimatePresence>
              </div>
            </>
          ) : <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una conversación de la lista.</p>}
        </div>
      </div>
      <Toast text={toast} />
    </div>
  );
}

/**
 * Variant C — mailbox grouped by customer. Focus on seeing the whole
 * relationship at once: every thread with a customer sits under it, worst
 * deadline first, and the reading pane opens beside the table.
 */
export function ConversationsMailbox({ threads: initial, disconnected = [] }: { threads: DemoThread[]; disconnected?: Channel[] }) {
  const tokens = useMotionTokens();
  const { threads, selectedId, setSelectedId, select, send, close, toast } = useThreads(initial);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const byCustomer = new Map<string, DemoThread[]>();
    for (const thread of threads.filter((item) => item.status !== "closed")) byCustomer.set(thread.customer, [...(byCustomer.get(thread.customer) ?? []), thread]);
    return [...byCustomer.entries()]
      .map(([customer, items]) => ({ customer, items, late: items.some((item) => item.slaLate), unread: items.reduce((sum, item) => sum + item.unread, 0), health: items[0]!.context.health }))
      .sort((a, b) => Number(b.late) - Number(a.late) || b.unread - a.unread);
  }, [threads]);
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const toggle = (customer: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(customer)) next.delete(customer); else next.add(customer); return next; });
  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6">
      <header><h1 className="text-2xl font-semibold">Conversaciones</h1><p className="text-sm text-muted-foreground">{groups.length} clientes con conversaciones abiertas · {groups.filter((group) => group.late).length} con plazo vencido</p></header>
      <div className={cn("grid min-w-0 gap-4", selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]" : "")}>
        <div className={cn("flex min-w-0 flex-col gap-3", selected && "max-xl:hidden")}>
          {groups.map((group, groupIndex) => {
            const closed = collapsed.has(group.customer);
            const health = HEALTH[group.health];
            return (
              <motion.section key={group.customer} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(groupIndex, 8) * tokens.stagger }} className="min-w-0 overflow-hidden rounded-2xl border border-border">
                <button onClick={() => toggle(group.customer)} aria-expanded={!closed} className="flex w-full min-w-0 items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/40" style={{ boxShadow: `inset 3px 0 0 ${health.color}` }}>
                  <Avatar name={group.customer} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{group.customer}</span><span className="block truncate text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? "conversación" : "conversaciones"}</span></span>
                  {group.late ? <Pill color={ACCENT.risk}><Clock className="h-3 w-3" />Fuera de plazo</Pill> : null}
                  {group.unread ? <Pill color={ACCENT.turquoise} strong>{group.unread}</Pill> : null}
                  <motion.span animate={{ rotate: closed ? -90 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex text-muted-foreground"><ChevronDown className="h-4 w-4" /></motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {!closed ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                      <div className="divide-y divide-border border-t border-border">
                        {group.items.map((thread) => {
                          const channel = CHANNEL[thread.channel];
                          return (
                            <button key={thread.id} onClick={() => select(thread)} aria-current={thread.id === selectedId} className={cn("grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-(--motion-duration-fast)", thread.id === selectedId ? "" : "hover:bg-accent/40")} style={thread.id === selectedId ? { background: tint(channel.color, 16) } : undefined}>
                              <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: tint(channel.color, 26), color: readable(channel.color) }}><channel.icon className="h-3.5 w-3.5" /></span>
                              <span className="min-w-0"><span className={cn("block truncate", thread.unread ? "font-semibold" : "")}>{thread.contact} <span className="font-normal text-muted-foreground">· {thread.subject}</span></span><span className="block truncate text-xs text-muted-foreground">{thread.preview}</span></span>
                              <span className="flex flex-col items-end gap-0.5 text-xs">
                                {thread.slaDueLabel ? <span className="font-medium" style={{ color: thread.slaLate ? readable(ACCENT.risk) : readable(ACCENT.yellow) }}>{thread.slaDueLabel}</span> : <span className="text-muted-foreground">{thread.lastLabel}</span>}
                                {thread.unread ? <span className="rounded-full px-1.5 font-semibold" style={{ background: channel.color, color: ink(channel.color) }}>{thread.unread}</span> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.section>
            );
          })}
          {groups.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Bandeja vacía.</p> : null}
        </div>
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
              <ThreadView thread={selected} onBack={() => setSelectedId(null)} onSend={send} onClose={close} disconnected={disconnected.includes(selected.channel)} maxHeight={380} />
              <details className="rounded-2xl border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">Contexto del cliente</summary><div className="mt-3"><ContextPanel thread={selected} /></div></details>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <Toast text={toast} />
    </div>
  );
}
