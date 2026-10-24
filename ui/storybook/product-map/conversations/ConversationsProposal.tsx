import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Globe,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, SectionTitle } from "../parts";
import { DEMO_AGENDA_TODAY, DEMO_CALLS, type Channel, type DemoCall, type DemoMessage, type DemoThread } from "./demo-data";

const CHANNEL: Record<Channel, { label: string; icon: LucideIcon; color: string }> = {
  email: { label: "Email", icon: Mail, color: ACCENT.sky },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: ACCENT.mint },
  webchat: { label: "Chat web", icon: Globe, color: ACCENT.turquoise },
  voice: { label: "Llamada", icon: Phone, color: ACCENT.lilac },
};
const HEALTH = { good: { label: "Bien", color: ACCENT.mint }, watch: { label: "Vigilar", color: ACCENT.yellow }, risk: { label: "En riesgo", color: ACCENT.risk } } as const;
const CALL: Record<DemoCall["kind"], { label: string; icon: LucideIcon; color: string }> = {
  missed: { label: "Perdida", icon: PhoneMissed, color: ACCENT.risk }, inbound: { label: "Entrante", icon: PhoneIncoming, color: ACCENT.mint },
  outbound: { label: "Saliente", icon: PhoneOutgoing, color: ACCENT.sky }, callback: { label: "Te piden llamar", icon: PhoneCall, color: ACCENT.yellow },
};

type Filter = "all" | "waiting_us" | "waiting_them" | "closed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" }, { id: "waiting_us", label: "Me esperan" }, { id: "waiting_them", label: "Esperan al cliente" }, { id: "closed", label: "Cerradas" },
];

function ThreadRow({ thread, active, index, onSelect }: { thread: DemoThread; active: boolean; index: number; onSelect: () => void }) {
  const tokens = useMotionTokens();
  const channel = CHANNEL[thread.channel];
  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      onClick={onSelect}
      aria-current={active}
      className={cn("relative flex w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left transition-colors duration-(--motion-duration-fast)", active ? "" : "hover:bg-accent/50")}
    >
      {active ? <motion.span layoutId="conversation-active" className="absolute inset-0 rounded-xl" style={{ background: `linear-gradient(90deg, ${tint(channel.color, 22)}, ${tint(channel.color, 6)})`, boxShadow: `inset 3px 0 0 ${channel.color}` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
      <span className="relative"><Avatar name={thread.contact} size="md" />
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background" style={{ background: channel.color, color: ink(channel.color) }}><channel.icon className="h-2.5 w-2.5" /></span>
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", thread.unread ? "font-semibold" : "font-medium")}>{thread.contact}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{thread.lastLabel}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{thread.customer}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className={cn("min-w-0 flex-1 truncate text-sm", thread.unread ? "text-foreground" : "text-muted-foreground")}>{thread.preview}</span>
          {thread.unread ? <span className="rounded-full px-1.5 text-xs font-semibold tabular-nums" style={{ background: channel.color, color: ink(channel.color) }}>{thread.unread}</span> : null}
        </span>
        {thread.slaDueLabel ? (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium" style={{ color: thread.slaLate ? readable(ACCENT.risk) : readable(ACCENT.yellow) }}><Clock className="h-3 w-3" />{thread.slaDueLabel}</span>
        ) : null}
      </span>
    </motion.button>
  );
}

function Bubble({ message, index }: { message: DemoMessage; index: number }) {
  const tokens = useMotionTokens();
  const out = message.direction === "outbound";
  const Delivery = message.delivery === "read" ? CheckCheck : Check;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 6) * tokens.stagger }}
      className={cn("flex min-w-0 flex-col gap-1", out ? "items-end" : "items-start")}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {message.actor === "agent" ? <Sparkles className="h-3 w-3" style={{ color: readable(ACCENT.turquoise) }} /> : null}{message.author} · {message.at}
      </span>
      <div className={cn("max-w-prose rounded-2xl px-3.5 py-2 text-sm", out ? "rounded-br-md" : "rounded-bl-md border border-border")} style={out ? { background: message.actor === "system" ? tint(ACCENT.muted, 16) : tint(ACCENT.turquoise, 24) } : undefined}>
        {message.body}
      </div>
      {out && message.delivery ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Delivery className="h-3 w-3" style={message.delivery === "read" ? { color: readable(ACCENT.sky) } : undefined} />{message.delivery === "read" ? "Leído" : message.delivery === "delivered" ? "Entregado" : "Enviado"}</span> : null}
    </motion.div>
  );
}

function ThreadView({ thread, onBack, onSend, onClose }: { thread: DemoThread; onBack: () => void; onSend: (thread: DemoThread, body: string) => void; onClose: (thread: DemoThread) => void }) {
  const tokens = useMotionTokens();
  const [draft, setDraft] = useState("");
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const channel = CHANNEL[thread.channel];
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [thread.messages.length]);
  const showSuggestion = thread.suggestion && !suggestionUsed && thread.status !== "closed";
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-background">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <Button size="icon" variant="ghost" aria-label="Volver a la lista" className="lg:hidden" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <Avatar name={thread.contact} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{thread.contact} <span className="font-normal text-muted-foreground">· {thread.customer}</span></p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><channel.icon className="h-3 w-3" style={{ color: readable(channel.color) }} />{channel.label} · {thread.subject} · asignada a {thread.assignedTo}</p>
        </div>
        {thread.channel === "voice" || thread.channel === "whatsapp" ? <Button size="sm" variant="outline"><Phone className="h-3.5 w-3.5" />Llamar</Button> : null}
        {thread.status !== "closed" ? <Button size="sm" variant="ghost" onClick={() => onClose(thread)}><CheckCircle2 className="h-3.5 w-3.5" />Cerrar</Button> : <Pill color={ACCENT.muted}>Cerrada</Pill>}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" style={{ maxHeight: 460 }}>
        {thread.messages.map((message, index) => <Bubble key={message.id} message={message} index={index} />)}
        <div ref={endRef} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-border p-3">
        <AnimatePresence initial={false}>
          {showSuggestion && thread.suggestion ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
              <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.turquoise, 20)}, ${tint(ACCENT.sky, 8)})` }}>
                <p className="flex items-center gap-1.5 text-xs font-medium"><Sparkles className="h-3.5 w-3.5" style={{ color: readable(ACCENT.turquoise) }} />{thread.suggestion.agent} te propone una respuesta</p>
                <p className="text-sm">{thread.suggestion.text}</p>
                <p className="text-xs text-muted-foreground">{thread.suggestion.reason}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { setDraft(thread.suggestion!.text); setSuggestionUsed(true); }} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>Usar y editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSuggestionUsed(true)}>Descartar</Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Respuesta"
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={thread.status === "closed" ? "Escribir reabre la conversación" : `Responder por ${channel.label}…`}
            className="min-h-16 min-w-0 flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button disabled={!draft.trim()} onClick={() => { onSend(thread, draft.trim()); setDraft(""); }} style={draft.trim() ? { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) } : undefined}><Send className="h-4 w-4" />Enviar</Button>
        </div>
        <p className="text-xs text-muted-foreground">Las respuestas por {channel.label} salen con la aprobación configurada para este canal.</p>
      </footer>
    </section>
  );
}

function ContextPanel({ thread }: { thread: DemoThread }) {
  const health = HEALTH[thread.context.health];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel>
        <SectionTitle color={ACCENT.mint} icon={UserRound}>Cliente</SectionTitle>
        <div className="flex items-center gap-3"><Avatar name={thread.customer} size="md" /><div className="min-w-0"><p className="truncate font-medium">{thread.customer}</p><Pill color={health.color}>{health.label}</Pill></div></div>
        <dl className="flex flex-col gap-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Servicios</dt><dd>{thread.context.services}</dd></div>
          {thread.context.openProposal ? <div><dt className="text-xs text-muted-foreground">Propuesta abierta</dt><dd>{thread.context.openProposal}</dd></div> : null}
          {thread.context.nextAction ? <div className="flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs" style={{ background: tint(ACCENT.yellow, 16) }}><Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: readable(ACCENT.yellow) }} />{thread.context.nextAction}</div> : null}
        </dl>
        <Button size="sm" variant="outline">Abrir ficha del cliente</Button>
      </Panel>
      <Panel>
        <SectionTitle color={ACCENT.lilac} icon={PhoneCall}>Llamadas</SectionTitle>
        {DEMO_CALLS.map((call) => {
          const style = CALL[call.kind];
          return (
            <div key={call.id} className="flex min-w-0 items-center gap-2.5">
              <IconTile icon={style.icon} color={style.color} size="sm" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{call.contact}</p><p className="truncate text-xs text-muted-foreground">{style.label} · {call.when}{call.duration ? ` · ${call.duration}` : ""}</p></div>
              {call.kind === "missed" || call.kind === "callback" ? <Button size="sm" variant="outline"><Phone className="h-3 w-3" />Llamar</Button> : null}
            </div>
          );
        })}
      </Panel>
      <Panel>
        <SectionTitle color={ACCENT.sky} icon={Calendar}>Agenda de hoy</SectionTitle>
        {DEMO_AGENDA_TODAY.map((event) => (
          <div key={event.time} className="flex min-w-0 items-center gap-3"><span className="w-12 text-sm font-semibold tabular-nums" style={{ color: readable(ACCENT.sky) }}>{event.time}</span><div className="min-w-0"><p className="truncate text-sm">{event.title}</p><p className="truncate text-xs text-muted-foreground">{event.with}</p></div></div>
        ))}
      </Panel>
    </div>
  );
}

function EmptyState() {
  const tokens = useMotionTokens();
  return (
    <div className="flex min-w-0 flex-col items-center gap-5 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><MessagesSquare className="h-7 w-7" /></motion.span>
      <div><h2 className="text-lg font-semibold">Aquí llegarán las conversaciones con tus clientes</h2><p className="mx-auto max-w-md text-sm text-muted-foreground">Conecta WhatsApp, email o el chat de tu web y verás todos los hilos juntos, con un agente que te propone la respuesta.</p></div>
      <div className="flex flex-wrap justify-center gap-2">
        {(["whatsapp", "email", "webchat"] as const).map((key) => { const channel = CHANNEL[key]; return <Button key={key} variant="outline"><channel.icon className="h-4 w-4" style={{ color: readable(channel.color) }} />Conectar {channel.label}</Button>; })}
      </div>
    </div>
  );
}

/** One conversations page: thread list, the thread with a suggested reply, and the customer's context, calls and agenda. */
export function ConversationsProposal({ threads: initial }: { threads: DemoThread[] }) {
  const tokens = useMotionTokens();
  const [threads, setThreads] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [mobileThread, setMobileThread] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => threads
    .filter((thread) => filter === "all" ? thread.status !== "closed" : thread.status === filter)
    .filter((thread) => channelFilter === "all" || thread.channel === channelFilter)
    .filter((thread) => !needle || `${thread.contact} ${thread.customer} ${thread.subject}`.toLowerCase().includes(needle)), [threads, filter, channelFilter, needle]);
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const waitingUs = threads.filter((thread) => thread.status === "waiting_us").length;
  const late = threads.filter((thread) => thread.slaLate).length;

  function select(thread: DemoThread) {
    setSelectedId(thread.id);
    setMobileThread(true);
    setThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, unread: 0 } : item)));
  }
  function send(thread: DemoThread, body: string) {
    const message: DemoMessage = { id: `n-${Date.now()}`, direction: "outbound", actor: "user", author: "Tú", body, at: "Ahora", delivery: "sent" };
    setThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, messages: [...item.messages, message], status: "waiting_them", slaDueLabel: null, slaLate: false, lastLabel: "ahora", preview: body, suggestion: null } : item)));
    setToast(`Enviado a ${thread.contact} por ${CHANNEL[thread.channel].label}`);
  }
  function close(thread: DemoThread) {
    setThreads((current) => current.map((item) => (item.id === thread.id ? { ...item, status: "closed", slaDueLabel: null, slaLate: false } : item)));
    setToast("Conversación cerrada");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Conversaciones</h1>
          {threads.length ? <p className="text-sm text-muted-foreground">{waitingUs} esperan tu respuesta{late ? ` · ${late} fuera de plazo` : ""}</p> : null}
        </div>
        <Button variant="outline"><Calendar className="h-4 w-4" />Agenda</Button>
      </header>

      {threads.length === 0 ? <EmptyState /> : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,300px)]">
          <aside className={cn("flex min-w-0 flex-col gap-3", mobileThread && "max-lg:hidden")}>
            <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar persona, cliente o asunto" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <LayoutGroup id="conversation-filters">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((option) => (
                  <button key={option.id} onClick={() => setFilter(option.id)} className={cn("relative rounded-full border px-2.5 py-1 text-xs transition-colors duration-(--motion-duration-fast)", filter === option.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
                    {filter === option.id ? <motion.span layoutId="conversation-filter-pill" className="absolute inset-0 rounded-full" style={{ background: tint(ACCENT.turquoise, 28) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                    <span className="relative">{option.label}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "whatsapp", "email", "webchat", "voice"] as const).map((key) => {
                const channel = key === "all" ? null : CHANNEL[key];
                return (
                  <button key={key} aria-pressed={channelFilter === key} onClick={() => setChannelFilter(key)} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors duration-(--motion-duration-fast)", channelFilter === key ? "font-medium" : "text-muted-foreground hover:text-foreground")} style={channelFilter === key ? { background: tint(channel?.color ?? ACCENT.muted, 26), color: channel ? readable(channel.color) : undefined } : undefined}>
                    {channel ? <channel.icon className="h-3 w-3" /> : null}{channel ? channel.label : "Todos los canales"}
                  </button>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <AnimatePresence mode="popLayout">
                {visible.map((thread, index) => <ThreadRow key={thread.id} thread={thread} index={index} active={thread.id === selectedId} onSelect={() => select(thread)} />)}
              </AnimatePresence>
              {visible.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nada por aquí. Prueba otro filtro.</p> : null}
            </div>
          </aside>

          <div className={cn("flex min-w-0 flex-col gap-4", !mobileThread && "max-lg:hidden")}>
            {selected ? (
              <>
                <ThreadView key={selected.id} thread={selected} onBack={() => setMobileThread(false)} onSend={send} onClose={close} />
                <div className="xl:hidden"><ContextPanel thread={selected} /></div>
              </>
            ) : <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Elige una conversación.</p>}
          </div>

          <aside className="min-w-0 max-xl:hidden xl:sticky xl:top-4 xl:self-start">{selected ? <ContextPanel thread={selected} /> : null}</aside>
        </div>
      )}

      <AnimatePresence>
        {toast ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-6 left-1/2 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0 truncate">{toast}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
