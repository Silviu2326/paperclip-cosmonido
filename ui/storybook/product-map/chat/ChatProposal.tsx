import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowLeft,
  AlertTriangle,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  FileText,
  Film,
  Image as ImageIcon,
  ChevronDown,
  Paperclip,
  ListChecks,
  Loader2,
  Lock,
  RefreshCw,
  WifiOff,
  MessageCircle,
  PanelRight,
  Search,
  ShieldCheck,
  Sheet,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { Banner } from "../conversations/states";
import type {
  DemoAgent,
  DemoAgentStatus,
  DemoArtifact,
  DemoConversation,
  DemoMessage,
  DemoTask,
} from "./demo-data";

export const MINT = BRAND(8);
export const SKY = BRAND(7);
export const YELLOW = BRAND(10);
export const LILAC = BRAND(2);

const STATUS: Record<DemoAgentStatus, { label: string; color: string | null }> = {
  idle: { label: "Disponible", color: MINT },
  working: { label: "Trabajando", color: SKY },
  paused: { label: "En pausa", color: null },
  "needs-you": { label: "Te espera", color: YELLOW },
};

const TASK_STATUS: Record<DemoTask["status"], { label: string; color: string | null; icon: typeof CircleDot }> = {
  todo: { label: "Por hacer", color: null, icon: CircleDashed },
  in_progress: { label: "En curso", color: SKY, icon: CircleDot },
  in_review: { label: "Por revisar", color: YELLOW, icon: Sparkles },
  done: { label: "Hecha", color: MINT, icon: CheckCircle2 },
};

const FILE_ICON = { doc: FileText, image: ImageIcon, video: Film, sheet: Sheet } as const;
const FILE_COLOR = { doc: SKY, image: LILAC, video: MINT, sheet: YELLOW } as const;

type Filter = "all" | "working" | "needs-you";
type Panel = "tasks" | "files";

export function AgentCapsule({ agent, size = "md" }: { agent: DemoAgent; size?: "sm" | "md" | "lg" }) {
  const status = STATUS[agent.status];
  return (
    <span className="relative shrink-0">
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-xl font-semibold",
          size === "sm" && "h-7 w-7 text-xs",
          size === "md" && "h-10 w-10 text-sm",
          size === "lg" && "h-12 w-12 text-base",
        )}
        style={{ background: `linear-gradient(135deg, ${BRAND(agent.color, "a")}, ${BRAND(agent.color, "b")})`, color: "white" }}
      >
        {agent.name[0]}
      </span>
      <span
        aria-label={status.label}
        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background"
        style={{ background: status.color ?? "var(--muted-foreground)" }}
      >
        {agent.status === "working" ? (
          <span className="absolute inset-0 animate-ping rounded-full" style={{ background: SKY, opacity: 0.6 }} />
        ) : null}
      </span>
    </span>
  );
}

export function StatusPill({ status }: { status: DemoAgentStatus }) {
  const { label, color } = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={color ? { background: tint(color, 18), color: readable(color) } : { background: "var(--muted)", color: "var(--muted-foreground)" }}
    >
      {label}
    </span>
  );
}

export function Roster({
  agents,
  selectedId,
  onSelect,
  className,
  pageSize = 0,
}: {
  agents: DemoAgent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  pageSize?: number;
}) {
  const [shown, setShown] = useState(pageSize || Number.POSITIVE_INFINITY);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const needle = query.trim().toLowerCase();
  const counts = {
    all: agents.length,
    working: agents.filter((agent) => agent.status === "working").length,
    "needs-you": agents.filter((agent) => agent.status === "needs-you" || agent.unread > 0).length,
  };
  const visible = agents
    .filter((agent) => filter === "all" || (filter === "working" ? agent.status === "working" : agent.status === "needs-you" || agent.unread > 0))
    .filter((agent) => !needle || `${agent.name} ${agent.role}`.toLowerCase().includes(needle));
  const starred = visible.filter((agent) => agent.starred);
  const rest = visible.filter((agent) => !agent.starred);
  const restShown = rest.slice(0, shown);

  const row = (agent: DemoAgent, index: number) => (
    <motion.button
      key={agent.id}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={() => onSelect(agent.id)}
      aria-current={agent.id === selectedId ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors duration-(--motion-duration-fast)",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        agent.id === selectedId ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <AgentCapsule agent={agent} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{agent.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{agent.lastAt}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {agent.status === "working" && agent.doing ? (
            <span style={{ color: readable(SKY) }}>{agent.doing}…</span>
          ) : (
            agent.lastMessage
          )}
        </span>
      </span>
      {agent.unread > 0 ? (
        <span
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
          style={{ background: SKY, color: ink(SKY) }}
        >
          {agent.unread}
        </span>
      ) : null}
    </motion.button>
  );

  return (
    <aside className={cn("flex min-h-0 flex-col gap-3 border-r border-border bg-background p-3", className)}>
      <div className="flex items-center justify-between px-1 pt-1">
        <h1 className="text-lg font-semibold">Chat</h1>
        <span className="text-xs text-muted-foreground">{agents.length} agentes</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          aria-label="Buscar agente por nombre o rol"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Buscar por nombre o rol"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([["all", "Todos", null], ["working", "Trabajando", SKY], ["needs-you", "Te esperan", YELLOW]] as const).map(([id, label, color]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)",
              filter === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground",
            )}
            style={filter === id ? { background: color ? tint(color, 30) : "var(--accent)" } : undefined}
          >
            {label} · {counts[id]}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {starred.length ? <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Favoritos</p> : null}
        <LayoutGroup>{starred.map(row)}</LayoutGroup>
        {rest.length && starred.length ? <p className="px-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipo</p> : null}
        <LayoutGroup>{restShown.map((agent, index) => row(agent, index + starred.length))}</LayoutGroup>
        {rest.length > restShown.length ? <Button variant="outline" size="sm" className="mt-1" onClick={() => setShown((count) => count + (pageSize || 25))}>Cargar más · {rest.length - restShown.length} restantes</Button> : null}
        {visible.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Ningún agente coincide.</p> : null}
      </div>
    </aside>
  );
}

export function Bubble({ from, children, at }: { from: "user" | "agent"; children: ReactNode; at: string }) {
  const user = from === "user";
  return (
    <div className={cn("flex flex-col gap-1", user ? "items-end" : "items-start")}>
      <div
        className={cn("min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed", user ? "rounded-br-md" : "rounded-bl-md bg-muted")}
        style={user ? { background: tint(SKY, 22) } : undefined}
      >
        {children}
      </div>
      <span className="px-1 text-xs text-muted-foreground">{at}</span>
    </div>
  );
}

export function EventCard({ color, icon: Icon, label, children }: { color: string; icon: typeof ListChecks; label: string; children: ReactNode }) {
  return (
    <div
      className="flex min-w-0 max-w-[85%] flex-col gap-2 break-words rounded-xl border border-border p-3 text-sm"
      style={{ background: `linear-gradient(135deg, ${tint(color, 14)}, transparent 70%)` }}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: readable(color) }}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      {children}
    </div>
  );
}

export function MessageView({ message, onApprove, onResend, onPermission }: { message: DemoMessage; onApprove: (id: string) => void; onResend?: (id: string) => void; onPermission?: (id: string, state: "once" | "always" | "denied") => void }) {
  switch (message.kind) {
    case "text":
      if (message.from === "user" && (message.failed || message.sending)) {
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed" style={{ background: tint(SKY, message.failed ? 10 : 16), opacity: message.sending ? 0.7 : 1, boxShadow: message.failed ? `inset 0 0 0 1.5px ${tint("var(--destructive)", 55)}` : undefined }}>{message.text}</div>
            {message.sending ? (
              <span className="flex items-center gap-1 px-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Enviando…</span>
            ) : (
              <span role="alert" className="flex flex-wrap items-center justify-end gap-2 px-1 text-xs" style={{ color: readable("var(--destructive)") }}>
                <AlertTriangle className="h-3 w-3" />No se pudo enviar.
                {onResend ? <button type="button" className="font-medium underline underline-offset-2" onClick={() => onResend(message.id)}>Reenviar</button> : null}
              </span>
            )}
          </div>
        );
      }
      return <Bubble from={message.from} at={message.at}>{message.text}</Bubble>;
    case "task": {
      const status = TASK_STATUS[message.status];
      return (
        <EventCard color={SKY} icon={ListChecks} label="Encargo creado">
          <p className="font-medium">{message.title}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{message.identifier}</span>
            <span className="inline-flex items-center gap-1" style={status.color ? { color: readable(status.color) } : undefined}>
              <status.icon className="h-3 w-3" />
              {status.label}
            </span>
          </p>
        </EventCard>
      );
    }
    case "deliverable": {
      const Icon = FILE_ICON[message.fileKind];
      return (
        <EventCard color={MINT} icon={Check} label="Entrega lista">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: tint(FILE_COLOR[message.fileKind], 30), color: readable(FILE_COLOR[message.fileKind]) }}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{message.title}</p>
              <p className="text-xs text-muted-foreground">{message.meta}</p>
            </div>
          </div>
        </EventCard>
      );
    }
    case "approval":
      return (
        <EventCard color={YELLOW} icon={ShieldCheck} label={message.state === "pending" ? "Necesita tu aprobación" : "Aprobado"}>
          <div>
            <p className="font-medium">{message.title}</p>
            <p className="text-xs text-muted-foreground">{message.detail}</p>
          </div>
          {message.state === "pending" ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onApprove(message.id)}><Check className="h-3.5 w-3.5" />Aprobar y enviar</Button>
              <Button size="sm" variant="outline">Pedir cambios</Button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: readable(MINT) }}><CheckCircle2 className="h-3.5 w-3.5" />Enviado ahora mismo</p>
          )}
        </EventCard>
      );
    case "permission": {
      const decided = message.state !== "pending";
      return (
        <EventCard color={LILAC} icon={Lock} label={decided ? "Permiso respondido" : "Pide un permiso"}>
          <div>
            <p className="font-medium">{message.title}</p>
            <p className="text-xs text-muted-foreground">{message.detail}</p>
          </div>
          <p className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ background: tint(LILAC, 16) }}><ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: readable(LILAC) }} />{message.scope}</p>
          {decided ? (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: readable(message.state === "denied" ? "var(--muted-foreground)" : MINT) }}>
              {message.state === "denied" ? <X className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {message.state === "once" ? "Permitido solo esta vez" : message.state === "always" ? "Permitido siempre para esta empresa" : "No permitido: seguirá sin acceder"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onPermission?.(message.id, "once")}>Permitir una vez</Button>
              <Button size="sm" variant="outline" onClick={() => onPermission?.(message.id, "always")}>Permitir siempre</Button>
              <Button size="sm" variant="ghost" onClick={() => onPermission?.(message.id, "denied")}>No permitir</Button>
            </div>
          )}
        </EventCard>
      );
    }
    case "working":
      return (
        <EventCard color={LILAC} icon={Loader2} label="Trabajando en ello">
          <ul className="flex flex-col gap-1.5">
            {message.steps.map((step) => (
              <li key={step.label} className={cn("flex items-center gap-2 text-sm", step.done ? "text-muted-foreground" : "")}>
                {step.done ? <CheckCircle2 className="h-4 w-4" style={{ color: MINT }} /> : <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                <span className={step.done ? "line-through decoration-muted-foreground/40" : ""}>{step.label}</span>
              </li>
            ))}
          </ul>
        </EventCard>
      );
  }
}

export function SidePanel({ conversation, agent, onClose }: { conversation: DemoConversation; agent: DemoAgent; onClose: () => void }) {
  const [tab, setTab] = useState<Panel>("tasks");
  const tokens = useMotionTokens();
  const open = conversation.tasks.filter((task) => task.status !== "done").length;
  return (
    <aside className="flex min-h-0 flex-col gap-4 border-l border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <AgentCapsule agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar panel" className="xl:hidden" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div role="tablist" className="inline-flex self-start rounded-xl border border-border bg-muted/40 p-1">
        <LayoutGroup id="chat-panel-tabs">
          {([["tasks", "Encargos", open], ["files", "Archivos", conversation.artifacts.length]] as const).map(([id, label, count]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {tab === id ? <motion.span layoutId="chat-panel-pill" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
              <span className="relative">{label}</span>
              <span className="relative ml-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          ))}
        </LayoutGroup>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: tokens.fast, ease: tokens.standard }}
            className="flex flex-col gap-2"
          >
            {tab === "tasks"
              ? conversation.tasks.length
                ? conversation.tasks.map((task) => <TaskCard key={task.id} task={task} />)
                : <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay encargos para este agente.</p>
              : conversation.artifacts.length
                ? conversation.artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)
                : <p className="p-6 text-center text-sm text-muted-foreground">Cuando entregue algo, aparecerá aquí.</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

function TaskCard({ task }: { task: DemoTask }) {
  const status = TASK_STATUS[task.status];
  return (
    <button className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-left transition-[border-color,transform] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="line-clamp-2 text-sm font-medium">{task.title}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{task.identifier}</span>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={status.color ? { background: tint(status.color, 18), color: readable(status.color) } : { background: "var(--muted)" }}>
          <status.icon className="h-3 w-3" />{status.label}
        </span>
        <span className="ml-auto">{task.updated}</span>
      </span>
    </button>
  );
}

function ArtifactCard({ artifact }: { artifact: DemoArtifact }) {
  const Icon = FILE_ICON[artifact.fileKind];
  const color = FILE_COLOR[artifact.fileKind];
  return (
    <button className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-[border-color,transform] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(color, 28), color: readable(color) }}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{artifact.title}</span>
        <span className="text-xs text-muted-foreground">{artifact.meta} · {artifact.updated}</span>
      </span>
    </button>
  );
}

export function Greeting({ agent, suggestions, onPick }: { agent: DemoAgent; suggestions: string[]; onPick: (text: string) => void }) {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }}>
        <AgentCapsule agent={agent} size="lg" />
      </motion.div>
      <div>
        <h2 className="text-lg font-semibold">Habla con {agent.name}</h2>
        <p className="text-sm text-muted-foreground">{agent.role}. Cuéntale qué necesitas y creará los encargos por ti.</p>
      </div>
      <div className="flex max-w-lg flex-wrap justify-center gap-2">
        {suggestions.map((text) => (
          <button key={text} onClick={() => onPick(text)} className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export const DEMO_ATTACHMENTS = ["Brief-clinica.pdf", "Logo-sonrisa.png", "Tarifas-2026.xlsx"];

/** Extra states a conversation can start in. */
export interface ChatBehavior {
  /** Starts with the connection lost, counting down to an automatic retry. */
  offline?: boolean;
  /** The agent is answering right now: this text is revealed word by word. */
  stream?: string;
  /** Only the latest N messages are rendered; older ones load on request. */
  historyLimit?: number;
}

function Conversation({
  agent,
  conversation,
  onBack,
  agents,
  onSwitch,
  behavior = {},
}: {
  agent: DemoAgent;
  conversation: DemoConversation;
  onBack: () => void;
  agents: DemoAgent[];
  onSwitch: (id: string) => void;
  behavior?: ChatBehavior;
}) {
  const [attachments, setAttachments] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [messages, setMessages] = useState<DemoMessage[]>(conversation.messages);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Connection: lost → (countdown) → retrying → ok. Sending is blocked until it is back.
  const [link, setLink] = useState<"lost" | "retrying" | "ok" | "back">(behavior.offline ? "lost" : "ok");
  const [countdown, setCountdown] = useState(8);
  const [streamed, setStreamed] = useState<string | null>(behavior.stream ? "" : null);
  const [shownCount, setShownCount] = useState(behavior.historyLimit ?? Number.POSITIVE_INFINITY);

  useEffect(() => {
    if (link !== "lost") return;
    if (countdown <= 0) { setLink("retrying"); return; }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [link, countdown]);
  useEffect(() => {
    if (link === "retrying") {
      const timer = window.setTimeout(() => { setLink("back"); setCountdown(8); }, 1300);
      return () => window.clearTimeout(timer);
    }
    if (link === "back") {
      const timer = window.setTimeout(() => setLink("ok"), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [link]);

  // Streaming answer: reveal the text word by word, then settle it as a normal message.
  useEffect(() => {
    if (!behavior.stream || streamed === null) return;
    const words = behavior.stream.split(" ");
    const done = streamed.split(" ").filter(Boolean).length;
    if (done >= words.length) {
      const timer = window.setTimeout(() => {
        setMessages((current) => [...current, { id: "streamed", kind: "text", from: "agent", text: behavior.stream!, at: "ahora" }]);
        setStreamed(null);
      }, 400);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setStreamed(words.slice(0, done + 1).join(" ")), 70);
    return () => window.clearTimeout(timer);
  }, [behavior.stream, streamed]);
  const stopStream = () => {
    if (streamed) setMessages((current) => [...current, { id: "streamed", kind: "text", from: "agent", text: `${streamed}…`, at: "ahora" }]);
    setStreamed(null);
  };

  const reply = (text: string) => window.setTimeout(() => setMessages((current) => [...current, { id: `a${current.length}`, kind: "text", from: "agent", text, at: "ahora" }]), 900);
  const resend = (id: string) => {
    setMessages((current) => current.map((message) => (message.id === id && message.kind === "text" ? { ...message, failed: false, sending: true } : message)));
    window.setTimeout(() => {
      setMessages((current) => current.map((message) => (message.id === id && message.kind === "text" ? { ...message, sending: false } : message)));
      reply("Recibido ahora. Perdona el retraso, me pongo con ello.");
    }, 1100);
  };
  const permit = (id: string, state: "once" | "always" | "denied") => {
    setMessages((current) => current.map((message) => (message.id === id && message.kind === "permission" ? { ...message, state } : message)));
    reply(state === "denied" ? "Entendido, seguiré sin acceder. Te pediré lo que necesite por aquí." : "Gracias, ya tengo acceso. Sigo con ello y te cuento.");
  };
  const tokens = useMotionTokens();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, typing, streamed]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || link !== "ok") return;
    const files = attachments;
    setAttachments([]);
    const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setMessages((current) => [...current, { id: `u${current.length}`, kind: "text", from: "user", text: files.length ? `${value}
📎 ${files.join(" · ")}` : value, at: now }]);
    setDraft("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((current) => [
        ...current,
        { id: `a${current.length}`, kind: "text", from: "agent", text: "Entendido. Me pongo con ello y te aviso en cuanto tenga algo que revisar.", at: now },
      ]);
    }, 1100);
  };

  const approve = (id: string) =>
    setMessages((current) => current.map((message) => (message.id === id && message.kind === "approval" ? { ...message, state: "approved" as const } : message)));

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Button size="icon" variant="ghost" aria-label="Volver a los chats" className="lg:hidden" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <AgentCapsule agent={agent} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{agent.name}</p>
            <p className="truncate text-xs text-muted-foreground">{agent.status === "working" && agent.doing ? `${agent.doing}…` : agent.role}</p>
          </div>
          <StatusPill status={agent.status} />
          <Button size="icon" variant="ghost" aria-label="Ver encargos y archivos" className="xl:hidden" onClick={() => setPanelOpen((open) => !open)}><PanelRight className="h-4 w-4" /></Button>
        </header>
        {messages.length === 0 ? (
          <Greeting agent={agent} suggestions={conversation.suggestions} onPick={send} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {messages.length > shownCount ? (
              <Button variant="outline" size="sm" className="self-center" onClick={() => setShownCount((count) => count + 40)}>Cargar mensajes anteriores · {messages.length - shownCount}</Button>
            ) : null}
            <AnimatePresence initial={false}>
              {messages.slice(-shownCount).map((message) => (
                <motion.div
                  key={message.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: tokens.base, ease: tokens.easeOut }}
                >
                  <MessageView message={message} onApprove={approve} onResend={resend} onPermission={permit} />
                </motion.div>
              ))}
              {streamed !== null ? (
                <motion.div key="stream" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start gap-1">
                  <div className="min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm leading-relaxed">
                    {streamed || <span className="text-muted-foreground">Pensando…</span>}
                    <motion.span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 rounded-full bg-foreground" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                  </div>
                  <button type="button" onClick={stopStream} className="px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Detener respuesta</button>
                </motion.div>
              ) : null}
              {typing ? (
                <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{agent.name} está escribiendo…
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
        )}
        <footer className="flex flex-col gap-2 border-t border-border p-3">
          <div className="flex gap-1.5 overflow-x-auto">
            {conversation.suggestions.map((text) => (
              <button
                key={text}
                onClick={() => send(text)}
                className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground"
              >
                {text}
              </button>
            ))}
          </div>
          {link !== "ok" ? (
            <Banner tone={link === "back" ? "info" : "warning"} icon={link === "back" ? CheckCircle2 : WifiOff} action={link === "lost" ? <Button size="sm" variant="outline" onClick={() => setLink("retrying")}><RefreshCw className="h-3.5 w-3.5" />Reintentar ahora</Button> : undefined}>
              {link === "lost" ? `Sin conexión. Reintentando en ${countdown} s…` : link === "retrying" ? "Reconectando…" : "Reconectado. Ya puedes escribir de nuevo."}
            </Banner>
          ) : null}
          <form
            className="flex flex-col gap-2 rounded-2xl border border-border p-2 transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30"
            onSubmit={(event) => { event.preventDefault(); send(draft); }}
          >
            <div className="relative flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Para:</span>
              <button type="button" aria-haspopup="listbox" aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)} className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs transition-colors duration-(--motion-duration-fast) hover:bg-accent/50">
                <span aria-hidden="true" className="h-4 w-4 rounded-full" style={{ background: `linear-gradient(135deg, ${BRAND(agent.color, "a")}, ${BRAND(agent.color, "b")})` }} />
                {agent.name}<ChevronDown className="h-3 w-3" />
              </button>
              <AnimatePresence>
                {pickerOpen ? (
                  <motion.ul role="listbox" aria-label="Elegir agente" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="absolute bottom-full left-8 z-20 mb-1 flex w-56 flex-col rounded-xl border border-border bg-background p-1 shadow-lg">
                    {agents.map((candidate) => (
                      <li key={candidate.id}>
                        <button type="button" role="option" aria-selected={candidate.id === agent.id} onClick={() => { setPickerOpen(false); if (candidate.id !== agent.id) onSwitch(candidate.id); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/60">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${BRAND(candidate.color, "a")}, ${BRAND(candidate.color, "b")})` }}>{candidate.name[0]}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate">{candidate.name}</span><span className="block truncate text-xs text-muted-foreground">{candidate.role}</span></span>
                          {candidate.id === agent.id ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
            <AnimatePresence initial={false}>
              {attachments.length ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-wrap gap-1.5 overflow-hidden">
                  {attachments.map((file) => (
                    <motion.span key={file} layout initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ background: tint(SKY, 22), color: readable(SKY) }}>
                      <FileText className="h-3.5 w-3.5" />{file}
                      <button type="button" aria-label={`Quitar ${file}`} onClick={() => setAttachments(attachments.filter((item) => item !== file))}><X className="h-3 w-3" /></button>
                    </motion.span>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="flex items-end gap-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Adjuntar archivo" onClick={() => setAttachments((current) => { const next = DEMO_ATTACHMENTS.find((file) => !current.includes(file)); return next ? [...current, next] : current; })}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <textarea
              aria-label={`Mensaje para ${agent.name}`}
              rows={1}
              value={draft}
              disabled={link === "lost" || link === "retrying"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(draft); } }}
              placeholder={link === "lost" || link === "retrying" ? "Sin conexión…" : `Escribe a ${agent.name}…`}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" aria-label="Enviar" disabled={!draft.trim() || link === "lost" || link === "retrying"} style={draft.trim() ? { background: SKY, color: ink(SKY) } : undefined}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            </div>
          </form>
        </footer>
      </div>
      <div className={cn("w-80 shrink-0 max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-10 max-xl:shadow-lg", panelOpen ? "" : "max-xl:hidden")}>
        <SidePanel conversation={conversation} agent={agent} onClose={() => setPanelOpen(false)} />
      </div>
    </section>
  );
}

function NoSelection() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 p-8 text-center lg:flex">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: ink(SKY) }}>
        <MessageCircle className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold">Elige con quién hablar</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Cada agente guarda una sola conversación contigo, con sus encargos y archivos al lado.</p>
    </div>
  );
}

function EmptyTeam() {
  return (
    <div className="flex min-h-96 flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: ink(SKY) }}>
        <MessageCircle className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Aún no tienes agentes con quien hablar</h2>
        <p className="text-sm text-muted-foreground">Añade un agente a tu equipo y podrás escribirle desde aquí.</p>
      </div>
      <Button>Añadir agente</Button>
    </div>
  );
}

/** Chat page: roster of agents, one continuous conversation with inline work cards, and a side panel with that agent's tasks and files. */
export function ChatProposal({
  agents,
  conversations,
  initialAgentId = null,
  pageSize = 0,
  behavior,
}: {
  agents: DemoAgent[];
  conversations: Record<string, DemoConversation>;
  initialAgentId?: string | null;
  pageSize?: number;
  behavior?: ChatBehavior;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialAgentId);
  const selected = useMemo(() => agents.find((agent) => agent.id === selectedId) ?? null, [agents, selectedId]);
  const conversation = selected ? conversations[selected.id] ?? { agentId: selected.id, messages: [], tasks: [], artifacts: [], suggestions: ["¿Qué puedes hacer por mí?"] } : null;

  if (agents.length === 0) return <div className="flex h-dvh"><EmptyTeam /></div>;

  return (
    <div className="flex h-dvh min-h-0">
      <Roster pageSize={pageSize} agents={agents} selectedId={selectedId} onSelect={setSelectedId} className={cn("w-full lg:w-80 lg:shrink-0", selected ? "max-lg:hidden" : "")} />
      {selected && conversation ? (
        <Conversation key={selected.id} agent={selected} conversation={conversation} onBack={() => setSelectedId(null)} agents={agents} onSwitch={setSelectedId} behavior={behavior} />
      ) : (
        <NoSelection />
      )}
    </div>
  );
}
