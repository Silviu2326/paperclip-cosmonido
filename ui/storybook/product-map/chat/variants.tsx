import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronDown, ChevronsUpDown, FileText, Maximize2, MessageCircle, Minus, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { AgentCapsule, DEMO_ATTACHMENTS, MessageView, MINT, SKY, StatusPill, YELLOW } from "./ChatProposal";
import type { DemoAgent, DemoConversation, DemoMessage } from "./demo-data";

const emptyConversation = (agent: DemoAgent): DemoConversation => ({ agentId: agent.id, messages: [], tasks: [], artifacts: [], suggestions: ["¿Qué puedes hacer por mí?"] });

/** One agent's thread: messages, send with a short typing phase, and approving a pending card. */
function useThread(conversation: DemoConversation) {
  const [messages, setMessages] = useState<DemoMessage[]>(conversation.messages);
  const [typing, setTyping] = useState(false);
  const send = (text: string, files: string[] = []) => {
    const value = text.trim();
    if (!value) return;
    const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setMessages((current) => [...current, { id: `u${current.length}`, kind: "text", from: "user", text: files.length ? `${value}\n📎 ${files.join(" · ")}` : value, at: now }]);
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((current) => [...current, { id: `a${current.length}`, kind: "text", from: "agent", text: "Entendido. Me pongo con ello y te aviso en cuanto tenga algo que revisar.", at: now }]);
    }, 1100);
  };
  const approve = (id: string) => setMessages((current) => current.map((message) => (message.id === id && message.kind === "approval" ? { ...message, state: "approved" as const } : message)));
  const permit = (id: string, state: "once" | "always" | "denied") => setMessages((current) => current.map((message) => (message.id === id && message.kind === "permission" ? { ...message, state } : message)));
  return { messages, typing, send, approve, permit };
}

function Typing({ name }: { name: string }) {
  return <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{name} está escribiendo<span className="inline-flex gap-0.5">{[0, 1, 2].map((dot) => <motion.span key={dot} className="h-1 w-1 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: dot * 0.2 }} />)}</span></p>;
}

function Composer({ placeholder, onSend, suggestions, large = false }: { placeholder: string; onSend: (text: string, files: string[]) => void; suggestions: string[]; large?: boolean }) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const submit = () => { if (!draft.trim()) return; onSend(draft, files); setDraft(""); setFiles([]); };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto">
        {suggestions.map((text) => <button key={text} type="button" onClick={() => onSend(text, [])} className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">{text}</button>)}
      </div>
      <form className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-background p-2 transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {files.length ? <div className="flex flex-wrap gap-1.5">{files.map((file) => <span key={file} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ background: tint(SKY, 22), color: readable(SKY) }}><FileText className="h-3.5 w-3.5" />{file}<button type="button" aria-label={`Quitar ${file}`} onClick={() => setFiles(files.filter((item) => item !== file))}><X className="h-3 w-3" /></button></span>)}</div> : null}
        <div className="flex items-end gap-2">
          <Button type="button" size="icon" variant="ghost" aria-label="Adjuntar archivo" onClick={() => setFiles((current) => { const next = DEMO_ATTACHMENTS.find((file) => !current.includes(file)); return next ? [...current, next] : current; })}><Paperclip className="h-4 w-4" /></Button>
          <textarea aria-label="Mensaje" rows={large ? 3 : 1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={placeholder} className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground" />
          <Button type="submit" size="icon" aria-label="Enviar" disabled={!draft.trim()} style={draft.trim() ? { background: SKY, color: ink(SKY) } : undefined}><ArrowUp className="h-4 w-4" /></Button>
        </div>
      </form>
    </div>
  );
}

/** A made-up page behind the assistant, to show that it is available everywhere. */
function FauxPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 p-6" aria-hidden="true">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Clientes</span><span>›</span><span className="font-medium text-foreground">Clínica Dental Sonrisa</span></div>
      <h1 className="text-2xl font-semibold">Clínica Dental Sonrisa</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Servicios", "940 €/mes"], ["Propuesta abierta", "2.400 €"], ["Tareas activas", "6"]].map(([label, value]) => <div key={label} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-border p-4">{[70, 90, 55, 80].map((width, index) => <span key={index} className="block h-3 rounded bg-muted" style={{ width: `${width}%` }} />)}</div>
    </div>
  );
}

/**
 * Variant B — floating assistant. Focus on never leaving what you are doing:
 * a launcher in the corner of any page opens a compact chat that already knows
 * which customer you are looking at.
 */
export function ChatFloating({ agents, conversations, initialAgentId = "a-ceo" }: { agents: DemoAgent[]; conversations: Record<string, DemoConversation>; initialAgentId?: string }) {
  const tokens = useMotionTokens();
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [agentId, setAgentId] = useState(initialAgentId);
  const [context, setContext] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const agent = agents.find((candidate) => candidate.id === agentId) ?? agents[0];
  useEffect(() => {
    const timer = window.setTimeout(() => setTeaser(true), 900);
    return () => window.clearTimeout(timer);
  }, []);
  if (!agent) return <FauxPage />;
  const unread = agents.reduce((sum, candidate) => sum + candidate.unread, 0);
  return (
    <div className="relative h-dvh min-h-[560px] overflow-hidden bg-background">
      <FauxPage />
      <div className="absolute bottom-4 right-4 z-20 flex max-w-[calc(100%-2rem)] flex-col items-end gap-3">
        <AnimatePresence>
          {open ? (
            <motion.section key="panel" initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.96 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl max-sm:fixed max-sm:inset-2 max-sm:h-auto max-sm:w-auto">
              <header className="relative flex items-center gap-2 border-b border-border px-3 py-2.5">
                <button type="button" aria-haspopup="listbox" aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50">
                  <AgentCapsule agent={agent} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{agent.name}</span><span className="block truncate text-xs text-muted-foreground">{agent.status === "working" && agent.doing ? `${agent.doing}…` : agent.role}</span></span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
                <Button size="icon" variant="ghost" aria-label="Abrir a pantalla completa"><Maximize2 className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Minimizar" onClick={() => setOpen(false)}><Minus className="h-4 w-4" /></Button>
                <AnimatePresence>
                  {pickerOpen ? (
                    <motion.ul role="listbox" aria-label="Elegir agente" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="absolute left-2 top-full z-10 mt-1 flex max-h-72 w-64 flex-col overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-lg">
                      {agents.map((candidate) => (
                        <li key={candidate.id}><button type="button" role="option" aria-selected={candidate.id === agent.id} onClick={() => { setAgentId(candidate.id); setPickerOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/60">
                          <AgentCapsule agent={candidate} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate">{candidate.name}</span><span className="block truncate text-xs text-muted-foreground">{candidate.role}</span></span>
                          {candidate.unread ? <span className="rounded-full px-1.5 text-xs font-semibold" style={{ background: SKY, color: ink(SKY) }}>{candidate.unread}</span> : candidate.id === agent.id ? <Check className="h-3.5 w-3.5" /> : null}
                        </button></li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </header>
              {context ? (
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs" style={{ background: tint(MINT, 14) }}>
                  <span className="min-w-0 flex-1 truncate">Viendo: <strong>Clientes › Clínica Dental Sonrisa</strong>. {agent.name} lo tiene en cuenta.</span>
                  <button type="button" aria-label="Quitar el contexto de la página" onClick={() => setContext(false)} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : null}
              <FloatingThread key={agent.id} agent={agent} conversation={conversations[agent.id] ?? emptyConversation(agent)} />
            </motion.section>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {!open && teaser && agent.unread > 0 ? (
            <motion.button key="teaser" type="button" onClick={() => setOpen(true)} initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex max-w-xs items-start gap-2 rounded-2xl rounded-br-md border border-border bg-background p-3 text-left text-sm shadow-lg">
              <AgentCapsule agent={agent} size="sm" /><span className="min-w-0"><span className="block text-xs font-semibold">{agent.name}</span><span className="block line-clamp-2 text-muted-foreground">{agent.lastMessage}</span></span>
            </motion.button>
          ) : null}
        </AnimatePresence>
        <motion.button type="button" aria-label={open ? "Cerrar el chat" : "Abrir el chat con tus agentes"} aria-expanded={open} onClick={() => setOpen(!open)} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg" style={{ background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: ink(SKY) }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={open ? "x" : "chat"} initial={{ rotate: -45, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 45, opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex">{open ? <ChevronDown className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}</motion.span>
          </AnimatePresence>
          {!open && unread > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold" style={{ background: YELLOW, color: ink(YELLOW) }}>{unread}</span> : null}
        </motion.button>
      </div>
    </div>
  );
}

function FloatingThread({ agent, conversation }: { agent: DemoAgent; conversation: DemoConversation }) {
  const tokens = useMotionTokens();
  const { messages, typing, send, approve, permit } = useThread(conversation);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, typing]);
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 ? <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">Habla con {agent.name}. {conversation.suggestions[0]}</p> : null}
        {messages.map((message) => (
          <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="min-w-0"><MessageView message={message} onApprove={approve} onPermission={permit} /></motion.div>
        ))}
        {typing ? <Typing name={agent.name} /> : null}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-2"><Composer placeholder={`Escribe a ${agent.name}…`} onSend={send} suggestions={conversation.suggestions.slice(0, 2)} /></div>
    </>
  );
}

/** Groups the work cards between two text messages so a long run of activity collapses to one line. */
function groupBlocks(messages: DemoMessage[]) {
  const blocks: ({ type: "text"; message: Extract<DemoMessage, { kind: "text" }> } | { type: "decision"; message: DemoMessage } | { type: "actions"; items: DemoMessage[] })[] = [];
  for (const message of messages) {
    if (message.kind === "text") blocks.push({ type: "text", message });
    else if (message.kind === "approval" || message.kind === "permission") blocks.push({ type: "decision", message });
    else {
      const last = blocks[blocks.length - 1];
      if (last?.type === "actions") last.items.push(message);
      else blocks.push({ type: "actions", items: [message] });
    }
  }
  return blocks;
}

const describe = (message: DemoMessage): string =>
  message.kind === "task" ? `creó el encargo ${message.identifier}`
    : message.kind === "deliverable" ? `entregó «${message.title}»`
      : message.kind === "working" ? `${message.steps.filter((step) => step.done).length} de ${message.steps.length} pasos`
        : "hizo algo";

function ActionGroup({ items, agent, live }: { items: DemoMessage[]; agent: DemoAgent; live: boolean }) {
  const tokens = useMotionTokens();
  const [open, setOpen] = useState(live);
  return (
    <div className="min-w-0 rounded-xl border border-border">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/40">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: tint(SKY, 26), color: readable(SKY) }}><Check className="h-3 w-3" /></span>
        <span className="min-w-0 flex-1 truncate">{agent.name} {live ? "está trabajando" : `hizo ${items.length} ${items.length === 1 ? "cosa" : "cosas"}`}: <span className="text-muted-foreground">{items.map(describe).join(" · ")}</span></span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex text-muted-foreground"><ChevronDown className="h-4 w-4" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
            <div className="flex min-w-0 flex-col gap-2 border-t border-border p-3">{items.map((message) => <MessageView key={message.id} message={message} onApprove={() => undefined} />)}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Variant C — thread as a document. Focus on reading and on the paper trail:
 * messages are paragraphs, not bubbles, and everything the agent did between
 * two messages folds into one expandable line.
 */
export function ChatDocument({ agents, conversations, initialAgentId = "a-ceo" }: { agents: DemoAgent[]; conversations: Record<string, DemoConversation>; initialAgentId?: string }) {
  const [agentId, setAgentId] = useState(initialAgentId);
  const agent = agents.find((candidate) => candidate.id === agentId) ?? agents[0];
  if (!agent) return null;
  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <nav aria-label="Agentes" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {agents.map((candidate) => (
          <button key={candidate.id} type="button" aria-current={candidate.id === agent.id} onClick={() => setAgentId(candidate.id)} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-sm transition-colors duration-(--motion-duration-fast)", candidate.id === agent.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={candidate.id === agent.id ? { background: tint(BRAND(candidate.color, "a"), 24) } : undefined}>
            <AgentCapsule agent={candidate} size="sm" />{candidate.name}{candidate.unread ? <span className="rounded-full px-1.5 text-xs font-semibold" style={{ background: SKY, color: ink(SKY) }}>{candidate.unread}</span> : null}
          </button>
        ))}
      </nav>
      <DocumentThread key={agent.id} agent={agent} conversation={conversations[agent.id] ?? emptyConversation(agent)} />
    </div>
  );
}

function DocumentThread({ agent, conversation }: { agent: DemoAgent; conversation: DemoConversation }) {
  const tokens = useMotionTokens();
  const { messages, typing, send, approve, permit } = useThread(conversation);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, typing]);
  const blocks = groupBlocks(messages);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-5 px-4 py-6">
          <header className="flex items-center gap-3">
            <AgentCapsule agent={agent} size="lg" />
            <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-semibold">{agent.name}</h1><p className="truncate text-sm text-muted-foreground">{agent.role}</p></div>
            <StatusPill status={agent.status} />
          </header>
          {blocks.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Empieza la conversación con {agent.name}. {conversation.suggestions[0]}</p> : null}
          {blocks.map((block, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 6) * tokens.stagger }} className="min-w-0">
              {block.type === "text" ? (
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 shrink-0">{block.message.from === "agent" ? <AgentCapsule agent={agent} size="sm" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold" style={{ background: tint(SKY, 28), color: readable(SKY) }}>Tú</span>}</span>
                  <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{block.message.from === "agent" ? agent.name : "Tú"}</span> · {block.message.at}</p><p className="mt-0.5 whitespace-pre-wrap break-words text-base leading-relaxed">{block.message.text}</p></div>
                </div>
              ) : block.type === "decision" ? (
                <MessageView message={block.message} onApprove={approve} onPermission={permit} />
              ) : (
                <ActionGroup items={block.items} agent={agent} live={index === blocks.length - 1 && block.items.some((item) => item.kind === "working")} />
              )}
            </motion.div>
          ))}
          {typing ? <Typing name={agent.name} /> : null}
          <div ref={endRef} />
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-background"><div className="mx-auto w-full max-w-3xl p-3"><Composer large placeholder={`Escribe a ${agent.name}… (Intro para enviar, Mayús+Intro para salto de línea)`} onSend={send} suggestions={conversation.suggestions} /></div></div>
    </>
  );
}

