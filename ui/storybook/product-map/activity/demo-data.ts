/**
 * Demo data for the Actividad proposal. Agents, customers and amounts match
 * home/demo-data.ts and customers/demo-data.ts. Real sources: activity log,
 * heartbeat runs, cost events, budgets and the work timeline.
 */
export type ActivityKind = "task" | "approval" | "message" | "cost" | "error" | "agent";

export interface DemoEvent {
  id: string;
  kind: ActivityKind;
  actor: string;
  text: string;
  customer: string | null;
  at: string;
  /** "Hoy", "Ayer", "Esta semana" or a dated label for long histories. */
  day: string;
}

export const DEMO_EVENTS: DemoEvent[] = [
  { id: "e1", kind: "task", actor: "Marta", text: "terminó «Calendario de noviembre» (4 publicaciones)", customer: "Clínica Dental Sonrisa", at: "09:12", day: "Hoy" },
  { id: "e2", kind: "approval", actor: "Laura (Clínica Sonrisa)", text: "aprobó el carrusel de blanqueamiento", customer: "Clínica Dental Sonrisa", at: "08:40", day: "Hoy" },
  { id: "e3", kind: "message", actor: "Diego", text: "te hizo una pregunta sobre el precio de la web", customer: "Estudio Arquitectura Norte", at: "08:05", day: "Hoy" },
  { id: "e4", kind: "cost", actor: "Sistema", text: "el presupuesto de Marta llegó al 96 %", customer: "Clínica Dental Sonrisa", at: "07:10", day: "Hoy" },
  { id: "e5", kind: "error", actor: "Nora", text: "no pudo enviar la newsletter de octubre (credenciales caducadas)", customer: "Panadería La Espiga", at: "02:14", day: "Hoy" },
  { id: "e6", kind: "agent", actor: "Tú", text: "pausaste a Leo (editor de vídeo) durante la revisión", customer: null, at: "18:30", day: "Ayer" },
  { id: "e7", kind: "task", actor: "Leo", text: "entregó el vídeo de bienvenida", customer: "Yoga Bahía", at: "16:20", day: "Ayer" },
  { id: "e8", kind: "approval", actor: "Tú", text: "aprobaste la propuesta para Taller Ruedas", customer: "Taller Mecánico Ruedas", at: "12:02", day: "Ayer" },
  { id: "e9", kind: "message", actor: "Raúl (Taller Ruedas)", text: "abrió la propuesta por segunda vez", customer: "Taller Mecánico Ruedas", at: "10:30", day: "Ayer" },
  { id: "e10", kind: "task", actor: "Diego", text: "envió la propuesta de rediseño de portfolio", customer: "Estudio Arquitectura Norte", at: "Lun 17:45", day: "Esta semana" },
  { id: "e11", kind: "cost", actor: "Sistema", text: "se renovó el servicio «Newsletter mensual»", customer: "Panadería La Espiga", at: "Lun 09:00", day: "Esta semana" },
];

export interface DemoRun {
  id: string;
  agent: string;
  title: string;
  status: "running" | "done" | "failed" | "queued" | "paused";
  startedAt: string;
  durationSec: number | null;
  costCents: number;
  customer: string | null;
  error?: string;
}

export const DEMO_RUNS: DemoRun[] = [
  { id: "r1", agent: "Marta", title: "Programar posts de noviembre", status: "running", startedAt: "09:05", durationSec: null, costCents: 41, customer: "Clínica Dental Sonrisa" },
  { id: "r2", agent: "Diego", title: "Preparar propuesta de rediseño", status: "running", startedAt: "08:50", durationSec: null, costCents: 63, customer: "Estudio Arquitectura Norte" },
  { id: "r3", agent: "Nora", title: "Enviar newsletter de octubre", status: "failed", startedAt: "02:10", durationSec: 38, costCents: 4, customer: "Panadería La Espiga", error: "Credenciales de envío caducadas (Apps → Email)" },
  { id: "r4", agent: "Leo", title: "Montar vídeo de bienvenida", status: "done", startedAt: "Ayer 15:10", durationSec: 4210, costCents: 212, customer: "Yoga Bahía" },
  { id: "r5", agent: "Marta", title: "Redactar carruseles de octubre", status: "done", startedAt: "Ayer 11:00", durationSec: 920, costCents: 58, customer: "Clínica Dental Sonrisa" },
  { id: "r6", agent: "Diego", title: "Resumir llamada con Taller Ruedas", status: "done", startedAt: "Ayer 10:02", durationSec: 140, costCents: 9, customer: "Taller Mecánico Ruedas" },
  { id: "r7", agent: "Marta", title: "Revisión semanal de métricas", status: "queued", startedAt: "Programada 18:00", durationSec: null, costCents: 0, customer: null },
];

export const DEMO_AGENT_COSTS = [
  { agent: "Marta", role: "Agente de cuentas", cents: 4810, budgetCents: 5000 },
  { agent: "Leo", role: "Editor de vídeo", cents: 5230, budgetCents: 8000 },
  { agent: "Diego", role: "Agente comercial", cents: 2640, budgetCents: 6000 },
  { agent: "Nora", role: "Agente de email", cents: 1530, budgetCents: 6000 },
];

export const DEMO_CUSTOMER_COSTS = [
  { customer: "Clínica Dental Sonrisa", cents: 5240, revenueCents: 94000 },
  { customer: "Yoga Bahía", cents: 3110, revenueCents: 32000 },
  { customer: "Estudio Arquitectura Norte", cents: 2380, revenueCents: 18000 },
  { customer: "Panadería La Espiga", cents: 1450, revenueCents: 12000 },
  { customer: "Taller Mecánico Ruedas", cents: 700, revenueCents: 0 },
];

/** Spend per day this month, in cents. */
export const DEMO_SPEND_DAILY = [310, 420, 380, 520, 90, 60, 640, 710, 580, 690, 820, 150, 120, 880, 760, 640, 590, 710, 830, 410, 120, 90, 520, 670, 580, 700, 640, 120, 80, 340];

export interface DemoBudget {
  id: string;
  scope: "Empresa" | "Agente" | "Proyecto";
  name: string;
  spentCents: number;
  limitCents: number;
  hardStop: boolean;
  note?: string;
}

export const DEMO_BUDGETS: DemoBudget[] = [
  { id: "b0", scope: "Empresa", name: "Presupuesto mensual", spentCents: 14210, limitCents: 25000, hardStop: false },
  { id: "b1", scope: "Agente", name: "Marta (agente de cuentas)", spentCents: 4810, limitCents: 5000, hardStop: true, note: "Quedan 4 publicaciones de noviembre por programar." },
  { id: "b2", scope: "Agente", name: "Leo (editor de vídeo)", spentCents: 5230, limitCents: 8000, hardStop: true },
  { id: "b3", scope: "Agente", name: "Diego (agente comercial)", spentCents: 2640, limitCents: 6000, hardStop: true },
  { id: "b4", scope: "Proyecto", name: "Redes Clínica Sonrisa", spentCents: 3900, limitCents: 4000, hardStop: false, note: "Aviso al 90 %." },
];

export interface DemoTimelineBar {
  id: string;
  agent: string;
  title: string;
  startHour: number;
  endHour: number | null;
  status: "running" | "done" | "failed";
}

/** Today, hours 0–24. */
export const DEMO_TIMELINE: DemoTimelineBar[] = [
  { id: "t1", agent: "Nora", title: "Newsletter (falló)", startHour: 2.1, endHour: 2.75, status: "failed" },
  { id: "t2", agent: "Marta", title: "Revisar métricas de ayer", startHour: 7, endHour: 7.6, status: "done" },
  { id: "t3", agent: "Marta", title: "Programar posts de noviembre", startHour: 9.1, endHour: null, status: "running" },
  { id: "t4", agent: "Diego", title: "Propuesta de rediseño", startHour: 8.8, endHour: null, status: "running" },
  { id: "t5", agent: "Leo", title: "Revisión de vídeo", startHour: 6, endHour: 6.8, status: "done" },
  { id: "t6", agent: "Diego", title: "Resumen de llamada", startHour: 4, endHour: 4.2, status: "done" },
];

export const NOW_HOUR = 9.4;
export const AGENTS = ["Marta", "Diego", "Leo", "Nora"] as const;
