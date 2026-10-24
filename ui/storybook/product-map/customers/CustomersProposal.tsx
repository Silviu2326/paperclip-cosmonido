import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
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
  Table2,
  LayoutGrid,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import { euros, type DemoContact, type DemoCustomer } from "./demo-data";
import { CustomerDetailPage, PersonDetailPage, type ActionHandler } from "./CustomerDetail";
import { CustomersTable, PeopleTable, ServicesDialog, nextSort, sortCustomers, type SortKey, type SortState } from "./CustomersTables";
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

type View = "customers" | "people";
type Layout = "table" | "cards";
export type CustomersRoute = { page: "list" } | { page: "customer"; id: string } | { page: "person"; id: string; customerId: string };
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
export function Stat({ label, value, unit, hint, color, icon: Icon, index, onOpen, openLabel }: { label: string; value: string; unit?: string; hint: string; color: string; icon: typeof Users; index: number; onOpen?: () => void; openLabel?: string }) {
  const tokens = useMotionTokens();
  const Card = onOpen ? motion.button : motion.div;
  return (
    <Card
      {...(onOpen ? { type: "button" as const, onClick: onOpen, "aria-label": `${openLabel ?? label}: ${value}${unit ? ` ${unit}` : ""}` } : {})}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left",
        onOpen && "cursor-pointer transition-shadow duration-(--motion-duration-fast) hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
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
      {onOpen ? <ArrowUpRight aria-hidden="true" className="absolute right-3.5 top-3.5 h-4 w-4 text-muted-foreground opacity-60 transition-[opacity,transform] duration-(--motion-duration-fast) group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" /> : null}
    </Card>
  );
}

function ViewSwitch({ view, onChange, counts }: { view: View; onChange: (view: View) => void; counts: Record<View, number> }) {
  const tokens = useMotionTokens();
  const options: { id: View; label: string; icon: typeof Users }[] = [
    { id: "customers", label: "Clientes", icon: Building2 },
    { id: "people", label: "Personas", icon: User },
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

export function PanelSection({ title, icon: Icon, color, children }: { title: string; icon: typeof Users; color: string; children: ReactNode }) {
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
export function CustomersProposal({ customers: initialCustomers, initialQuery = "", initialFilter = "all", initialRoute = { page: "list" }, pageSize, canCreate = true }: {
  customers: DemoCustomer[];
  initialQuery?: string;
  initialFilter?: Filter;
  /** Where the page opens: the list, a customer's page or a person's page. */
  initialRoute?: CustomersRoute;
  /** When set, the list shows this many customers and a "load more" button. */
  pageSize?: number;
  /** Members without permission see the page read-only. */
  canCreate?: boolean;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [route, setRoute] = useState<CustomersRoute>(initialRoute);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [view, setView] = useState<View>("customers");
  const [layout, setLayout] = useState<Layout>("table");
  const [sort, setSort] = useState<SortState>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
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
  const page = useLoadMore(layout === "table" ? sortCustomers(visibleCustomers, sort) : visibleCustomers, pageSize);
  const visiblePeople = people.filter(({ person, customer }) => !needle || `${person.name} ${person.email ?? ""} ${customer.name}`.toLowerCase().includes(needle));
  const filterOptions: readonly (readonly [Filter, string, string | null])[] = [
    ["all", "Todos", null],
    ["attention", "Atención", YELLOW],
    ["new", "Nuevos", SKY],
    ...(archivedCount ? [["archived", `Archivados · ${archivedCount}`, null] as const] : []),
  ];

  const flash = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };
  const goList = (next: View = "customers") => { setView(next); setRoute({ page: "list" }); };
  const openCustomer = (id: string) => setRoute({ page: "customer", id });
  const openPerson = (personId: string, customerId: string) => setRoute({ page: "person", id: personId, customerId });
  const restore = (id: string) => { setCustomers((current) => current.map((customer) => (customer.id === id ? { ...customer, archived: false } : customer))); flash("Cliente restaurado"); };
  // In the real app these open the conversation, task or proposal composer; here they only say what would happen.
  const act: ActionHandler = (action, customer, person) => {
    const who = person?.name ?? customer.name;
    flash(action === "message" ? `Se abriría una conversación con ${who}` : action === "task" ? `Se abriría una tarea nueva para ${who}` : `Se abriría una propuesta nueva para ${customer.name}`);
  };

  const routeCustomer = route.page === "list" ? undefined : customers.find((customer) => customer.id === (route.page === "customer" ? route.id : route.customerId));
  const routePerson = route.page === "person" ? routeCustomer?.contacts.find((person) => person.id === route.id) : undefined;

  const list = (
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
          setFilter("all");
          setQuery("");
          openCustomer(customer.id);
          flash(`${customer.name} creado. Ya puedes añadir servicios, propuestas o tareas.`);
        }}
        onOpenExisting={(id) => { setFilter("all"); setQuery(""); openCustomer(id); }}
      />

      {customers.length === 0 ? <EmptyState onCreate={() => setCreateOpen(true)} /> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat index={0} label="Ingresos recurrentes" value={euros(monthly)} unit="/mes" hint={`${services.length} servicios activos`} color={MINT} icon={Repeat} onOpen={() => setServicesOpen(true)} openLabel="Ver servicios recurrentes" />
          <Stat index={1} label="Propuestas abiertas" value={euros(proposals.reduce((sum, proposal) => sum + proposal.amountCents, 0))} hint={`${proposals.length} en curso`} color={SKY} icon={FileText} />
          <Stat index={2} label="Necesitan atención" value={String(attention.length)} unit={`de ${active.length} clientes`} hint="Salud baja o sin responder" color={YELLOW} icon={AlertTriangle} />
          <Stat index={3} label="Trabajo en curso" value={String(tasks)} unit={tasks === 1 ? "tarea" : "tareas"} hint="Abiertas para clientes" color={LILAC} icon={CheckCircle2} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LayoutGroup id="customers-view"><ViewSwitch view={view} onChange={setView} counts={{ customers: active.length, people: people.length }} /></LayoutGroup>
          <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors duration-(--motion-duration-fast) focus-within:border-foreground/30">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input aria-label="Buscar" className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar por nombre, web o etiqueta" value={query} onChange={(event) => setQuery(event.target.value)} />
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
          <div className="ml-auto flex items-center gap-2">
            {view === "customers" ? (
              <div role="group" aria-label="Forma de la lista" className="inline-flex rounded-xl border border-border bg-muted/40 p-1 max-md:hidden">
                {([["table", "Tabla", Table2], ["cards", "Tarjetas", LayoutGrid]] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    aria-pressed={layout === id}
                    aria-label={`Ver como ${label.toLowerCase()}`}
                    title={label}
                    onClick={() => setLayout(id)}
                    className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-(--motion-duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", layout === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <ServicesDialog open={servicesOpen} onOpenChange={setServicesOpen} services={services} monthly={monthly} onOpenCustomer={openCustomer} />

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
              visibleCustomers.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: tint(SKY, 22), color: readable(SKY) }}><Search className="h-6 w-6" /></span>
                  <p className="font-medium">{query ? `Ningún cliente coincide con «${query}»` : "No hay clientes en este filtro"}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">Prueba con otro nombre, con la web o con una etiqueta.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>Limpiar búsqueda</Button>
                    {canCreate && query ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Crear «{query}»</Button> : null}
                  </div>
                </div>
              ) : <>
                {layout === "table" ? (
                  <div className="hidden md:block">
                    <CustomersTable customers={page.visible} sort={sort} onSort={(key: SortKey) => setSort((current) => nextSort(current, key))} onOpen={openCustomer} onAction={act} onRestore={restore} canAct={canCreate} />
                  </div>
                ) : null}
                {/* Cards: the chosen layout, and the phone fallback when the table is chosen. */}
                <div className={cn("flex flex-col gap-3", layout === "table" && "md:hidden")}>
                  <AnimatePresence>
                    {page.visible.map((customer, index) => (
                      <CustomerRow key={customer.id} customer={customer} index={Math.min(index, 12)} selected={false} onSelect={() => openCustomer(customer.id)} />
                    ))}
                  </AnimatePresence>
                </div>
                <LoadMoreButton remaining={page.remaining} onClick={page.more} noun="clientes" />
              </>
            ) : visiblePeople.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Ninguna persona coincide con «{query}».</p>
            ) : (
              <PeopleTable people={visiblePeople} onOpenPerson={openPerson} onOpenCustomer={openCustomer} onAction={act} canAct={canCreate} />
            )}
          </motion.div>
        </AnimatePresence>
      </>}
    </div>
  );

  return (
    <div>
      {route.page === "customer" && routeCustomer ? (
        <CustomerDetailPage customer={routeCustomer} onBack={() => goList("customers")} onOpenPerson={(personId) => openPerson(personId, routeCustomer.id)} onAction={act} onRestore={() => restore(routeCustomer.id)} canAct={canCreate} />
      ) : route.page === "person" && routeCustomer && routePerson ? (
        <PersonDetailPage person={routePerson} customer={routeCustomer} onBackToList={() => goList("people")} onOpenCustomer={() => openCustomer(routeCustomer.id)} onOpenPerson={(personId) => openPerson(personId, routeCustomer.id)} onAction={act} canAct={canCreate} />
      ) : list}
      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-popover px-4 py-2.5 text-sm shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(MINT) }} />
            <span>{toast}</span>
            <span className="text-xs text-muted-foreground">(demo)</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
