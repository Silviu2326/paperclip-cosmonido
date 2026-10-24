/**
 * Demo data for the Agentes proposal. Fields follow the real Agent (role,
 * title, status, reportsTo, budgetMonthlyCents, spentMonthlyCents,
 * capabilities, permissions) plus what the page would join in from runs and
 * tasks (current task, open load, recent activity). Names match the Inicio and
 * Decisiones demos.
 */
export type TeamStatus = "running" | "idle" | "paused" | "error";
export type Autonomy = "draft_only" | "supervised" | "autonomous";

export interface TeamAgent {
  id: string;
  name: string;
  role: string;
  /** Brand palette index (1–10) used for the agent's gradient. */
  accent: number;
  status: TeamStatus;
  task: string | null;
  progress: number;
  openTasks: number;
  doneThisWeek: number;
  spentCents: number;
  budgetCents: number;
  autonomy: Autonomy;
  reportsTo: string | null;
  instructions: string;
  skills: string[];
  permissions: { label: string; allowed: boolean }[];
  activity: { text: string; when: string; kind: "done" | "started" | "question" | "error" }[];
  problem?: string;
}

export const AUTONOMY_LABEL: Record<Autonomy, { label: string; hint: string }> = {
  draft_only: { label: "Solo borradores", hint: "Prepara el trabajo; tú lo publicas o envías." },
  supervised: { label: "Con tu visto bueno", hint: "Actúa, pero te pide aprobación antes de lo importante." },
  autonomous: { label: "Autónomo", hint: "Actúa solo dentro de sus límites y te avisa después." },
};

export const DEMO_TEAM: TeamAgent[] = [
  {
    id: "marta", name: "Marta", role: "Agente de cuentas", accent: 5, status: "running",
    task: "Programando posts de noviembre · Clínica Sonrisa", progress: 70, openTasks: 6, doneThisWeek: 11,
    spentCents: 4810, budgetCents: 5000, autonomy: "supervised", reportsTo: null,
    instructions: "Lleva la relación diaria con los clientes de redes: planifica el calendario, prepara las publicaciones y resuelve dudas. Tono cercano, sin tecnicismos. Nunca publica sin aprobación.",
    skills: ["Calendario editorial", "Redacción para redes", "Atención al cliente", "Informes mensuales"],
    permissions: [
      { label: "Leer y crear tareas", allowed: true }, { label: "Escribir a clientes", allowed: true },
      { label: "Publicar en redes", allowed: false }, { label: "Gastar por encima del presupuesto", allowed: false },
    ],
    activity: [
      { text: "Terminó 3 publicaciones de noviembre", when: "hace 12 min", kind: "done" },
      { text: "Pidió tu aprobación para publicar 4 posts", when: "ayer", kind: "question" },
      { text: "Empezó el calendario de noviembre", when: "ayer", kind: "started" },
    ],
  },
  {
    id: "diego", name: "Diego", role: "Agente comercial", accent: 9, status: "running",
    task: "Preparando propuesta · Arquitectura Norte", progress: 40, openTasks: 3, doneThisWeek: 5,
    spentCents: 2290, budgetCents: 6000, autonomy: "supervised", reportsTo: null,
    instructions: "Cualifica leads, prepara propuestas y hace seguimiento. Siempre pregunta el precio final antes de enviar. Registra cada contacto en el cliente.",
    skills: ["Cualificación de leads", "Propuestas", "Seguimiento", "CRM"],
    permissions: [
      { label: "Leer y crear tareas", allowed: true }, { label: "Escribir a clientes", allowed: true },
      { label: "Enviar propuestas", allowed: false }, { label: "Editar precios", allowed: false },
    ],
    activity: [
      { text: "Te hizo una pregunta sobre el precio", when: "hace 1 h", kind: "question" },
      { text: "Empezó la propuesta de Arquitectura Norte", when: "hace 3 h", kind: "started" },
      { text: "Cualificó 4 leads nuevos", when: "ayer", kind: "done" },
    ],
  },
  {
    id: "leo", name: "Leo", role: "Editor de vídeo", accent: 7, status: "idle",
    task: null, progress: 0, openTasks: 1, doneThisWeek: 3,
    spentCents: 1640, budgetCents: 4000, autonomy: "draft_only", reportsTo: "marta",
    instructions: "Edita vídeos verticales para redes: cortes, subtítulos y música con licencia. Entrega siempre una versión de prueba.",
    skills: ["Edición vertical", "Subtítulos", "Música con licencia"],
    permissions: [
      { label: "Leer archivos de la empresa", allowed: true }, { label: "Crear entregables", allowed: true },
      { label: "Escribir a clientes", allowed: false }, { label: "Publicar", allowed: false },
    ],
    activity: [
      { text: "Entregó el vídeo de bienvenida de Yoga Bahía", when: "hace 2 d", kind: "done" },
      { text: "Esperando la revisión de Silviu", when: "hace 2 d", kind: "question" },
    ],
  },
  {
    id: "nora", name: "Nora", role: "Agente de email", accent: 8, status: "error",
    task: "Newsletter de octubre: fallo de envío", progress: 0, openTasks: 2, doneThisWeek: 4,
    spentCents: 920, budgetCents: 2500, autonomy: "autonomous", reportsTo: "marta",
    instructions: "Redacta y envía newsletters. Revisa la lista antes de cada envío y reporta rebotes. Si el envío falla, para y avisa.",
    skills: ["Newsletters", "Segmentación", "Informes de apertura"],
    permissions: [
      { label: "Enviar email a listas", allowed: true }, { label: "Leer contactos", allowed: true },
      { label: "Editar listas", allowed: false }, { label: "Gastar por encima del presupuesto", allowed: false },
    ],
    activity: [
      { text: "No pudo enviar la newsletter (credenciales caducadas)", when: "hace 7 h", kind: "error" },
      { text: "Preparó la newsletter de octubre", when: "ayer", kind: "done" },
    ],
    problem: "Las credenciales de envío caducaron. Reconéctalas en Apps → Email.",
  },
  {
    id: "iris", name: "Iris", role: "Investigadora", accent: 2, status: "paused",
    task: null, progress: 0, openTasks: 0, doneThisWeek: 1,
    spentCents: 300, budgetCents: 2000, autonomy: "draft_only", reportsTo: "diego",
    instructions: "Investiga competidores y mercados y resume en una página. Cita siempre las fuentes.",
    skills: ["Investigación de mercado", "Resúmenes"],
    permissions: [{ label: "Navegar por la web", allowed: true }, { label: "Crear entregables", allowed: true }, { label: "Escribir a clientes", allowed: false }],
    activity: [{ text: "Pausada por ti hasta el lunes", when: "hace 3 d", kind: "started" }],
  },
];

export interface RoleTemplate {
  id: string;
  name: string;
  text: string;
  /** Rough monthly cost, to set expectations. */
  monthlyEuros: number;
  accent: number;
  skills: string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { id: "accounts", name: "Agente de cuentas", text: "Lleva el día a día con tus clientes.", monthlyEuros: 50, accent: 5, skills: ["Atención al cliente", "Calendario editorial"] },
  { id: "sales", name: "Agente comercial", text: "Cualifica leads y prepara propuestas.", monthlyEuros: 60, accent: 9, skills: ["Leads", "Propuestas"] },
  { id: "content", name: "Creador de contenido", text: "Textos, carruseles y posts.", monthlyEuros: 40, accent: 10, skills: ["Redacción", "Diseño de carruseles"] },
  { id: "video", name: "Editor de vídeo", text: "Cortes, subtítulos y música.", monthlyEuros: 40, accent: 7, skills: ["Edición vertical", "Subtítulos"] },
  { id: "email", name: "Agente de email", text: "Newsletters y secuencias.", monthlyEuros: 25, accent: 8, skills: ["Newsletters", "Segmentación"] },
  { id: "research", name: "Investigador", text: "Mercado, competidores y resúmenes.", monthlyEuros: 20, accent: 2, skills: ["Investigación", "Resúmenes"] },
];
