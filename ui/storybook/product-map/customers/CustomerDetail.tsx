import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, ChevronRight, FileText, Mail, MessageCircle, Phone, Plus, Repeat, Sparkles, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND, readable, tint, useMotionTokens } from "../motion";
import { Avatar, ChannelIcon, HEALTH, PanelSection, Pill } from "./CustomersProposal";
import { euros, type DemoContact, type DemoCustomer } from "./demo-data";

const MINT = BRAND(8);
const SKY = BRAND(7);
const YELLOW = BRAND(10);
const LILAC = BRAND(2);
const RISK = "var(--destructive)";
const MUTED = "var(--muted-foreground)";

export type RowAction = "message" | "task" | "proposal";
/** Fired by every action button. The page decides what to show; in Storybook it is a toast. */
export type ActionHandler = (action: RowAction, customer: DemoCustomer, person?: DemoContact) => void;

const CHANNEL_LABEL: Record<DemoContact["channel"], string> = { email: "Email", whatsapp: "WhatsApp", phone: "Teléfono" };

function Crumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1">
          {index > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
          {item.onClick ? (
            <button onClick={item.onClick} className="rounded transition-colors duration-(--motion-duration-fast) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.label}</button>
          ) : <span aria-current="page" className="max-w-64 truncate text-foreground">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-5", className)}>{children}</section>;
}

function PageShell({ children }: { children: ReactNode }) {
  const tokens = useMotionTokens();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-col gap-6 p-4 sm:p-6">
      {children}
    </motion.div>
  );
}

/** Customer detail page: who they are, their people, services, open proposals and work. Opened from the table. */
export function CustomerDetailPage({ customer, onBack, onOpenPerson, onAction, onRestore, canAct = true }: {
  customer: DemoCustomer;
  onBack: () => void;
  onOpenPerson: (personId: string) => void;
  onAction: ActionHandler;
  onRestore?: () => void;
  /** Read-only members see the page without the action buttons. */
  canAct?: boolean;
}) {
  const health = HEALTH[customer.health];
  const accent = customer.archived ? MUTED : health.color;
  const monthly = customer.services.filter((service) => service.status !== "paused").reduce((sum, service) => sum + service.monthlyCents, 0);
  return (
    <PageShell>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit sm:hidden" onClick={onBack}><ArrowLeft className="h-4 w-4" />Clientes</Button>
        <div className="max-sm:hidden"><Crumbs items={[{ label: "Clientes", onClick: onBack }, { label: customer.name }]} /></div>
      </div>

      <header className="relative flex flex-wrap items-start gap-4 overflow-hidden rounded-2xl border p-5" style={{ borderColor: `color-mix(in oklab, ${accent} 30%, var(--border))`, background: `radial-gradient(120% 140% at 0% 0%, ${tint(accent, 13)}, transparent 55%), var(--card)` }}>
        <span aria-hidden="true" className="absolute left-5 top-0 h-0.5 w-10 rounded-b-full" style={{ background: accent }} />
        <Avatar name={customer.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">{customer.domain ?? (customer.kind === "person" ? "Persona" : "Sin web")} · cliente desde {new Date(customer.createdAt).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {customer.archived ? <Pill color={MUTED}>Archivado</Pill> : <Pill color={health.color} strong>{health.label}</Pill>}
            <Pill color={LILAC}>{customer.owner}</Pill>
            {customer.tags.map((tag) => <Pill key={tag} color={MUTED}>{tag}</Pill>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!canAct ? null : customer.archived ? <Button variant="outline" onClick={onRestore}>Restaurar cliente</Button> : <>
            <Button variant="outline" onClick={() => onAction("message", customer)}><MessageCircle className="h-4 w-4" />Escribir</Button>
            <Button variant="outline" onClick={() => onAction("task", customer)}><Plus className="h-4 w-4" />Tarea</Button>
            <Button onClick={() => onAction("proposal", customer)}><FileText className="h-4 w-4" />Propuesta</Button>
          </>}
        </div>
      </header>

      {customer.nextAction ? (
        <div className="flex items-start gap-3 rounded-2xl p-4 text-sm" style={{ background: `linear-gradient(135deg, ${tint(accent, 20)}, ${tint(accent, 6)})` }}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(accent) }} />
          <div><p className="font-medium">Próximo paso</p><p className="text-muted-foreground">{customer.nextAction}</p></div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <PanelSection title={`Personas · ${customer.contacts.length}`} icon={Users} color={SKY}>
              {customer.contacts.length === 0 ? <p className="text-sm text-muted-foreground">Sin personas todavía.</p> : (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {customer.contacts.map((person) => (
                    <button key={person.id} onClick={() => onOpenPerson(person.id)} className="group flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <Avatar name={person.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-sm font-medium">{person.name}{person.primary ? <Star className="h-3 w-3 shrink-0 fill-current" style={{ color: YELLOW }} aria-label="Contacto principal" /> : null}</p>
                        <p className="truncate text-xs text-muted-foreground">{person.title ?? "Sin cargo"} · {person.email ?? person.phone}</p>
                      </div>
                      <span className="text-muted-foreground"><ChannelIcon channel={person.channel} /></span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </PanelSection>
          </Card>

          <Card>
            <PanelSection title={`Servicios · ${euros(monthly)}/mes`} icon={Repeat} color={MINT}>
              {customer.services.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {customer.services.map((service) => (
                    <div key={service.id} className="flex items-center gap-3 p-3 text-sm">
                      <div className="min-w-0 flex-1"><p className="truncate font-medium">{service.name}</p><p className="text-xs text-muted-foreground">Renueva {new Date(service.nextRenewal).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p></div>
                      {service.status !== "active" ? <Pill color={service.status === "paused" ? RISK : YELLOW}>{service.status === "paused" ? "En pausa" : "Renovando"}</Pill> : null}
                      <span className="w-20 text-right font-semibold tabular-nums">{euros(service.monthlyCents)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Sin servicios recurrentes.</p>}
            </PanelSection>
          </Card>

          <Card>
            <PanelSection title="Propuestas abiertas" icon={FileText} color={SKY}>
              {customer.openProposals.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {customer.openProposals.map((proposal) => (
                    <div key={proposal.id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{proposal.title}</span>
                      <Pill color={proposal.status === "viewed" ? MINT : SKY}>{proposal.status === "viewed" ? "Vista" : proposal.status === "sent" ? "Enviada" : "Borrador"}</Pill>
                      <span className="w-20 text-right tabular-nums">{euros(proposal.amountCents)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Ninguna propuesta abierta.</p>}
            </PanelSection>
          </Card>
        </div>

        <Card className="h-fit">
          <PanelSection title="Trabajo" icon={CheckCircle2} color={LILAC}>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Tareas", customer.activeTasks], ["Revisiones", customer.pendingReviews], ["Sin leer", customer.unreadConversations]].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-border p-2.5"><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{customer.lastActivityLabel}</p>
          </PanelSection>
        </Card>
      </div>
    </PageShell>
  );
}

/** Person detail page: contact data, the customer they belong to, and their colleagues there. */
export function PersonDetailPage({ person, customer, onBackToList, onOpenCustomer, onOpenPerson, onAction, canAct = true }: {
  person: DemoContact;
  customer: DemoCustomer;
  onBackToList: () => void;
  onOpenCustomer: () => void;
  onOpenPerson: (personId: string) => void;
  onAction: ActionHandler;
  canAct?: boolean;
}) {
  const health = HEALTH[customer.health];
  const accent = customer.archived ? MUTED : health.color;
  const others = customer.contacts.filter((other) => other.id !== person.id);
  const ChannelButtonIcon = person.channel === "phone" ? Phone : person.channel === "email" ? Mail : MessageCircle;
  const verb = person.channel === "phone" ? "Llamar" : "Escribir";
  const rows: [string, string | null, typeof Mail][] = [
    ["Email", person.email, Mail],
    ["Teléfono", person.phone, Phone],
    ["Canal preferido", CHANNEL_LABEL[person.channel], MessageCircle],
  ];
  return (
    <PageShell>
      <Crumbs items={[{ label: "Clientes", onClick: onBackToList }, { label: customer.name, onClick: onOpenCustomer }, { label: person.name }]} />

      <header className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-card p-5">
        <Avatar name={person.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold [overflow-wrap:anywhere]">{person.name}{person.primary ? <Star className="h-4 w-4 shrink-0 fill-current" style={{ color: YELLOW }} aria-label="Contacto principal" /> : null}</h1>
          <p className="text-sm text-muted-foreground">{person.title ?? "Sin cargo"} en {customer.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={onOpenCustomer} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pill color={accent}>{customer.name}</Pill></button>
            {person.primary ? <Pill color={YELLOW}>Contacto principal</Pill> : null}
          </div>
        </div>
        {canAct ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onAction("message", customer, person)}><ChannelButtonIcon className="h-4 w-4" />{verb}</Button>
            <Button variant="outline" onClick={() => onAction("task", customer, person)}><Plus className="h-4 w-4" />Tarea</Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <PanelSection title="Datos de contacto" icon={Mail} color={SKY}>
            <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {rows.map(([label, value, Icon]) => (
                <div key={label} className="flex items-center gap-3 p-3 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <dt className="w-36 text-muted-foreground">{label}</dt>
                  <dd className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{value ?? "Sin añadir"}</dd>
                </div>
              ))}
            </dl>
          </PanelSection>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <PanelSection title="Cliente" icon={Users} color={LILAC}>
              <button onClick={onOpenCustomer} className="group flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={customer.name} size="sm" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{customer.name}</span><span className="text-xs text-muted-foreground">{customer.archived ? "Archivado" : health.label} · {customer.activeTasks} {customer.activeTasks === 1 ? "tarea" : "tareas"}</span></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
              </button>
            </PanelSection>
          </Card>
          {others.length ? (
            <Card>
              <PanelSection title="Más personas del cliente" icon={Users} color={SKY}>
                {others.map((other) => (
                  <button key={other.id} onClick={() => onOpenPerson(other.id)} className="flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar name={other.name} size="sm" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{other.name}</span><span className="block truncate text-xs text-muted-foreground">{other.title ?? other.email}</span></span>
                  </button>
                ))}
              </PanelSection>
            </Card>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
