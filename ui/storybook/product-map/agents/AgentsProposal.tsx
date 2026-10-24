import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  Check,
  CircleHelp,
  CircleCheck,
  Lock,
  LayoutGrid,
  List,
  MessageCircle,
  Network,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Pill, Progress, Stat } from "../parts";
import { AUTONOMY_LABEL, ROLE_TEMPLATES, type Autonomy, type RoleTemplate, type TeamAgent, type TeamStatus } from "./demo-data";

const STATUS: Record<TeamStatus, { label: string; color: string }> = {
  running: { label: "Trabajando", color: ACCENT.mint },
  idle: { label: "Libre", color: ACCENT.muted },
  paused: { label: "En pausa", color: ACCENT.yellow },
  error: { label: "Con un problema", color: ACCENT.risk },
};

const euros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

function AgentAvatar({ agent, size = "md", live = false }: { agent: Pick<TeamAgent, "name" | "accent" | "status">; size?: "sm" | "md" | "lg"; live?: boolean }) {
  const tokens = useMotionTokens();
  const ring = live && agent.status === "running";
  return (
    <span className="relative flex shrink-0">
      {ring && tokens.base > 0 ? (
        <motion.span aria-hidden="true" className="absolute inset-0 rounded-xl" style={{ background: ACCENT.mint }} animate={{ scale: [1, 1.35], opacity: [0.5, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
      ) : null}
      <span
        aria-hidden="true"
        className={cn("relative flex items-center justify-center rounded-xl font-semibold", size === "sm" && "h-8 w-8 text-xs", size === "md" && "h-11 w-11 text-sm", size === "lg" && "h-14 w-14 text-lg")}
        style={{ background: `linear-gradient(135deg, ${BRAND(agent.accent, "a")}, ${BRAND(agent.accent, "b")})`, color: "white", filter: agent.status === "paused" ? "grayscale(0.6)" : undefined }}
      >
        {agent.name.slice(0, 2).toUpperCase()}
      </span>
    </span>
  );
}

function AutonomyBadge({ level }: { level: Autonomy }) {
  const icon = level === "autonomous" ? Zap : level === "supervised" ? ShieldCheck : Lock;
  const Icon = icon;
  const color = level === "autonomous" ? ACCENT.turquoise : level === "supervised" ? ACCENT.sky : ACCENT.lilac;
  return <Pill color={color}><Icon className="h-3 w-3" />{AUTONOMY_LABEL[level].label}</Pill>;
}

function AgentCard({ agent, index, selected, onSelect }: { agent: TeamAgent; index: number; selected: boolean; onSelect: () => void }) {
  const tokens = useMotionTokens();
  const status = STATUS[agent.status];
  const budgetPercent = (agent.spentCents / agent.budgetCents) * 100;
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      onClick={onSelect}
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left",
        "transition-[border-color,box-shadow,transform] duration-(--motion-duration-fast) ease-(--motion-ease-out-expo)",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-transparent shadow-md" : "border-border",
      )}
      style={{ boxShadow: selected ? `0 0 0 2px ${status.color}` : "0 0 0 0px transparent" }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16" style={{ background: `linear-gradient(180deg, ${tint(BRAND(agent.accent, "a"), 16)}, transparent)` }} />
      <div className="relative flex items-start gap-3">
        <AgentAvatar agent={agent} live />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <Pill color={status.color}>{status.label}</Pill>
      </div>
      <div className="relative min-h-10">
        <p className="text-xs" style={{ color: agent.status === "error" ? readable(ACCENT.risk) : "var(--muted-foreground)" }}>{agent.task ?? (agent.status === "paused" ? "Pausada: no recibe tareas" : "Sin tareas ahora")}</p>
        {agent.status === "running" ? <div className="mt-1.5"><Progress value={agent.progress} color={status.color} /></div> : null}
      </div>
      <div className="relative grid grid-cols-3 gap-2 text-center">
        {([["Abiertas", agent.openTasks], ["Esta semana", agent.doneThisWeek]] as const).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border px-1 py-1.5"><p className="text-base font-semibold tabular-nums">{value}</p><p className="truncate text-xs text-muted-foreground">{label}</p></div>
        ))}
        <div className="rounded-lg border border-border px-1 py-1.5"><p className="text-base font-semibold tabular-nums">{euros(agent.spentCents)}</p><p className="truncate text-xs text-muted-foreground">de {euros(agent.budgetCents)}</p></div>
      </div>
      <div className="relative flex items-center justify-between gap-2">
        <AutonomyBadge level={agent.autonomy} />
        {budgetPercent > 85 ? <Pill color={ACCENT.yellow}><Wallet className="h-3 w-3" />Presupuesto al {Math.round(budgetPercent)} %</Pill> : null}
      </div>
    </motion.button>
  );
}

function AgentRow({ agent, selected, onSelect }: { agent: TeamAgent; selected: boolean; onSelect: () => void }) {
  const status = STATUS[agent.status];
  return (
    <button onClick={onSelect} className={cn("flex w-full min-w-0 items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50", selected && "bg-accent/60")}>
      <AgentAvatar agent={agent} size="sm" live />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{agent.name} <span className="font-normal text-muted-foreground">· {agent.role}</span></p><p className="truncate text-xs text-muted-foreground">{agent.task ?? "Sin tareas ahora"}</p></div>
      <span className="hidden w-16 text-right text-sm tabular-nums sm:block">{agent.openTasks} abiertas</span>
      <span className="hidden w-20 text-right text-sm tabular-nums md:block">{euros(agent.spentCents)}</span>
      <Pill color={status.color}>{status.label}</Pill>
    </button>
  );
}

function OrgNode({ agent, agents, depth, onSelect, selectedId }: { agent: TeamAgent; agents: TeamAgent[]; depth: number; onSelect: (id: string) => void; selectedId: string | null }) {
  const children = agents.filter((candidate) => candidate.reportsTo === agent.id);
  const status = STATUS[agent.status];
  return (
    <li className="relative flex flex-col items-center gap-3 before:absolute before:-top-3 before:left-1/2 before:h-3 before:w-px before:bg-border">
      <button onClick={() => onSelect(agent.id)} className={cn("flex min-w-36 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left shadow-sm transition-shadow duration-(--motion-duration-fast) hover:shadow-md", selectedId === agent.id ? "border-transparent" : "border-border")} style={selectedId === agent.id ? { boxShadow: `0 0 0 2px ${status.color}` } : undefined}>
        <AgentAvatar agent={agent} size="sm" />
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{agent.name}</span><span className="block truncate text-xs text-muted-foreground">{agent.role}</span></span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: status.color }} />
      </button>
      {children.length ? (
        <ul className="relative flex gap-4 border-t border-border pt-3 before:absolute before:-top-3 before:left-1/2 before:h-3 before:w-px before:bg-border">
          {children.map((child) => <OrgNode key={child.id} agent={child} agents={agents} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />)}
        </ul>
      ) : null}
    </li>
  );
}

function OrgChart({ agents, onSelect, selectedId }: { agents: TeamAgent[]; onSelect: (id: string) => void; selectedId: string | null }) {
  const roots = agents.filter((agent) => !agent.reportsTo);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border p-6">
      <div className="mx-auto flex w-max flex-col items-center gap-3">
        <span className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT.turquoise}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><Users className="h-4 w-4" />Silviu · tú</span>
        <ul className="relative flex gap-6 border-t border-border pt-3 before:absolute before:-top-3 before:left-1/2 before:h-3 before:w-px before:bg-border">
          {roots.map((agent) => <OrgNode key={agent.id} agent={agent} agents={agents} depth={0} onSelect={onSelect} selectedId={selectedId} />)}
        </ul>
      </div>
    </div>
  );
}

const ACTIVITY_ICON = { done: { icon: CircleCheck, color: ACCENT.mint }, started: { icon: Play, color: ACCENT.sky }, question: { icon: CircleHelp, color: ACCENT.yellow }, error: { icon: AlertTriangle, color: ACCENT.risk } } as const;

function AgentPanel({ agent, onClose, onAutonomy, onTogglePause }: { agent: TeamAgent; onClose: () => void; onAutonomy: (level: Autonomy) => void; onTogglePause: () => void }) {
  const tokens = useMotionTokens();
  const status = STATUS[agent.status];
  return (
    <motion.aside initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-background p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="lg" live />
        <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{agent.name}</h2><p className="text-xs text-muted-foreground">{agent.role}</p><div className="mt-2 flex flex-wrap gap-1.5"><Pill color={status.color} strong>{status.label}</Pill></div></div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {agent.problem ? (
        <div className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.risk, 14) }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.risk) }} />
          <div><p className="font-medium">Necesita tu ayuda</p><p className="text-muted-foreground">{agent.problem}</p></div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline"><MessageCircle className="h-3.5 w-3.5" />Hablar</Button>
        <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Tarea</Button>
        <Button size="sm" variant="outline" onClick={onTogglePause}>{agent.status === "paused" ? <><Play className="h-3.5 w-3.5" />Reanudar</> : <><Pause className="h-3.5 w-3.5" />Pausar</>}</Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuánto puede hacer solo</h3>
        <div role="radiogroup" aria-label="Nivel de autonomía" className="flex flex-col gap-1.5">
          {(Object.keys(AUTONOMY_LABEL) as Autonomy[]).map((level) => {
            const active = agent.autonomy === level;
            return (
              <button key={level} role="radio" aria-checked={active} onClick={() => onAutonomy(level)} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors duration-(--motion-duration-fast)", active ? "border-transparent" : "border-border hover:bg-accent/50")} style={active ? { background: tint(ACCENT.turquoise, 20), boxShadow: `inset 0 0 0 1.5px ${ACCENT.turquoise}` } : undefined}>
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current">{active ? <Check className="h-3 w-3" /> : null}</span>
                <span><span className="block text-sm font-medium">{AUTONOMY_LABEL[level].label}</span><span className="block text-xs text-muted-foreground">{AUTONOMY_LABEL[level].hint}</span></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.sky }} />Instrucciones</h3>
        <p className="rounded-xl p-3 text-sm text-muted-foreground" style={{ background: tint(ACCENT.sky, 10) }}>{agent.instructions}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.mint }} />Habilidades</h3>
        <div className="flex flex-wrap gap-1.5">{agent.skills.map((skill) => <Pill key={skill} color={ACCENT.mint}>{skill}</Pill>)}</div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.lilac }} />Permisos</h3>
        {agent.permissions.map((permission) => (
          <p key={permission.label} className="flex items-center gap-2 text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: tint(permission.allowed ? ACCENT.mint : ACCENT.muted, 24), color: readable(permission.allowed ? ACCENT.mint : ACCENT.muted) }}>{permission.allowed ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}</span>
            <span className={permission.allowed ? "" : "text-muted-foreground"}>{permission.label}</span>
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.yellow }} />Actividad reciente</h3>
        {agent.activity.map((item, index) => {
          const style = ACTIVITY_ICON[item.kind];
          return <p key={index} className="flex items-start gap-2 text-sm"><style.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(style.color) }} /><span>{item.text}<span className="block text-xs text-muted-foreground">{item.when}</span></span></p>;
        })}
      </section>
    </motion.aside>
  );
}

function HireDialog({ open, onOpenChange, onHire }: { open: boolean; onOpenChange: (open: boolean) => void; onHire: (agent: TeamAgent) => void }) {
  const tokens = useMotionTokens();
  const [role, setRole] = useState<RoleTemplate | null>(null);
  const [name, setName] = useState("");
  const [autonomy, setAutonomy] = useState<Autonomy>("supervised");
  const [budget, setBudget] = useState("40");

  function reset() { setRole(null); setName(""); setAutonomy("supervised"); setBudget("40"); }
  function choose(template: RoleTemplate) { setRole(template); setBudget(String(template.monthlyEuros)); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!role || !name.trim()) return;
    onHire({
      id: `new-${Date.now()}`, name: name.trim(), role: role.name, accent: role.accent, status: "idle", task: null, progress: 0,
      openTasks: 0, doneThisWeek: 0, spentCents: 0, budgetCents: Math.max(0, Number(budget) || 0) * 100, autonomy, reportsTo: null,
      instructions: `${role.text} Todavía sin instrucciones propias: dime cómo quieres que trabaje.`, skills: role.skills,
      permissions: [{ label: "Leer y crear tareas", allowed: true }, { label: "Escribir a clientes", allowed: false }],
      activity: [{ text: "Contratado ahora", when: "ahora", kind: "started" }],
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-h-screen max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Contratar un agente</DialogTitle>
            <DialogDescription>Elige un puesto. Podrás cambiar sus instrucciones y límites cuando quieras.</DialogDescription>
          </DialogHeader>
          <LayoutGroup id="hire-role">
            <div role="radiogroup" aria-label="Puesto" className="grid gap-2 sm:grid-cols-2">
              {ROLE_TEMPLATES.map((template) => {
                const active = role?.id === template.id;
                return (
                  <button key={template.id} type="button" role="radio" aria-checked={active} onClick={() => choose(template)} className={cn("relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-(--motion-duration-fast)", active ? "border-transparent" : "border-border hover:bg-accent/50")}>
                    {active ? <motion.span layoutId="hire-role-pill" className="absolute inset-0 rounded-xl" style={{ background: tint(BRAND(template.accent, "a"), 18), boxShadow: `inset 0 0 0 1.5px ${BRAND(template.accent, "b")}` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: `linear-gradient(135deg, ${BRAND(template.accent, "a")}, ${BRAND(template.accent, "b")})` }}>{template.name[0]}</span>
                    <span className="relative min-w-0"><span className="block text-sm font-medium">{template.name}</span><span className="block text-xs text-muted-foreground">{template.text}</span><span className="mt-1 block text-xs" style={{ color: readable(ACCENT.mint) }}>~{template.monthlyEuros} €/mes</span></span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
          <AnimatePresence initial={false}>
            {role ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5"><Label htmlFor="hire-name">Nombre</Label><Input id="hire-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Elena" /></div>
                  <div className="flex flex-col gap-1.5"><Label htmlFor="hire-budget">Presupuesto al mes (€)</Label><Input id="hire-budget" type="number" min={0} value={budget} onChange={(event) => setBudget(event.target.value)} /></div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label>Cuánto puede hacer solo</Label>
                    <div className="grid gap-1.5 sm:grid-cols-3">
                      {(Object.keys(AUTONOMY_LABEL) as Autonomy[]).map((level) => (
                        <button key={level} type="button" aria-pressed={autonomy === level} onClick={() => setAutonomy(level)} className={cn("rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-(--motion-duration-fast)", autonomy === level ? "border-transparent font-medium" : "border-border text-muted-foreground")} style={autonomy === level ? { background: tint(ACCENT.turquoise, 22), boxShadow: `inset 0 0 0 1.5px ${ACCENT.turquoise}` } : undefined}>{AUTONOMY_LABEL[level].label}</button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{AUTONOMY_LABEL[autonomy].hint}</p>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
            <Button type="submit" disabled={!role || !name.trim()} style={role && name.trim() ? { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) } : undefined}><Plus className="h-4 w-4" />Contratar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type View = "cards" | "list" | "org";

function EmptyTeam({ onHire }: { onHire: () => void }) {
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}><Users className="h-7 w-7" /></motion.div>
      <div><h2 className="text-lg font-semibold">Tu equipo empieza aquí</h2><p className="text-sm text-muted-foreground">Contrata un agente para que trabaje para ti: cuentas, ventas, contenido…</p></div>
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        {ROLE_TEMPLATES.slice(0, 3).map((template, index) => (
          <motion.button key={template.id} onClick={onHire} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger * 2 }} className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-shadow duration-(--motion-duration-fast) hover:shadow-md" style={{ background: `linear-gradient(135deg, ${tint(BRAND(template.accent, "a"), 16)}, transparent 70%)` }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: `linear-gradient(135deg, ${BRAND(template.accent, "a")}, ${BRAND(template.accent, "b")})` }}>{template.name[0]}</span>
            <p className="text-sm font-medium">{template.name}</p><p className="text-xs text-muted-foreground">{template.text}</p>
          </motion.button>
        ))}
      </div>
      <Button onClick={onHire}><Plus className="h-4 w-4" />Contratar agente</Button>
    </div>
  );
}

/** Agentes: who works for you, what each one is doing now, what it costs, and how far it can act alone. */
export function AgentsProposal({ agents: initial }: { agents: TeamAgent[] }) {
  const tokens = useMotionTokens();
  const [agents, setAgents] = useState(initial);
  const [view, setView] = useState<View>("cards");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TeamStatus>("all");
  const isDesktop = () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches;
  // On a phone the panel sits below the list, so nothing is open until the user taps an agent.
  const [selectedId, setSelectedId] = useState<string | null>(() => (isDesktop() ? initial[0]?.id ?? null : null));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const [hired, setHired] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId && !isDesktop()) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  useEffect(() => {
    if (!hired) return;
    const timer = window.setTimeout(() => setHired(null), 3500);
    return () => window.clearTimeout(timer);
  }, [hired]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => agents.filter((agent) => (filter === "all" || agent.status === filter) && (!needle || `${agent.name} ${agent.role} ${agent.skills.join(" ")}`.toLowerCase().includes(needle))), [agents, filter, needle]);
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const working = agents.filter((agent) => agent.status === "running").length;
  const attention = agents.filter((agent) => agent.status === "error" || agent.spentCents / agent.budgetCents > 0.85).length;
  const spent = agents.reduce((sum, agent) => sum + agent.spentCents, 0);
  const budget = agents.reduce((sum, agent) => sum + agent.budgetCents, 0);
  const update = (id: string, patch: Partial<TeamAgent>) => setAgents((current) => current.map((agent) => agent.id === id ? { ...agent, ...patch } : agent));
  const showPanel = Boolean(selected);

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Equipo</h1>
          {agents.length ? <p className="text-sm text-muted-foreground">{agents.length} agentes · {working} trabajando ahora</p> : null}
        </div>
        <Button onClick={() => setHireOpen(true)}><Plus className="h-4 w-4" />Contratar agente</Button>
      </header>

      <HireDialog open={hireOpen} onOpenChange={setHireOpen} onHire={(agent) => { setAgents((current) => [agent, ...current]); setSelectedId(agent.id); setView("cards"); setFilter("all"); setQuery(""); setHired(agent.name); }} />

      <AnimatePresence>
        {hired ? (
          <motion.div role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: tint(ACCENT.mint, 24) }}>
            <Sparkles className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} /><span><strong>{hired}</strong> se ha unido al equipo. Cuéntale cómo quieres que trabaje.</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {agents.length === 0 ? <EmptyTeam onHire={() => setHireOpen(true)} /> : <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat index={0} label="Trabajando ahora" value={`${working} de ${agents.length}`} hint="Con una tarea en curso" color={ACCENT.mint} icon={Activity} />
          <Stat index={1} label="Gasto del equipo" value={euros(spent)} hint={`de ${euros(budget)} al mes`} color={ACCENT.lilac} icon={Wallet}><div className="mt-1"><Progress value={(spent / Math.max(budget, 1)) * 100} color={ACCENT.lilac} /></div></Stat>
          <Stat index={2} label="Necesitan atención" value={String(attention)} hint="Con un problema o casi sin presupuesto" color={ACCENT.yellow} icon={AlertTriangle} />
          <Stat index={3} label="Hechas esta semana" value={String(agents.reduce((sum, agent) => sum + agent.doneThisWeek, 0))} hint="Tareas cerradas por el equipo" color={ACCENT.turquoise} icon={CircleCheck} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LayoutGroup id="agents-view">
            <div role="tablist" className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
              {([["cards", "Tarjetas", LayoutGrid], ["list", "Lista", List], ["org", "Organigrama", Network]] as const).map(([id, label, Icon]) => (
                <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={cn("relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)", view === id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {view === id ? <motion.span layoutId="agents-view-pill" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                  <Icon className="relative h-3.5 w-3.5" /><span className="relative">{label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar por nombre, puesto o habilidad" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([["all", "Todos", null], ["running", "Trabajando", ACCENT.mint], ["idle", "Libres", ACCENT.muted], ["paused", "En pausa", ACCENT.yellow], ["error", "Con problema", ACCENT.risk]] as const).map(([id, label, color]) => (
              <button key={id} onClick={() => setFilter(id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", filter === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")} style={filter === id ? { background: color ? tint(color, 30) : "var(--accent)" } : undefined}>{label}</button>
            ))}
          </div>
        </div>

        <div className={cn("grid min-w-0 gap-6", showPanel ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="min-w-0">
              {view === "cards" ? (
                visible.length ? <div className={cn("grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2", showPanel ? "xl:grid-cols-2" : "xl:grid-cols-3")}><AnimatePresence>{visible.map((agent, index) => <AgentCard key={agent.id} agent={agent} index={index} selected={agent.id === selectedId} onSelect={() => setSelectedId(agent.id === selectedId ? null : agent.id)} />)}</AnimatePresence></div>
                  : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Ningún agente coincide.</p>
              ) : view === "list" ? (
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{visible.map((agent) => <AgentRow key={agent.id} agent={agent} selected={agent.id === selectedId} onSelect={() => setSelectedId(agent.id === selectedId ? null : agent.id)} />)}</div>
              ) : (
                <OrgChart agents={agents} onSelect={(id) => setSelectedId(id === selectedId ? null : id)} selectedId={selectedId} />
              )}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {selected ? (
              <div key={selected.id} ref={panelRef} className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
                <AgentPanel agent={selected} onClose={() => setSelectedId(null)} onAutonomy={(level) => update(selected.id, { autonomy: level })} onTogglePause={() => update(selected.id, selected.status === "paused" ? { status: "idle" } : { status: "paused", task: null, progress: 0 })} />
              </div>
            ) : null}
          </AnimatePresence>
        </div>
      </>}
    </div>
  );
}

