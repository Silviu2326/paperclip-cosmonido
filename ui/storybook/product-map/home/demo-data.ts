/**
 * Demo data for the Inicio proposal. Mirrors what Dashboard and BusinessHome
 * read today (agents and their runs, task counts, month spend vs budget, run
 * activity, outcome metrics per path and period, recent activity). Agenda and
 * "customers to watch" come from Schedule and the customer portfolio.
 */
export interface DemoAgent {
  name: string;
  role: string;
  status: "running" | "idle" | "paused" | "error";
  task: string | null;
  progress: number;
}

export const DEMO_AGENTS: DemoAgent[] = [
  { name: "Marta", role: "Agente de cuentas", status: "running", task: "Programando posts de noviembre · Clínica Sonrisa", progress: 70 },
  { name: "Diego", role: "Agente comercial", status: "running", task: "Preparando propuesta · Arquitectura Norte", progress: 40 },
  { name: "Leo", role: "Editor de vídeo", status: "idle", task: null, progress: 0 },
  { name: "Nora", role: "Agente de email", status: "error", task: "Newsletter de octubre: fallo de envío", progress: 0 },
];

export const DEMO_METRICS = {
  tasksOpen: 18, tasksBlocked: 2, doneThisWeek: 23, doneLastWeek: 17,
  spendCents: 14210, budgetCents: 25000, recurringCents: 167000,
};

/** Runs per day, last 14 days (oldest first). */
export const DEMO_RUN_ACTIVITY = [6, 9, 7, 12, 4, 3, 11, 14, 10, 13, 15, 5, 4, 16];

export type OutcomePath = "entrepreneur" | "agency" | "commercial";
export const DEMO_OUTCOMES: Record<OutcomePath, { label: string; current: number; previous: number; unit?: "h" | "€" }[]> = {
  entrepreneur: [
    { label: "Encargos creados", current: 31, previous: 24 },
    { label: "Encargos aceptados", current: 27, previous: 20 },
    { label: "Tiempo hasta aceptación", current: 6.4, previous: 9.1, unit: "h" },
    { label: "Coste medio por resultado", current: 3.2, previous: 3.9, unit: "€" },
  ],
  agency: [
    { label: "Encargos aceptados", current: 27, previous: 20 },
    { label: "Solicitudes de corrección", current: 4, previous: 7 },
    { label: "Tiempo hasta aceptación", current: 6.4, previous: 9.1, unit: "h" },
    { label: "Coste medio por resultado", current: 3.2, previous: 3.9, unit: "€" },
  ],
  commercial: [
    { label: "Leads recibidos", current: 42, previous: 35 },
    { label: "Leads convertidos", current: 9, previous: 6 },
    { label: "Reuniones confirmadas", current: 7, previous: 7 },
    { label: "Oportunidades ganadas", current: 3, previous: 1 },
  ],
};

/** Metrics where a lower number is better. */
export const LOWER_IS_BETTER = new Set(["Tiempo hasta aceptación", "Coste medio por resultado", "Solicitudes de corrección"]);

export const DEMO_AGENDA = [
  { time: "10:30", title: "Llamada de seguimiento", with: "Raúl · Taller Ruedas", kind: "call" as const },
  { time: "13:00", title: "Revisión de contenidos", with: "Laura · Clínica Sonrisa", kind: "meeting" as const },
  { time: "17:15", title: "Presentar propuesta", with: "Elena · Arquitectura Norte", kind: "meeting" as const },
];

export const DEMO_ACTIVITY = [
  { who: "Marta", what: "terminó 3 publicaciones de noviembre", when: "hace 12 min", kind: "done" as const },
  { who: "Laura (Clínica Sonrisa)", what: "aprobó el carrusel de blanqueamiento", when: "hace 40 min", kind: "approved" as const },
  { who: "Diego", what: "te hizo una pregunta sobre el precio", when: "hace 1 h", kind: "question" as const },
  { who: "Nora", what: "no pudo enviar la newsletter", when: "hace 7 h", kind: "error" as const },
  { who: "Raúl (Taller Ruedas)", what: "abrió la propuesta por segunda vez", when: "ayer", kind: "view" as const },
];

export const DEMO_ONBOARDING = [
  { id: "agent", title: "Contrata tu primer agente", text: "Elige un rol: cuentas, comercial, contenido…", done: true },
  { id: "customer", title: "Añade un cliente", text: "Empresa o persona para la que trabajas.", done: true },
  { id: "channel", title: "Conecta un canal", text: "Email, WhatsApp o chat web.", done: false },
  { id: "task", title: "Encarga la primera tarea", text: "Pide algo concreto y revisa el resultado.", done: false },
];
