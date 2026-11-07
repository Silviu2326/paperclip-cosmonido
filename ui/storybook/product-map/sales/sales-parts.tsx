import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  Globe,
  Inbox,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { euros } from "../customers/demo-data";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, Progress, SectionTitle, Stat } from "../parts";
import { LoadMore } from "../tasks/state-parts";
import { DEMO_FORMS, DEMO_LEAD_STATS, STAGES, type DemoLead, type DemoOpportunity, type DemoProposal, type StageKey } from "./demo-data";

/** Pieces shared by the three Ventas variants (board, table, "Hoy"). */

export const STAGE_COLOR: Record<StageKey, string> = {
  new: ACCENT.muted, qualified: ACCENT.sky, proposal: ACCENT.lilac, negotiation: ACCENT.yellow, won: ACCENT.mint,
};
export const SOURCE: Record<string, { label: string; icon: LucideIcon }> = {
  form: { label: "Formulario", icon: ClipboardList }, whatsapp: { label: "WhatsApp", icon: MessageCircle },
  webchat: { label: "Chat web", icon: MessageCircle }, email: { label: "Email", icon: Mail }, voice: { label: "Llamada", icon: Phone },
};
export const PROPOSAL_STATUS: Record<DemoProposal["status"], { label: string; color: string }> = {
  draft: { label: "Borrador", color: ACCENT.muted }, sent: { label: "Enviada", color: ACCENT.sky },
  viewed: { label: "Vista", color: ACCENT.mint }, accepted: { label: "Aceptada", color: ACCENT.mint }, expired: { label: "Caducada", color: ACCENT.risk },
};
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const STALL_ESCALATE = 30;

/** Opportunities, leads and the messages after an action, in one place so every variant behaves the same. */
export function useSalesData(initialOpportunities: DemoOpportunity[], initialLeads: DemoLead[], readOnly: boolean) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [leads, setLeads] = useState(initialLeads);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return {
    opportunities, leads, toast, setToast, setOpportunities,
    move(id: string, stage: StageKey) {
      if (readOnly) return;
      setOpportunities((current) => current.map((opportunity) => (opportunity.id === id ? { ...opportunity, stage, probability: stage === "won" ? 100 : Math.max(opportunity.probability, 50), stalledDays: 0 } : opportunity)));
      setToast(`Movida a ${STAGES.find((candidate) => candidate.key === stage)!.label}`);
    },
    reactivate(id: string) {
      if (readOnly) return;
      setOpportunities((current) => current.map((opportunity) => (opportunity.id === id ? { ...opportunity, stalledDays: 0, nextAction: "Esperar respuesta al mensaje de reactivación", nextActionAt: "2026-10-28" } : opportunity)));
      setToast("Mensaje de reactivación enviado desde tu cuenta. Revisarás la respuesta el 28 oct");
    },
    lose(id: string) {
      if (readOnly) return;
      setOpportunities((current) => current.filter((opportunity) => opportunity.id !== id));
      setToast("Cerrada como perdida. Se conserva en el historial del cliente");
    },
    convert(lead: DemoLead, createOpportunity: boolean, title: string, amountCents: number, linked = false) {
      if (readOnly) return;
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      if (createOpportunity) {
        setOpportunities((current) => [{ id: `n-${lead.id}`, title: title || lead.name, customer: lead.duplicateOf?.customer ?? lead.existingCustomer ?? lead.company ?? lead.name, contact: lead.name, stage: "new", amountCents, probability: 25, expectedCloseAt: "2026-12-15", owner: "Tú", nextAction: "Responder y cualificar", nextActionAt: "2026-10-25", stalledDays: 0, proposalId: null }, ...current]);
        setToast(`${lead.name} convertido: oportunidad creada en «Nueva»`);
      } else {
        setToast(linked ? `${lead.name} enlazado con ${lead.duplicateOf?.customer}: sin duplicados` : `${lead.name} convertido: guardado sin oportunidad`);
      }
    },
    discard(lead: DemoLead) {
      if (readOnly) return;
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      setToast(`${lead.name} descartado`);
    },
  };
}

export function SalesToast({ message }: { message: string | null }) {
  const tokens = useMotionTokens();
  return (
    <AnimatePresence>
      {message ? (
        <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-6 left-1/2 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0">{message}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function forecastOf(opportunities: DemoOpportunity[]) {
  const open = opportunities.filter((opportunity) => opportunity.stage !== "won");
  return {
    open,
    pipeline: open.reduce((sum, opportunity) => sum + opportunity.amountCents, 0),
    forecast: Math.round(open.reduce((sum, opportunity) => sum + (opportunity.amountCents * opportunity.probability) / 100, 0)),
    won: opportunities.filter((opportunity) => opportunity.stage === "won").reduce((sum, opportunity) => sum + opportunity.amountCents, 0),
    stalled: open.filter((opportunity) => opportunity.stalledDays >= 14),
  };
}

export function SalesStats({ opportunities }: { opportunities: DemoOpportunity[] }) {
  const { open, pipeline, forecast, won } = useMemo(() => forecastOf(opportunities), [opportunities]);
  const rate = Math.round((DEMO_LEAD_STATS.converted / DEMO_LEAD_STATS.receivedThisMonth) * 100);
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat index={0} label="Embudo abierto" value={euros(pipeline)} hint={`${open.length} oportunidades`} color={ACCENT.sky} icon={Target} />
      <Stat index={1} label="Previsión ponderada" value={euros(forecast)} hint="Importe × probabilidad" color={ACCENT.lilac} icon={TrendingUp}>
        <div className="mt-1"><Progress value={pipeline ? (forecast / pipeline) * 100 : 0} color={ACCENT.lilac} /></div>
      </Stat>
      <Stat index={2} label="Ganado este mes" value={euros(won)} hint="Oportunidades cerradas" color={ACCENT.mint} icon={CheckCircle2} />
      <Stat index={3} label="Conversión de leads" value={`${rate} %`} hint={`${DEMO_LEAD_STATS.converted} de ${DEMO_LEAD_STATS.receivedThisMonth} este mes`} color={ACCENT.turquoise} icon={UserPlus} />
    </div>
  );
}

export function StalledNotice({ count, severe }: { count: number; severe: number }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: tint(severe ? ACCENT.risk : ACCENT.yellow, severe ? 14 : 22) }}>
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: readable(severe ? ACCENT.risk : ACCENT.yellow) }} />
      <span className="min-w-0">{count} {count === 1 ? "oportunidad lleva" : "oportunidades llevan"} más de 2 semanas sin movimiento{severe ? `; ${severe} ${severe === 1 ? "pasa" : "pasan"} de ${STALL_ESCALATE} días y conviene reactivar o cerrar` : ""}.</span>
    </div>
  );
}

export function OpportunityCard({ opportunity, index, readOnly, onMove, onReactivate, onLose }: {
  opportunity: DemoOpportunity; index: number; readOnly: boolean;
  onMove: (id: string, stage: StageKey) => void; onReactivate: (id: string) => void; onLose: (id: string) => void;
}) {
  const tokens = useMotionTokens();
  const color = STAGE_COLOR[opportunity.stage];
  const stageIndex = STAGES.findIndex((stage) => stage.key === opportunity.stage);
  const next = STAGES[stageIndex + 1];
  const stalled = opportunity.stalledDays >= 14;
  const severe = opportunity.stalledDays >= STALL_ESCALATE && opportunity.stage !== "won";
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      className="group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-background p-3 transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md"
      style={severe ? { boxShadow: `inset 0 0 0 1px ${tint(ACCENT.risk, 45)}` } : undefined}
    >
      <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: severe ? ACCENT.risk : color }} />
      <div className="flex items-start gap-2 pl-1">
        <Avatar name={opportunity.customer} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug">{opportunity.title}</p>
          <p className="truncate text-xs text-muted-foreground">{opportunity.customer}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="min-w-0 truncate font-semibold tabular-nums">{euros(opportunity.amountCents)}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{opportunity.probability} % · cierre {shortDate(opportunity.expectedCloseAt)}</span>
      </div>
      {stalled ? <span className="self-start"><Pill color={severe ? ACCENT.risk : ACCENT.yellow} strong={severe}><AlertTriangle className="h-3 w-3" />Parada {opportunity.stalledDays} días</Pill></span> : null}
      {opportunity.nextAction ? (
        <p className="flex items-start gap-1.5 break-words rounded-lg px-2 py-1 text-xs" style={{ background: tint(color, 14) }}>
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: readable(color) }} />
          <span className="min-w-0">{opportunity.nextAction}</span>
        </p>
      ) : null}
      {severe ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={readOnly} onClick={() => onReactivate(opportunity.id)}><Sparkles className="h-3.5 w-3.5" />Reactivar</Button>
          <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => onLose(opportunity.id)}><XCircle className="h-3.5 w-3.5" />Cerrar como perdida</Button>
        </div>
      ) : null}
      {next && !readOnly && !severe ? (
        <Button size="sm" variant="ghost" className="self-end opacity-0 transition-opacity duration-(--motion-duration-fast) focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100" onClick={() => onMove(opportunity.id, next.key)}>
          Mover a {next.label}<ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </motion.article>
  );
}

const COLUMN_PAGE = 5;

export function Board({ opportunities, readOnly, limited, nudge, onMove, onReactivate, onLose }: {
  opportunities: DemoOpportunity[]; readOnly: boolean; limited: boolean; nudge?: string;
  onMove: (id: string, stage: StageKey) => void; onReactivate: (id: string) => void; onLose: (id: string) => void;
}) {
  const [shown, setShown] = useState<Partial<Record<StageKey, number>>>({});
  return (
    <div className="-mx-1 flex min-w-0 gap-3 overflow-x-auto px-1 pb-2" aria-label="Embudo de oportunidades">
      <LayoutGroup id="sales-board">
        {STAGES.map((stage) => {
          const items = opportunities.filter((opportunity) => opportunity.stage === stage.key);
          const total = items.reduce((sum, opportunity) => sum + opportunity.amountCents, 0);
          const color = STAGE_COLOR[stage.key];
          const limit = limited ? shown[stage.key] ?? COLUMN_PAGE : items.length;
          return (
            <section key={stage.key} className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl p-2" style={{ background: tint(color, 8) }}>
              <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{stage.label}<span className="text-xs font-normal text-muted-foreground">{items.length}</span></h3>
                <span className="text-xs text-muted-foreground tabular-nums">{euros(total)}</span>
              </header>
              <AnimatePresence mode="popLayout">
                {items.slice(0, limit).map((opportunity, index) => <OpportunityCard key={opportunity.id} opportunity={opportunity} index={index} readOnly={readOnly} onMove={onMove} onReactivate={onReactivate} onLose={onLose} />)}
              </AnimatePresence>
              {items.length === 0 ? (
                <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  <span>{stage.hint}</span>
                  {nudge && stage.key === "proposal" ? <span className="font-medium" style={{ color: readable(ACCENT.lilac) }}>{nudge}</span> : <span>Aquí aparecerán las oportunidades de esta etapa.</span>}
                </div>
              ) : null}
              {limited ? <LoadMore shown={limit} total={items.length} step={20} onMore={() => setShown((current) => ({ ...current, [stage.key]: limit + 20 }))} /> : null}
            </section>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

export function LeadCard({ lead, index, readOnly, onConvert, onDiscard }: {
  lead: DemoLead; index: number; readOnly: boolean;
  onConvert: (lead: DemoLead, createOpportunity: boolean, title: string, amount: number, linked?: boolean) => void;
  onDiscard: (lead: DemoLead) => void;
}) {
  const tokens = useMotionTokens();
  const [open, setOpen] = useState(index === 0);
  const [create, setCreate] = useState(lead.priority !== "low" && !lead.duplicateOf);
  const [forceNew, setForceNew] = useState(false);
  const [title, setTitle] = useState(`${lead.company ?? lead.name}: ${lead.message.length > 36 ? lead.message.slice(0, 33) + "…" : lead.message}`);
  const [amount, setAmount] = useState("");
  const source = SOURCE[lead.source] ?? SOURCE.form!;
  const priorityColor = lead.priority === "high" ? ACCENT.yellow : ACCENT.muted;
  const duplicate = lead.duplicateOf && !forceNew ? lead.duplicateOf : null;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3"
      style={lead.duplicateOf ? { boxShadow: `inset 0 0 0 1px ${tint(ACCENT.yellow, 55)}` } : undefined}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 items-start gap-2 text-left">
        <Avatar name={lead.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-medium"><span className="min-w-0 truncate">{lead.name}</span>{lead.priority === "high" ? <Pill color={priorityColor} strong>Prioridad alta</Pill> : null}{lead.duplicateOf ? <Pill color={ACCENT.yellow}><Link2 className="h-3 w-3" />Posible duplicado</Pill> : null}</span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"><source.icon className="h-3 w-3 shrink-0" /><span className="min-w-0 truncate">{source.label} · {lead.receivedLabel}{lead.company ? ` · ${lead.company}` : ""}</span></span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="mt-1 flex text-muted-foreground"><ChevronDown className="h-4 w-4" /></motion.span>
      </button>
      <p className="break-words text-sm text-muted-foreground">{lead.message}</p>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
            <div className="flex flex-col gap-3 rounded-xl p-3" style={{ background: tint(ACCENT.sky, 10) }}>
              {duplicate ? (
                <div role="alert" className="flex flex-col gap-2 rounded-lg p-2.5 text-sm" style={{ background: tint(ACCENT.yellow, 26) }}>
                  <p className="flex items-start gap-2"><Link2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.yellow) }} /><span className="min-w-0 break-words">Se parece a <strong>{duplicate.name}</strong> de <strong>{duplicate.customer}</strong> (coincide {duplicate.matchOn}). Si es la misma persona, enlázalo y no se crea otro cliente.</span></p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={readOnly} onClick={() => onConvert(lead, false, "", 0, true)} style={readOnly ? undefined : { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>Enlazar con {duplicate.customer}</Button>
                    <Button size="sm" variant="outline" onClick={() => { setForceNew(true); setCreate(true); }}>No es el mismo: crear cliente nuevo</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="flex items-start gap-2 text-xs"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: readable(ACCENT.sky) }} /><span className="min-w-0 break-words">{lead.suggestion}</span></p>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={create} disabled={readOnly} onChange={(event) => setCreate(event.target.checked)} />
                    <span>
                      <span className="font-medium">Crear también una oportunidad</span>
                      <span className="block text-xs text-muted-foreground">
                        {create
                          ? "Aparecerá en el embudo para seguir la venta. Úsalo si hay algo que cotizar."
                          : `Solo se guardará ${lead.existingCustomer ? `en la ficha de ${lead.existingCustomer}` : "como cliente y contacto"}, sin entrar en el embudo.`}
                      </span>
                    </span>
                  </label>
                  <AnimatePresence initial={false}>
                    {create ? (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-col gap-2 overflow-hidden">
                        <Input aria-label="Título de la oportunidad" value={title} disabled={readOnly} onChange={(event) => setTitle(event.target.value)} />
                        <Input aria-label="Importe estimado" inputMode="numeric" value={amount} disabled={readOnly} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} placeholder="Importe estimado en € (opcional)" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <p className="text-xs text-muted-foreground">{lead.existingCustomer ? `Se enlazará con el cliente ${lead.existingCustomer}.` : `Se creará el cliente ${lead.company ?? lead.name} y su contacto. Repetir la conversión es seguro.`}</p>
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => onDiscard(lead)}><X className="h-3.5 w-3.5" />Descartar</Button>
                    <Button size="sm" disabled={readOnly} onClick={() => onConvert(lead, create, title.trim(), Number(amount || 0) * 100)} style={readOnly ? undefined : { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>
                      <UserPlus className="h-3.5 w-3.5" />Convertir{create ? " y crear oportunidad" : ""}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

const LEAD_PAGE = 6;

export function LeadsPanel({ leads, readOnly, limited, onConvert, onDiscard }: {
  leads: DemoLead[]; readOnly: boolean; limited: boolean;
  onConvert: (lead: DemoLead, createOpportunity: boolean, title: string, amount: number, linked?: boolean) => void; onDiscard: (lead: DemoLead) => void;
}) {
  const [shown, setShown] = useState(LEAD_PAGE);
  const limit = limited ? shown : leads.length;
  return (
    <Panel>
      <SectionTitle color={ACCENT.yellow} icon={Inbox} action={leads.length ? <Pill color={ACCENT.yellow} strong>{leads.length}</Pill> : null}>Leads por cualificar</SectionTitle>
      <AnimatePresence mode="popLayout">
        {leads.slice(0, limit).map((lead, index) => <LeadCard key={lead.id} lead={lead} index={index} readOnly={readOnly} onConvert={onConvert} onDiscard={onDiscard} />)}
      </AnimatePresence>
      {leads.length === 0 ? <p className="text-sm text-muted-foreground">Todos los leads están atendidos.</p> : null}
      {limited ? <LoadMore shown={limit} total={leads.length} step={10} onMore={() => setShown((value) => value + 10)} /> : null}
    </Panel>
  );
}

export function Proposals({ proposals, limited }: { proposals: DemoProposal[]; limited: boolean }) {
  const tokens = useMotionTokens();
  const [shown, setShown] = useState(5);
  const limit = limited ? shown : proposals.length;
  return (
    <Panel>
      <SectionTitle color={ACCENT.lilac} icon={FileText}>Propuestas en curso</SectionTitle>
      {proposals.length === 0 ? <p className="text-sm text-muted-foreground">Ninguna propuesta abierta.</p> : null}
      {proposals.slice(0, limit).map((proposal, index) => {
        const status = PROPOSAL_STATUS[proposal.status];
        const alert = proposal.status === "sent" && proposal.views === 0;
        return (
          <motion.div key={proposal.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{proposal.title}</p><p className="truncate text-xs text-muted-foreground">{proposal.customer}</p></div>
              <span className="shrink-0 font-semibold tabular-nums">{euros(proposal.amountCents)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill color={status.color}>{proposal.status === "viewed" ? <Eye className="h-3 w-3" /> : null}{status.label}</Pill>
              {proposal.validUntil ? <span className="text-xs text-muted-foreground">válida hasta {shortDate(proposal.validUntil)}</span> : null}
            </div>
            <p className="flex items-center gap-1.5 break-words text-xs" style={{ color: alert ? readable(ACCENT.yellow) : "var(--muted-foreground)" }}>{alert ? <AlertTriangle className="h-3 w-3 shrink-0" /> : null}{proposal.note}</p>
          </motion.div>
        );
      })}
      {limited ? <LoadMore shown={limit} total={proposals.length} step={10} onMore={() => setShown((value) => value + 10)} /> : null}
    </Panel>
  );
}

export function Forms({ readOnly }: { readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const tokens = useMotionTokens();
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Panel>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center justify-between gap-2 text-left">
        <SectionTitle color={ACCENT.turquoise} icon={Globe}>Formularios de captación</SectionTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{DEMO_FORMS.filter((form) => form.published).length} publicados
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-col gap-2 overflow-hidden">
            {DEMO_FORMS.map((form) => (
              <div key={form.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">{form.name}<Pill color={form.published ? ACCENT.mint : ACCENT.muted}>{form.published ? "Publicado" : "Borrador"}</Pill></p>
                  <p className="truncate text-xs text-muted-foreground">{form.published ? `${form.submissions30d} envíos en 30 días · ${form.conversion} % se convierten` : "Aún no acepta envíos"}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Copiar enlace de ${form.name}`} onClick={() => setCopied(form.id)}>{copied === form.id ? <CheckCircle2 className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} /> : <Copy className="h-4 w-4" />}</Button>
              </div>
            ))}
            {readOnly ? null : <Button size="sm" variant="outline" className="self-start"><Plus className="h-3.5 w-3.5" />Nuevo formulario</Button>}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Panel>
  );
}

export function SalesEmpty({ onCreate, readOnly }: { onCreate: () => void; readOnly: boolean }) {
  const tokens = useMotionTokens();
  const steps = [
    { icon: Globe, title: "Publica un formulario", text: "Recibe solicitudes desde tu web.", color: ACCENT.turquoise },
    { icon: Inbox, title: "Importa tus leads", text: "Desde un CSV o tus conversaciones.", color: ACCENT.sky },
    { icon: Target, title: "Crea una oportunidad", text: "Para seguir cada venta en el embudo.", color: ACCENT.lilac },
  ];
  return (
    <div className="flex min-w-0 flex-col items-center gap-6 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.sky}, ${ACCENT.lilac})`, color: ink(ACCENT.sky) }}><TrendingUp className="h-7 w-7" /></motion.span>
      <div><h2 className="text-lg font-semibold">Tu embudo de ventas está vacío</h2><p className="text-sm text-muted-foreground">Aquí verás de dónde vienen tus clientes y cuánto vas a cerrar.</p></div>
      <div className="grid w-full max-w-2xl min-w-0 gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <motion.div key={step.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger * 2 }} className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left" style={{ background: `linear-gradient(135deg, ${tint(step.color, 14)}, transparent 70%)` }}>
            <IconTile icon={step.icon} color={step.color} size="sm" /><p className="text-sm font-medium">{step.title}</p><p className="text-xs text-muted-foreground">{step.text}</p>
          </motion.div>
        ))}
      </div>
      {readOnly ? null : <Button onClick={onCreate}><Plus className="h-4 w-4" />Nueva oportunidad</Button>}
    </div>
  );
}

