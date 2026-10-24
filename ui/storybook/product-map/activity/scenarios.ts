import {
  DEMO_BUDGETS,
  DEMO_EVENTS,
  DEMO_RUNS,
  type ActivityKind,
  type DemoBudget,
  type DemoEvent,
  type DemoRun,
} from "./demo-data";

/**
 * Scenarios for the Actividad proposal: the same page rendered with a normal
 * day, an empty company, loading, an error, a huge history, awkward text,
 * missing permissions, exhausted budgets, a failure spike, an empty date range
 * and a running export. Variants are the three design alternatives.
 */
export type ActivityScenario =
  | "normal" | "empty" | "loading" | "error" | "many" | "long-text" | "no-permission"
  | "budget-exhausted" | "failure-spike" | "no-data-range" | "exporting";

/** a: tabs · b: control panel · c: audit log. */
export type ActivityVariant = "a" | "b" | "c";

export interface FailureBurst {
  count: number;
  since: string;
  causes: { label: string; count: number; fix: string }[];
}

export interface ActivityData {
  events: DemoEvent[];
  runs: DemoRun[];
  budgets: DemoBudget[];
  pausedAgents: string[];
  failureBurst: FailureBurst | null;
  /** Total rows the (fake) server holds, shown in the audit footer. */
  total: number;
}

const CUSTOMERS = ["Clínica Dental Sonrisa", "Yoga Bahía", "Estudio Arquitectura Norte", "Panadería La Espiga", "Taller Mecánico Ruedas", "Lucía Martín"];
const AGENT_NAMES = ["Marta", "Diego", "Leo", "Nora"];

/** Deterministic pseudo-random numbers so a story always looks the same. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const pick = <T,>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const pad = (value: number) => String(value).padStart(2, "0");

function dayLabel(offset: number): string {
  if (offset === 0) return "Hoy";
  if (offset === 1) return "Ayer";
  const label = new Date(Date.UTC(2026, 9, 24 - offset)).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const EVENT_TEMPLATES: { kind: ActivityKind; actor: "agent" | "customer" | "system" | "me"; text: string }[] = [
  { kind: "task", actor: "agent", text: "terminó «{task}»" },
  { kind: "task", actor: "agent", text: "empezó «{task}»" },
  { kind: "approval", actor: "customer", text: "aprobó «{task}»" },
  { kind: "approval", actor: "me", text: "aprobaste «{task}»" },
  { kind: "message", actor: "customer", text: "respondió en el hilo de «{task}»" },
  { kind: "message", actor: "agent", text: "te hizo una pregunta sobre «{task}»" },
  { kind: "cost", actor: "system", text: "registró {cost} de coste en «{task}»" },
  { kind: "error", actor: "agent", text: "no pudo completar «{task}»" },
  { kind: "agent", actor: "me", text: "cambió la autonomía de un agente" },
];
const TASKS = ["Calendario de noviembre", "Newsletter de octubre", "Vídeo de bienvenida", "Propuesta de rediseño", "Carruseles de octubre", "Resumen de llamada", "Ficha de Google", "Informe mensual", "Respuesta a reseñas"];

function manyEvents(count: number): DemoEvent[] {
  const random = seeded(7);
  return Array.from({ length: count }, (_, index) => {
    const template = pick(random, EVENT_TEMPLATES);
    const customer = random() > 0.2 ? pick(random, CUSTOMERS) : null;
    const actor = template.actor === "agent" ? pick(random, AGENT_NAMES) : template.actor === "customer" ? `${pick(random, ["Laura", "Raúl", "Elena", "Sara", "Antonio"])} (${customer ?? "cliente"})` : template.actor === "me" ? "Tú" : "Sistema";
    const offset = Math.floor(index / 6);
    return {
      id: `m${index}`,
      kind: template.kind,
      actor,
      text: template.text.replace("{task}", pick(random, TASKS)).replace("{cost}", `${(random() * 3).toFixed(2).replace(".", ",")} €`),
      customer,
      at: `${pad(18 - (index % 6) * 2)}:${pad(Math.floor(random() * 60))}`,
      day: dayLabel(offset),
    };
  });
}

function manyRuns(count: number): DemoRun[] {
  const random = seeded(11);
  return Array.from({ length: count }, (_, index) => {
    const status: DemoRun["status"] = index < 3 ? "running" : index < 8 ? "queued" : random() > 0.93 ? "failed" : "done";
    return {
      id: `mr${index}`,
      agent: pick(random, AGENT_NAMES),
      title: pick(random, TASKS),
      status,
      startedAt: index < 8 ? `Hoy ${pad(9 + (index % 3))}:${pad(Math.floor(random() * 60))}` : `${dayLabel(1 + Math.floor(index / 8))} ${pad(8 + Math.floor(random() * 10))}:${pad(Math.floor(random() * 60))}`,
      durationSec: status === "done" || status === "failed" ? 40 + Math.floor(random() * 3000) : null,
      costCents: status === "queued" ? 0 : 2 + Math.floor(random() * 240),
      customer: random() > 0.15 ? pick(random, CUSTOMERS) : null,
      error: status === "failed" ? "Tiempo de espera agotado al llamar a la herramienta" : undefined,
    };
  });
}

const LONG_URL = "https://panel.clinicasonrisa.example/campanas/2026/otono/landing-promocion-revision-anual-con-descuento-para-pacientes-nuevos-y-antiguos-de-todas-las-sedes?utm_source=newsletter&utm_medium=email&utm_campaign=revision_anual_otono_2026";

const LONG_EVENTS: DemoEvent[] = [
  { id: "l1", kind: "task", actor: "Laura Fernández-de la Cruz y Martínez-Echeverría (Clínica Dental Sonrisa de Valencia, sede Ruzafa)", text: "aprobó el calendario editorial completo del último trimestre de 2026, incluidos los reels, los carruseles, las historias destacadas y la campaña de reseñas", customer: "Asociación Cultural y Deportiva de Antiguos Alumnos del Colegio Mayor Universitario Nuestra Señora de la Esperanza", at: "09:12", day: "Hoy" },
  { id: "l2", kind: "message", actor: "José Ángel Ñandú-Øvergård ✨", text: `compartió el enlace ${LONG_URL}`, customer: "Yoga & Bienestar «Bahía» — ¿Sí? ¡Claro!", at: "08:55", day: "Hoy" },
  { id: "l3", kind: "approval", actor: "山田太郎 (Taller Ruedas Japón)", text: "aprobó «春のキャンペーン — 新しいホームページ»", customer: "株式会社ルエダス", at: "08:40", day: "Hoy" },
  { id: "l4", kind: "message", actor: "مريم الأحمد", text: "كتبت: «هل يمكنكم تعديل الموعد؟» (texto de derecha a izquierda)", customer: "Panadería La Espiga", at: "08:21", day: "Hoy" },
  { id: "l5", kind: "error", actor: "Nora", text: "no pudo enviar: ERR_" + "CONEXION_RECHAZADA_".repeat(8) + "FIN", customer: null, at: "07:30", day: "Hoy" },
  { id: "l6", kind: "cost", actor: "Sistema", text: "el presupuesto de «Agente de cuentas de la clínica dental — Redes sociales — Octubre/Noviembre 2026» llegó al 96 %", customer: "Clínica Dental Sonrisa", at: "07:10", day: "Hoy" },
  { id: "l7", kind: "agent", actor: "Tú", text: "pegaste unas instrucciones de 3.000 caracteres: " + "Siempre responde con cercanía y confirma la hora. ".repeat(6), customer: null, at: "18:30", day: "Ayer" },
  { id: "l8", kind: "task", actor: "Zoë O'Brien-Núñez", text: `entregó «Vídeo "bienvenida" <final> & más»`, customer: "Yoga Bahía", at: "16:20", day: "Ayer" },
];

const LONG_RUNS: DemoRun[] = [
  { id: "lr1", agent: "Marta", title: "Programar las 48 publicaciones del trimestre octubre-diciembre 2026 para las tres sedes, con variantes de texto para cada red social y revisión de enlaces", status: "running", startedAt: "09:05", durationSec: null, costCents: 41, customer: "Asociación Cultural y Deportiva de Antiguos Alumnos del Colegio Mayor Universitario" },
  { id: "lr2", agent: "Nora", title: LONG_URL, status: "failed", startedAt: "02:10", durationSec: 38, costCents: 4, customer: "Panadería La Espiga", error: "Error: " + "credenciales de envío caducadas; ".repeat(10) },
  { id: "lr3", agent: "Diego", title: "春のキャンペーン — 提案書の作成 🌸", status: "done", startedAt: "Ayer 10:02", durationSec: 140, costCents: 9, customer: "株式会社ルエダス" },
];

const LONG_BUDGETS: DemoBudget[] = [
  { id: "lb0", scope: "Empresa", name: "Presupuesto mensual de la empresa Cosmonido Studio Sociedad Limitada Unipersonal (todas las sedes y todos los proyectos)", spentCents: 14210, limitCents: 25000, hardStop: false },
  { id: "lb1", scope: "Agente", name: "Marta (agente de cuentas — clínica dental, panadería, yoga, arquitectura y otros clientes)", spentCents: 4810, limitCents: 5000, hardStop: true, note: "Quedan 4 publicaciones de noviembre por programar para tres clientes distintos." },
  { id: "lb2", scope: "Proyecto", name: "ProyectoConUnNombreSinEspaciosQueNuncaTerminaYDesbordaLaTarjetaSiNoSeCorta_2026", spentCents: 3900, limitCents: 4000, hardStop: false, note: "Aviso al 90 %." },
];

const EXHAUSTED_BUDGETS: DemoBudget[] = [
  { id: "xb0", scope: "Empresa", name: "Presupuesto mensual", spentCents: 25000, limitCents: 25000, hardStop: true, note: "Se agotó el 24 oct. Se renueva el 1 de noviembre." },
  { id: "xb1", scope: "Agente", name: "Marta (agente de cuentas)", spentCents: 5000, limitCents: 5000, hardStop: true, note: "Pausada. Quedan 4 publicaciones sin programar." },
  { id: "xb2", scope: "Agente", name: "Leo (editor de vídeo)", spentCents: 8000, limitCents: 8000, hardStop: true, note: "Pausado. 1 renderizado a medias." },
  { id: "xb3", scope: "Agente", name: "Diego (agente comercial)", spentCents: 6120, limitCents: 6000, hardStop: true, note: "Pausado al superar el límite en 1,20 €." },
  { id: "xb4", scope: "Proyecto", name: "Redes Clínica Sonrisa", spentCents: 4000, limitCents: 4000, hardStop: false },
];

const EXHAUSTED_EVENTS: DemoEvent[] = [
  { id: "x1", kind: "cost", actor: "Sistema", text: "el presupuesto mensual de la empresa llegó al 100 %: los agentes se han pausado", customer: null, at: "09:31", day: "Hoy" },
  { id: "x2", kind: "agent", actor: "Sistema", text: "pausó a Marta, Leo y Diego por presupuesto agotado", customer: null, at: "09:31", day: "Hoy" },
  { id: "x3", kind: "cost", actor: "Sistema", text: "Diego superó su límite en 1,20 € antes de pausarse", customer: "Estudio Arquitectura Norte", at: "09:30", day: "Hoy" },
  ...DEMO_EVENTS,
];

const EXHAUSTED_RUNS: DemoRun[] = [
  { id: "xr1", agent: "Marta", title: "Programar posts de noviembre", status: "paused", startedAt: "09:05", durationSec: null, costCents: 41, customer: "Clínica Dental Sonrisa", error: "Pausada: el presupuesto de Marta se agotó (50,00 €)." },
  { id: "xr2", agent: "Leo", title: "Montar vídeo de bienvenida", status: "paused", startedAt: "08:40", durationSec: null, costCents: 190, customer: "Yoga Bahía", error: "Pausada: el presupuesto de Leo se agotó (80,00 €)." },
  { id: "xr3", agent: "Diego", title: "Preparar propuesta de rediseño", status: "paused", startedAt: "08:50", durationSec: null, costCents: 63, customer: "Estudio Arquitectura Norte", error: "Pausada: el presupuesto de Diego se agotó (60,00 €)." },
  { id: "xr4", agent: "Marta", title: "Revisión semanal de métricas", status: "queued", startedAt: "Programada 18:00", durationSec: null, costCents: 0, customer: null },
  ...DEMO_RUNS.filter((run) => run.status === "done"),
];

const SPIKE_CAUSES: FailureBurst["causes"] = [
  { label: "Credenciales de envío caducadas (Apps → Email)", count: 9, fix: "Reconectar Email" },
  { label: "Límite de peticiones del proveedor de modelos", count: 4, fix: "Esperar 10 min y reintentar" },
  { label: "Tiempo de espera agotado al publicar en Instagram", count: 1, fix: "Reintentar" },
];

function spikeRuns(): DemoRun[] {
  const random = seeded(5);
  const failed: DemoRun[] = SPIKE_CAUSES.flatMap((cause, causeIndex) =>
    Array.from({ length: cause.count }, (_, index) => ({
      id: `sr${causeIndex}-${index}`,
      agent: causeIndex === 0 ? "Nora" : pick(random, AGENT_NAMES),
      title: pick(random, TASKS),
      status: "failed" as const,
      startedAt: `${pad(8)}:${pad(40 + Math.floor(random() * 19))}`,
      durationSec: 3 + Math.floor(random() * 40),
      costCents: Math.floor(random() * 6),
      customer: pick(random, CUSTOMERS),
      error: cause.label,
    })));
  return [...failed, ...DEMO_RUNS.filter((run) => run.status !== "failed")];
}

const SPIKE_EVENTS: DemoEvent[] = [
  { id: "sp1", kind: "error", actor: "Sistema", text: "detectó 14 ejecuciones fallidas en la última hora (lo habitual son 1 o 2)", customer: null, at: "09:36", day: "Hoy" },
  ...Array.from({ length: 6 }, (_, index): DemoEvent => ({ id: `spe${index}`, kind: "error", actor: AGENT_NAMES[index % 4]!, text: `no pudo completar «${TASKS[index]}»`, customer: CUSTOMERS[index % CUSTOMERS.length]!, at: `08:${pad(41 + index * 3)}`, day: "Hoy" })),
  ...DEMO_EVENTS,
];

export function buildActivityData(scenario: ActivityScenario): ActivityData {
  const base: ActivityData = { events: DEMO_EVENTS, runs: DEMO_RUNS, budgets: DEMO_BUDGETS, pausedAgents: [], failureBurst: null, total: DEMO_EVENTS.length };
  switch (scenario) {
    case "empty":
      return { ...base, events: [], runs: [], total: 0 };
    case "many": {
      const events = manyEvents(180);
      return { ...base, events, runs: manyRuns(150), total: 12480 + events.length };
    }
    case "long-text":
      return { ...base, events: [...LONG_EVENTS, ...DEMO_EVENTS.slice(0, 4)], runs: [...LONG_RUNS, ...DEMO_RUNS.slice(3, 5)], budgets: LONG_BUDGETS, total: LONG_EVENTS.length + 4 };
    case "budget-exhausted":
      return { ...base, events: EXHAUSTED_EVENTS, runs: EXHAUSTED_RUNS, budgets: EXHAUSTED_BUDGETS, pausedAgents: ["Marta", "Leo", "Diego"], total: EXHAUSTED_EVENTS.length };
    case "failure-spike":
      return { ...base, events: SPIKE_EVENTS, runs: spikeRuns(), failureBurst: { count: 14, since: "08:40", causes: SPIKE_CAUSES }, total: SPIKE_EVENTS.length };
    default:
      return base;
  }
}

export const RANGE_LABEL = { today: "Hoy", "7d": "7 días", "30d": "30 días", custom: "1–7 sep" } as const;
export type ActivityRange = keyof typeof RANGE_LABEL;
