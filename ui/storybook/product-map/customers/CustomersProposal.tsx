import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileText,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Star,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { euros, type DemoContact, type DemoCustomer } from "./demo-data";
import { NewCustomerDialog } from "./NewCustomerDialog";
import { LoadMoreButton, useLoadMore } from "./scenario-parts";

const ACCENT_MUTED = "var(--muted-foreground)";
const MINT = BRAND(8);
const SKY = BRAND(7);
const YELLOW = BRAND(10);
const LILAC = BRAND(2);
const RISK = "var(--destructive)";

export const HEALTH: Record<DemoCustomer["health"], { label: string; color: string }> = {
  good: { label: "Bien", color: MINT },
  watch: { label: "Vigilar", color: YELLOW },
  risk: { label: "En riesgo", color: RISK },
};

type View = "customers" | "people" | "services";
export type Filter = "all" | "attention" | "new" | "archived";

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Stable brand gradient per customer, like agent capsules. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const index = ([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10) + 1;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold",
        size === "sm" && "h-7 w-7 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg",
      )}
      style={{ background: `linear-gradient(135deg, ${BRAND(index, "a")}, ${BRAND(index, "b")})`, color: "white" }}
    >
      {initials(name)}
    </span>
  );
}

export function Pill({ color, children, strong = false }: { color: string; children: ReactNode; strong?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={strong ? { background: color, color: ink(color) } : { background: tint(color, 18), color: readable(color) }}
    >
      {children}
    </span>
  );
}

/** Summary card: accent-tinted border and glow, a small colour tab on top, and the unit set apart from the number. */
export function Stat({ label, value, unit, hint, color, icon: Icon, index }: { label: string; value: string; unit?: string; hint: string; color: string; icon: typeof Users; index: number }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${color} 30%, var(--border))`,
        background: `radial-gradient(120% 130% at 0% 0%, ${tint(color, 13)}, transparent 55%), var(--card)`,
      }}
    >
      <span aria-hidden="true" className="absolute left-4 top-0 h-0.5 w-8 rounded-b-full" style={{ background: color }} />
      <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `linear-gradient(135deg, ${tint(color, 34)}, ${tint(color, 16)})`, boxShadow: `inset 0 0 0 1px ${tint(color, 32)}`, color: readable(color) }}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        {unit && value !== "—" ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </motion.div>
  );
}

function ViewSwitch({ view, onChange, counts }: { view: View; onChange: (view: View) => void; counts: Record<View, number> }) {
  const tokens = useMotionTokens();
  const options: { id: View; label: string; icon: typeof Users }[] = [
    { id: "customers", label: "Clientes", icon: Building2 },
    { id: "people", label: "Personas", icon: User },
    { id: "services", label: "Servicios", icon: Repeat },
  ];
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
      {options.map((option) => {
        const active = view === option.id;
        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-(--motion-duration-fast)",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="customers-view-pill"
                className="absolute inset-0 rounded-lg bg-background shadow-sm"
                transition={{ duration: tokens.base, ease: tokens.easeOut }}
              />
            ) : null}
            <option.icon className="relative h-3.5 w-3.5" />
            <span className="relative">{option.label}</span>
            <span className="relative text-xs text-muted-foreground tabular-nums">{counts[option.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ChannelIcon({ channel }: { channel: DemoContact["channel"] }) {
  const Icon = channel === "whatsapp" ? MessageCircle : channel === "phone" ? Phone : Mail;
  return <Icon className="h-3.5 w-3.5" aria-label={channel} />;
}

export function CustomerRow({ customer, index, selected, onSelect }: { customer: DemoCustomer; index: number; selected: boolean; onSelect: () => void }) {
  const tokens = useMotionTokens();
  const health = HEALTH[customer.health];
  const primary = customer.contacts.find((person) => person.primary) ?? customer.contacts[0];
  const monthly = customer.services.reduce((sum, service) => sum + service.monthlyCents, 0);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      onClick={onSelect}
      className={cn(
        "group relative flex w-full flex-col gap-3 rounded-xl border p-4 text-left",
        "transition-[border-color,box-shadow,transform] duration-(--motion-duration-fast) ease-(--motion-ease-out-expo)",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-transparent shadow-md" : "border-border",
        customer.archived && "opacity-70",
      )}
      style={{ boxShadow: selected ? `0 0 0 2px ${health.color}` : "0 0 0 0px transparent" }}
    >
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: health.color }} />
      <div className="flex items-start gap-3">
        <Avatar name={customer.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="max-w-full truncate font-semibold">{customer.name}</span>
            {customer.archived ? <Pill color={ACCENT_MUTED}>Archivado</Pill> : <Pill color={health.color}>{health.label}</Pill>}
            {customer.unreadConversations ? (
              <Pill color={SKY} strong><MessagesSquare className="h-3 w-3" />{customer.unreadConversations}</Pill>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[customer.domain ?? (customer.kind === "person" ? "Persona" : "Sin web"), ...customer.tags].join(" · ")}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <span className="flex items-center gap-1.5 text-muted-foreground"><User className="h-3.5 w-3.5" />{primary?.name ?? "Sin contacto"}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><Repeat className="h-3.5 w-3.5" />{monthly ? `${euros(monthly)}/mes` : "Sin servicios"}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><CircleDot className="h-3.5 w-3.5" />{customer.activeTasks} {customer.activeTasks === 1 ? "tarea" : "tareas"}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" />{customer.openProposals.length} {customer.openProposals.length === 1 ? "propuesta" : "propuestas"}</span>
      </div>
      {customer.nextAction ? (
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: tint(health.color, 12) }}>
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: readable(health.color) }} />
          <span className="truncate">{customer.nextAction}</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{customer.lastActivityLabel}</p>
      )}
    </motion.button>
  );
}

function PanelSection({ title, icon: Icon, color, children }: { title: string; icon: typeof Users; color: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CustomerPanel({ customer, onClose }: { customer: DemoCustomer; onClose: () => void }) {
  const tokens = useMotionTokens();
  const health = HEALTH[customer.health];
  return (
    <motion.aside
      key={customer.id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-background p-5 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <Avatar name={customer.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{customer.name}</h2>
          <p className="text-xs text-muted-foreground">{customer.domain ?? (customer.kind === "person" ? "Persona" : "Sin web")} · cliente desde {new Date(customer.createdAt).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill color={health.color} strong>{health.label}</Pill>
            <Pill color={LILAC}>{customer.owner}</Pill>
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {customer.archived ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="text-muted-foreground">Archivado: no aparece en la lista activa.</span>
          <Button size="sm" variant="outline">Restaurar</Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Tarea</Button>
          <Button size="sm" variant="outline"><MessageCircle className="h-3.5 w-3.5" />Escribir</Button>
          <Button size="sm" variant="outline"><FileText className="h-3.5 w-3.5" />Propuesta</Button>
        </div>
      )}

      {customer.nextAction ? (
        <div className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: `linear-gradient(135deg, ${tint(health.color, 22)}, ${tint(health.color, 6)})` }}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(health.color) }} />
          <div><p className="font-medium">Próximo paso</p><p className="text-muted-foreground">{customer.nextAction}</p></div>
        </div>
      ) : null}

      <PanelSection title="Personas" icon={Users} color={SKY}>
        {customer.contacts.length === 0 ? <p className="text-sm text-muted-foreground">Sin personas todavía.</p> : null}
        {customer.contacts.map((person) => (
          <div key={person.id} className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors duration-(--motion-duration-fast) hover:bg-accent/60">
            <Avatar name={person.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm">{person.name}{person.primary ? <Star className="h-3 w-3 fill-current" style={{ color: YELLOW }} /> : null}</p>
              <p className="truncate text-xs text-muted-foreground">{person.title ?? person.email}</p>
            </div>
            <span className="text-muted-foreground"><ChannelIcon channel={person.channel} /></span>
          </div>
        ))}
      </PanelSection>

      <PanelSection title="Servicios" icon={Repeat} color={MINT}>
        {customer.services.length ? customer.services.map((service) => (
          <div key={service.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
            <div className="min-w-0"><p className="truncate">{service.name}</p><p className="text-xs text-muted-foreground">Renueva {new Date(service.nextRenewal).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p></div>
            <div className="text-right"><p className="font-semibold tabular-nums">{euros(service.monthlyCents)}</p>
              {service.status !== "active" ? <Pill color={service.status === "paused" ? RISK : YELLOW}>{service.status === "paused" ? "En pausa" : "Renovando"}</Pill> : null}</div>
          </div>
        )) : <p className="text-sm text-muted-foreground">Sin servicios recurrentes.</p>}
      </PanelSection>

      <PanelSection title="Propuestas abiertas" icon={FileText} color={SKY}>
        {customer.openProposals.length ? customer.openProposals.map((proposal) => (
          <div key={proposal.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{proposal.title}</span>
            <span className="flex items-center gap-2"><Pill color={proposal.status === "viewed" ? MINT : SKY}>{proposal.status === "viewed" ? "Vista" : proposal.status === "sent" ? "Enviada" : "Borrador"}</Pill><span className="tabular-nums">{euros(proposal.amountCents)}</span></span>
          </div>
        )) : <p className="text-sm text-muted-foreground">Ninguna propuesta abierta.</p>}
      </PanelSection>

      <PanelSection title="Trabajo" icon={CheckCircle2} color={LILAC}>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Tareas", customer.activeTasks], ["Revisiones", customer.pendingReviews], ["Sin leer", customer.unreadConversations]].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-border p-2"><p className="text-lg font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{customer.lastActivityLabel}</p>
      </PanelSection>
    </motion.aside>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const tokens = useMotionTokens();
  const steps = [
    { icon: Plus, title: "Crea tu primer cliente", text: "Empresa o persona para la que trabajas.", color: MINT },
    { icon: Upload, title: "Importa tus contactos", text: "Desde un CSV; detectamos duplicados.", color: SKY },
    { icon: MessagesSquare, title: "Conecta un canal", text: "WhatsApp, email o chat web.", color: LILAC },
  ];
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: ink(SKY) }}
      >
        <Users className="h-7 w-7" />
      </motion.div>
      <div><h2 className="text-lg font-semibold">Aquí vivirán tus clientes</h2><p className="text-sm text-muted-foreground">Con su gente, sus servicios y todo el trabajo que haces para ellos.</p></div>
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger * 2 }}
            className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left"
            style={{ background: `linear-gradient(135deg, ${tint(step.color, 14)}, transparent 70%)` }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: tint(step.color, 30), color: readable(step.color) }}><step.icon className="h-4 w-4" /></span>
            <p className="text-sm font-medium">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.text}</p>
          </motion.div>
        ))}
      </div>
      <Button onClick={onCreate}><Plus className="h-4 w-4" />Nuevo cliente</Button>
    </div>
  );
}

/** One customers page: summary, a single list with three views, and a side panel with everything about a customer. */
export function CustomersProposal({ customers: initialCustomers, initialQuery = "", initialFilter = "all", pageSize, canCreate = true }: {
  customers: DemoCustomer[];
  initialQuery?: string;
  initialFilter?: Filter;
  /** When set, the list shows this many customers and a "load more" button. */
  pageSize?: number;
  /** Members without permission see the page read-only. */
  canCreate?: boolean;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [createOpen, setCreateOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [view, setView] = useState<View>("customers");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(initialCustomers[0]?.id ?? null);
  const tokens = useMotionTokens();

  const active = useMemo(() => customers.filter((customer) => !customer.archived), [customers]);
  const archivedCount = customers.length - active.length;
  const people = useMemo(() => active.flatMap((customer) => customer.contacts.map((person) => ({ person, customer }))), [customers]);
  const services = useMemo(() => active.flatMap((customer) => customer.services.map((service) => ({ service, customer }))), [customers]);
  const monthly = services.reduce((sum, { service }) => sum + (service.status === "paused" ? 0 : service.monthlyCents), 0);
  const proposals = active.flatMap((customer) => customer.openProposals);
  const attention = active.filter((customer) => customer.health !== "good" || customer.unreadConversations > 0);
  const tasks = active.reduce((sum, customer) => sum + customer.activeTasks, 0);
  const needle = query.trim().toLowerCase();
  const visibleCustomers = customers
    .filter((customer) => filter === "archived" ? customer.archived : !customer.archived)
    .filter((customer) => filter === "all" || filter === "archived" || (filter === "attention" ? attention.includes(customer) : new Date(customer.createdAt) > new Date("2026-08-01")))
    .filter((customer) => !needle || `${customer.name} ${customer.domain ?? ""} ${customer.tags.join(" ")}`.toLowerCase().includes(needle));
  const page = useLoadMore(visibleCustomers, pageSize);
  const filterOptions: readonly (readonly [Filter, string, string | null])[] = [
    ["all", "Todos", null],
    ["attention", "Atención", YELLOW],
    ["new", "Nuevos", SKY],
    ...(archivedCount ? [["archived", `Archivados · ${archivedCount}`, null] as const] : []),
  ];
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          {customers.length ? <p className="text-sm text-muted-foreground">{active.length} clientes · {people.length} personas · {euros(monthly)}/mes en servicios</p> : null}
        </div>
        <div className="flex gap-2">
          {canCreate ? <>
            <Button variant="outline"><Upload className="h-4 w-4" />Importar contactos</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Nuevo cliente</Button>
          </> : null}
        </div>
      </header>

      <NewCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existing={customers}
        onCreate={(customer) => {
          setCustomers((current) => [customer, ...current]);
          setView("customers");
          setFilter("all");
          setQuery("");
          setSelectedId(customer.id);
          setJustCreated(customer.name);
          window.setTimeout(() => setJustCreated(null), 3500);
        }}
        onOpenExisting={(id) => { setView("customers"); setFilter("all"); setQuery(""); setSelectedId(id); }}
      />

      <AnimatePresence>
        {justCreated ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
            style={{ background: tint(MINT, 24) }}
          >
            <CheckCircle2 className="h-4 w-4" style={{ color: readable(MINT) }} />
            <span><strong>{justCreated}</strong> creado. Ya puedes añadir servicios, propuestas o tareas desde su panel.</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {customers.length === 0 ? <EmptyState onCreate={() => setCreateOpen(true)} /> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat index={0} label="Ingresos recurrentes" value={euros(monthly)} unit="/mes" hint={`${services.length} servicios activos`} color={MINT} icon={Repeat} />
          <Stat index={1} label="Propuestas abiertas" value={euros(proposals.reduce((sum, proposal) => sum + proposal.amountCents, 0))} hint={`${proposals.length} en curso`} color={SKY} icon={FileText} />
          <Stat index={2} label="Necesitan atención" value={String(attention.length)} unit={`de ${active.length} clientes`} hint="Salud baja o sin responder" color={YELLOW} icon={AlertTriangle} />
          <Stat index={3} label="Trabajo en curso" value={String(tasks)} unit={tasks === 1 ? "tarea" : "tareas"} hint="Abiertas para clientes" color={LILAC} icon={CheckCircle2} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LayoutGroup id="customers-view"><ViewSwitch view={view} onChange={setView} counts={{ customers: active.length, people: people.length, services: services.length }} /></LayoutGroup>
          <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar por nombre, web o etiqueta" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {view === "customers" ? (
            <div className="flex gap-1.5">
              {filterOptions.map(([id, label, color]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", filter === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                  style={filter === id ? { background: color ? tint(color, 30) : "var(--accent)" } : undefined}
                >
                  {label}{id === "attention" ? ` · ${attention.length}` : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={cn("grid grid-cols-1 gap-6", selected && view === "customers" ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: tokens.fast, ease: tokens.standard }}
              className="flex min-w-0 flex-col gap-3"
            >
              {view === "customers" ? (
                <AnimatePresence>
                  {page.visible.map((customer, index) => (
                    <CustomerRow key={customer.id} customer={customer} index={Math.min(index, 12)} selected={customer.id === selectedId} onSelect={() => setSelectedId(customer.id === selectedId ? null : customer.id)} />
                  ))}
                  {visibleCustomers.length === 0 ? (
                    <div key="empty" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: tint(SKY, 22), color: readable(SKY) }}><Search className="h-6 w-6" /></span>
                      <p className="font-medium">{query ? `Ningún cliente coincide con «${query}»` : "No hay clientes en este filtro"}</p>
                      <p className="max-w-sm text-sm text-muted-foreground">Prueba con otro nombre, con la web o con una etiqueta.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>Limpiar búsqueda</Button>
                        {canCreate && query ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Crear «{query}»</Button> : null}
                      </div>
                    </div>
                  ) : null}
                  <LoadMoreButton key="more" remaining={page.remaining} onClick={page.more} noun="clientes" />
                </AnimatePresence>
              ) : view === "people" ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {people.filter(({ person, customer }) => !needle || `${person.name} ${person.email ?? ""} ${customer.name}`.toLowerCase().includes(needle)).map(({ person, customer }) => (
                    <button key={person.id} onClick={() => { setSelectedId(customer.id); setView("customers"); }} className="flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50">
                      <Avatar name={person.name} size="sm" />
                      <div className="min-w-0 flex-1"><p className="flex items-center gap-1 text-sm font-medium">{person.name}{person.primary ? <Star className="h-3 w-3 fill-current" style={{ color: YELLOW }} /> : null}</p><p className="truncate text-xs text-muted-foreground">{person.title ?? "Sin cargo"} · {person.email ?? person.phone}</p></div>
                      <Pill color={HEALTH[customer.health].color}>{customer.name}</Pill>
                      <span className="text-muted-foreground"><ChannelIcon channel={person.channel} /></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {services.filter(({ service, customer }) => !needle || `${service.name} ${customer.name}`.toLowerCase().includes(needle)).map(({ service, customer }) => (
                    <button key={service.id} onClick={() => { setSelectedId(customer.id); setView("customers"); }} className="flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: tint(MINT, 25), color: readable(MINT) }}><Repeat className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{service.name}</p><p className="text-xs text-muted-foreground">{customer.name} · renueva {new Date(service.nextRenewal).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p></div>
                      {service.status !== "active" ? <Pill color={service.status === "paused" ? RISK : YELLOW}>{service.status === "paused" ? "En pausa" : "Renovando"}</Pill> : null}
                      <span className="w-20 text-right font-semibold tabular-nums">{euros(service.monthlyCents)}</span>
                    </button>
                  ))}
                  <div className="flex justify-between p-3 text-sm font-semibold"><span>Total mensual</span><span className="tabular-nums">{euros(monthly)}</span></div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {selected && view === "customers" ? (
              <div key={selected.id} className="lg:sticky lg:top-4 lg:self-start">
                <CustomerPanel customer={selected} onClose={() => setSelectedId(null)} />
              </div>
            ) : null}
          </AnimatePresence>
        </div>
      </>}
    </div>
  );
}
