import { createContext } from "react";
import { DEMO_CUSTOMERS, type DemoCustomer } from "../customers/demo-data";
import { LONG_TEXT_CUSTOMERS, makeManyCustomers } from "../customers/scenario-data";
import { DEMO_DECISIONS, type DemoDecision } from "../decisions/demo-data";
import { LONG_TEXT_DECISIONS, makeManyDecisions } from "../decisions/scenario-data";
import {
  DEMO_ACTIVITY,
  DEMO_AGENDA,
  DEMO_AGENTS,
  DEMO_METRICS,
  DEMO_ONBOARDING,
  DEMO_OUTCOMES,
  DEMO_RUN_ACTIVITY,
  type DemoAgent,
} from "./demo-data";

export type ActivityItem = (typeof DEMO_ACTIVITY)[number];
export type AgendaItem = (typeof DEMO_AGENDA)[number];
export interface HomeBanner { tone: "warning" | "risk"; text: string; action: string }

/** Everything Inicio shows, so a scenario is just a different HomeData. */
export interface HomeData {
  agents: DemoAgent[];
  decisions: DemoDecision[];
  metrics: typeof DEMO_METRICS;
  outcomes: typeof DEMO_OUTCOMES;
  runActivity: number[];
  agenda: AgendaItem[];
  watch: DemoCustomer[];
  activity: ActivityItem[];
  onboarding: typeof DEMO_ONBOARDING;
  /** Members without billing access do not see spend or income. */
  canSeeMoney: boolean;
  /** Business results are for owners and admins. */
  canSeeResults: boolean;
  banner: HomeBanner | null;
  /** When set, long lists show this many rows and a "show more" button. */
  pageSize?: number;
}

export const defaultHomeData: HomeData = {
  agents: DEMO_AGENTS,
  decisions: DEMO_DECISIONS,
  metrics: DEMO_METRICS,
  outcomes: DEMO_OUTCOMES,
  runActivity: DEMO_RUN_ACTIVITY,
  agenda: DEMO_AGENDA,
  watch: DEMO_CUSTOMERS.filter((customer) => customer.health !== "good"),
  activity: DEMO_ACTIVITY,
  onboarding: DEMO_ONBOARDING,
  canSeeMoney: true,
  canSeeResults: true,
  banner: null,
};

export const HomeDataContext = createContext<HomeData>(defaultHomeData);

export type HomeState =
  | "normal" | "nueva" | "cargando" | "error" | "muchos" | "textos-largos" | "sin-permisos" | "presupuesto-agotado" | "agente-caido" | "parcial";

const ROLES = ["Agente de cuentas", "Agente comercial", "Editor de vídeo", "Agente de email", "Diseñadora", "Redactor", "Analista de datos", "Soporte"];
const NAMES = ["Iris", "Bruno", "Alba", "Hugo", "Noa", "Teo", "Lola", "Biel", "Mara", "Dani", "Vera", "Leo", "Nico", "Ona", "Pau", "Rita", "Saúl", "Tina", "Unai", "Zoe"];
const TASKS = ["Programando publicaciones de la semana", "Preparando una propuesta comercial", "Editando el vídeo de bienvenida", "Respondiendo conversaciones pendientes", "Revisando el informe mensual", null, null];

function makeAgents(count: number): DemoAgent[] {
  return Array.from({ length: count }, (_, index) => {
    const status: DemoAgent["status"] = index % 9 === 4 ? "error" : index % 7 === 3 ? "paused" : index % 3 === 0 ? "idle" : "running";
    const task = status === "running" ? (TASKS[index % 5] as string) : status === "error" ? "Fallo de conexión: revisar Apps" : null;
    return { name: `${NAMES[index % NAMES.length]}${index >= NAMES.length ? ` ${Math.floor(index / NAMES.length) + 1}` : ""}`, role: ROLES[index % ROLES.length]!, status, task, progress: status === "running" ? 15 + ((index * 17) % 80) : 0 };
  });
}

const ACTIVITY_KINDS: ActivityItem["kind"][] = ["done", "approved", "question", "error", "view"];
function makeActivity(count: number): ActivityItem[] {
  return Array.from({ length: count }, (_, index) => ({
    who: `${NAMES[index % NAMES.length]}`, what: ["terminó una tarea de contenidos", "envió un entregable a revisión", "hizo una pregunta sobre un precio", "no pudo completar una ejecución", "vio la propuesta por segunda vez"][index % 5]!,
    when: index < 3 ? `hace ${5 + index * 9} min` : index < 20 ? `hace ${1 + Math.floor(index / 4)} h` : `hace ${1 + Math.floor(index / 24)} d`, kind: ACTIVITY_KINDS[index % 5]!,
  }));
}

export function buildHomeData(state: HomeState): HomeData {
  const base = defaultHomeData;
  switch (state) {
    case "muchos": {
      const customers = makeManyCustomers(120).filter((customer) => customer.health !== "good").slice(0, 25);
      return { ...base, agents: makeAgents(40), decisions: makeManyDecisions(120), watch: customers, activity: makeActivity(150), pageSize: 6,
        metrics: { ...base.metrics, tasksOpen: 612, tasksBlocked: 38, doneThisWeek: 1180, doneLastWeek: 1022, spendCents: 1_842_000, budgetCents: 2_500_000, recurringCents: 24_850_000 } };
    }
    case "textos-largos":
      return {
        ...base,
        agents: [
          { name: "María del Carmen de los Ángeles Fernández-Villaverde", role: "Agente de relaciones institucionales y desarrollo de negocio internacional", status: "running", task: "Preparando la memoria anual de la Asociación Internacional de Profesionales de la Fisioterapia, la Rehabilitación Deportiva y la Medicina Integrativa de la Comunidad Valenciana", progress: 48 },
          { name: "🥐 Ñandú", role: "Agente de «pan de ayer»", status: "idle", task: null, progress: 0 },
          { name: "مساعد", role: "وكيل خدمة العملاء", status: "error", task: "فشل الاتصال — Falló la conexión con el proveedor de email: ECONNRESET at TLSSocket.onConnectEnd", progress: 0 },
          ...DEMO_AGENTS.slice(0, 2),
        ],
        decisions: LONG_TEXT_DECISIONS, watch: [...LONG_TEXT_CUSTOMERS.slice(0, 3), ...base.watch],
        agenda: [{ time: "10:30", title: "Reunión extraordinaria de la junta directiva para revisar el calendario completo del próximo trimestre", with: "Asociación Internacional de Profesionales de la Fisioterapia, la Rehabilitación Deportiva y la Medicina Integrativa", kind: "meeting" }, ...base.agenda.slice(0, 1)],
        activity: [{ who: "María del Carmen de los Ángeles Fernández-Villaverde", what: "terminó las 24 piezas de la campaña de lanzamiento del nuevo servicio de rehabilitación deportiva para las seis redes sociales y el boletín quincenal de la asociación", when: "hace 12 min", kind: "done" }, ...base.activity.slice(0, 3)],
      };
    case "sin-permisos":
      return { ...base, canSeeMoney: false, canSeeResults: false };
    case "presupuesto-agotado":
      return {
        ...base,
        metrics: { ...base.metrics, spendCents: base.metrics.budgetCents },
        agents: base.agents.map((agent) => agent.status === "running" ? { ...agent, status: "paused" as const, task: `En pausa: ${agent.task ?? ""}`.trim(), progress: agent.progress } : agent),
        banner: { tone: "risk", text: "El presupuesto del mes está agotado (250 € de 250 €). Tu equipo está en pausa hasta que lo amplíes o empiece el mes.", action: "Subir presupuesto" },
      };
    case "agente-caido":
      return {
        ...base,
        agents: base.agents.map((agent) => agent.name === "Nora" ? { ...agent, status: "error" as const, task: "No puede enviar emails: la conexión con Gmail caducó" } : agent),
        banner: { tone: "warning", text: "Nora no puede enviar emails desde hace 7 horas: la conexión con Gmail caducó. La newsletter de La Espiga está bloqueada.", action: "Reconectar Gmail" },
      };
    case "parcial":
      return {
        ...base,
        decisions: [], watch: [], activity: [], agenda: [], outcomes: { entrepreneur: [], agency: [], commercial: [] }, runActivity: Array.from({ length: 14 }, () => 0),
        metrics: { ...base.metrics, tasksOpen: 0, tasksBlocked: 0, doneThisWeek: 0, doneLastWeek: 0, spendCents: 1_200, recurringCents: 0 },
        agents: base.agents.map((agent) => ({ ...agent, status: "idle" as const, task: null, progress: 0 })),
      };
    default:
      return base;
  }
}
