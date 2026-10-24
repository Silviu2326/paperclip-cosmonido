import type { LeadSource } from "@paperclipai/shared";

/**
 * Demo data for the Ventas proposal. Fields follow the real Lead, Opportunity
 * and Proposal types (stage keys of the default sales pipeline, probability,
 * expected close, next action). Customers, contacts and amounts match
 * customers/demo-data.ts.
 */
export type StageKey = "new" | "qualified" | "proposal" | "negotiation" | "won";

export const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: "new", label: "Nueva", hint: "Primer contacto" },
  { key: "qualified", label: "Cualificada", hint: "Encaja y tiene presupuesto" },
  { key: "proposal", label: "Propuesta", hint: "Oferta enviada" },
  { key: "negotiation", label: "Negociación", hint: "Ajustando alcance o precio" },
  { key: "won", label: "Ganada", hint: "Cerrada este mes" },
];

export interface DemoOpportunity {
  id: string;
  title: string;
  customer: string;
  contact: string;
  stage: StageKey;
  amountCents: number;
  probability: number;
  expectedCloseAt: string;
  owner: string;
  nextAction: string | null;
  nextActionAt: string | null;
  stalledDays: number;
  proposalId: string | null;
}

export const DEMO_OPPORTUNITIES: DemoOpportunity[] = [
  { id: "o1", title: "Web nueva con reservas online", customer: "Clínica Dental Sonrisa", contact: "Laura Gómez", stage: "negotiation", amountCents: 240000, probability: 70, expectedCloseAt: "2026-11-05", owner: "Diego (agente comercial)", nextAction: "Enviar versión con 2 fases", nextActionAt: "2026-10-25", stalledDays: 1, proposalId: "pr1" },
  { id: "o2", title: "Rediseño de portfolio", customer: "Estudio Arquitectura Norte", contact: "Elena Navarro", stage: "proposal", amountCents: 380000, probability: 40, expectedCloseAt: "2026-11-20", owner: "Diego (agente comercial)", nextAction: "Presentar la propuesta (hoy 17:15)", nextActionAt: "2026-10-24", stalledDays: 21, proposalId: "pr2" },
  { id: "o3", title: "Ficha de Google y reseñas", customer: "Taller Mecánico Ruedas", contact: "Raúl Sánchez", stage: "proposal", amountCents: 45000, probability: 60, expectedCloseAt: "2026-10-30", owner: "Tú", nextAction: "Llamar para cerrar", nextActionAt: "2026-10-24", stalledDays: 0, proposalId: "pr4" },
  { id: "o4", title: "Curso online: grabación y edición", customer: "Lucía Martín", contact: "Lucía Martín", stage: "qualified", amountCents: 150000, probability: 50, expectedCloseAt: "2026-11-30", owner: "Tú", nextAction: "Terminar el borrador de propuesta", nextActionAt: "2026-10-27", stalledDays: 3, proposalId: "pr3" },
  { id: "o5", title: "Gestión de Instagram (ampliación)", customer: "Yoga Bahía", contact: "Sara Vidal", stage: "qualified", amountCents: 96000, probability: 55, expectedCloseAt: "2026-12-10", owner: "Marta (agente de cuentas)", nextAction: "Proponer pack de reels", nextActionAt: "2026-10-29", stalledDays: 5, proposalId: null },
  { id: "o6", title: "Newsletter trimestral", customer: "Panadería La Espiga", contact: "Antonio Pérez", stage: "new", amountCents: 36000, probability: 25, expectedCloseAt: "2026-12-20", owner: "Tú", nextAction: "Responder dudas sobre la renovación", nextActionAt: "2026-10-26", stalledDays: 12, proposalId: null },
  { id: "o7", title: "Campaña de Black Friday", customer: "Clínica Dental Sonrisa", contact: "Iván Ruiz", stage: "won", amountCents: 85000, probability: 100, expectedCloseAt: "2026-10-18", owner: "Diego (agente comercial)", nextAction: null, nextActionAt: null, stalledDays: 0, proposalId: null },
];

export interface DemoLead {
  id: string;
  name: string;
  company: string | null;
  source: LeadSource;
  message: string;
  priority: "low" | "normal" | "high";
  receivedAt: string;
  receivedLabel: string;
  status: "new" | "triaged" | "qualified";
  existingCustomer: string | null;
  suggestion: string;
}

export const DEMO_LEADS: DemoLead[] = [
  { id: "l1", name: "Marcos Ibáñez", company: "Academia Ibáñez", source: "form", message: "Necesitamos una web y gestionar redes para 3 sedes. ¿Presupuesto?", priority: "high", receivedAt: "2026-10-24T08:20:00Z", receivedLabel: "hace 1 h", status: "new", existingCustomer: null, suggestion: "Encaja con «Redes + web». Crea la oportunidad: tiene presupuesto y plazo." },
  { id: "l2", name: "Carolina Bravo", company: null, source: "whatsapp", message: "Hola, vi vuestro trabajo con la clínica dental. ¿Hacéis algo parecido para fisios?", priority: "normal", receivedAt: "2026-10-23T19:05:00Z", receivedLabel: "ayer", status: "triaged", existingCustomer: null, suggestion: "Pregunta amplia: conviene responder antes de crear nada." },
  { id: "l3", name: "Raúl Sánchez", company: "Taller Mecánico Ruedas", source: "webchat", message: "¿Podéis añadir también la gestión de Instagram?", priority: "normal", receivedAt: "2026-10-23T11:40:00Z", receivedLabel: "ayer", status: "qualified", existingCustomer: "Taller Mecánico Ruedas", suggestion: "Ya es cliente: se añade como nueva oportunidad a su ficha." },
  { id: "l4", name: "Info Gimnasio Fuerte", company: "Gimnasio Fuerte", source: "email", message: "Quieren cotizar un vídeo corporativo de 2 minutos para su web.", priority: "low", receivedAt: "2026-10-21T15:30:00Z", receivedLabel: "hace 3 días", status: "new", existingCustomer: null, suggestion: "Sin presupuesto indicado. Cualifica con una llamada corta." },
];

export interface DemoProposal {
  id: string;
  title: string;
  customer: string;
  amountCents: number;
  status: "draft" | "sent" | "viewed" | "accepted" | "expired";
  validUntil: string | null;
  views: number;
  note: string;
  opportunityId: string | null;
}

export const DEMO_PROPOSALS: DemoProposal[] = [
  { id: "pr1", title: "Web nueva con reservas online", customer: "Clínica Dental Sonrisa", amountCents: 240000, status: "viewed", validUntil: "2026-11-10", views: 4, note: "La abrió 4 veces esta semana", opportunityId: "o1" },
  { id: "pr2", title: "Rediseño de portfolio", customer: "Estudio Arquitectura Norte", amountCents: 380000, status: "sent", validUntil: "2026-11-02", views: 0, note: "Sin abrir desde hace 3 semanas", opportunityId: "o2" },
  { id: "pr4", title: "Ficha de Google y reseñas", customer: "Taller Mecánico Ruedas", amountCents: 45000, status: "viewed", validUntil: "2026-11-05", views: 2, note: "La abrió 2 veces hoy", opportunityId: "o3" },
  { id: "pr3", title: "Curso online: grabación y edición", customer: "Lucía Martín", amountCents: 150000, status: "draft", validUntil: null, views: 0, note: "Borrador sin enviar", opportunityId: "o4" },
];

export interface DemoForm {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  submissions30d: number;
  conversion: number;
}

export const DEMO_FORMS: DemoForm[] = [
  { id: "f1", name: "Pide presupuesto", slug: "presupuesto", published: true, submissions30d: 23, conversion: 26 },
  { id: "f2", name: "Reserva una llamada", slug: "llamada", published: true, submissions30d: 9, conversion: 44 },
  { id: "f3", name: "Encuesta de salida", slug: "encuesta", published: false, submissions30d: 0, conversion: 0 },
];

export const DEMO_LEAD_STATS = { receivedThisMonth: 42, converted: 9, discarded: 11 };
