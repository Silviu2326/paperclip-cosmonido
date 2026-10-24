import type { IssuePriority, IssueStatus } from "@paperclipai/shared";
import { DEMO_PROJECTS, DEMO_TASKS, type DemoProject, type DemoTask } from "./demo-data";

/** Deterministic pseudo-random numbers so "lots of data" looks the same on every load. */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const AGENTS = ["Marta", "Diego", "Leo", "Nora", null];
const CUSTOMERS = ["Clínica Dental Sonrisa", "Panadería La Espiga", "Estudio Arquitectura Norte", "Lucía Martín", "Taller Mecánico Ruedas", "Yoga Bahía", null];
const VERBS = ["Publicar", "Revisar", "Preparar", "Enviar", "Programar", "Redactar", "Optimizar", "Medir"];
const THINGS = ["el carrusel de", "la newsletter de", "el informe de", "la propuesta de", "el reel de", "los textos de", "la campaña de", "la ficha de"];
const TOPICS = ["octubre", "Navidad", "Black Friday", "la web", "reseñas", "ortodoncia", "el curso", "la cuenta de Instagram", "bienvenida", "el catálogo"];
const STATUSES: IssueStatus[] = ["todo", "todo", "in_progress", "in_progress", "in_review", "blocked", "backlog", "backlog", "done", "done", "done"];
const PRIORITIES: IssuePriority[] = ["low", "medium", "medium", "high", "critical"];

/** About 180 tasks across the demo projects, to test grouping, "show more" and scrolling. */
export function manyTasks(count = 180): DemoTask[] {
  const random = seeded(7);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const open = DEMO_PROJECTS.filter((candidate) => !candidate.archived);
  return Array.from({ length: count }, (_, index) => {
    const status = pick(STATUSES);
    const project = random() < 0.7 ? pick(open) : null;
    return {
      id: `many-${index}`,
      identifier: `PAP-${500 + index}`,
      title: `${pick(VERBS)} ${pick(THINGS)} ${pick(TOPICS)}`,
      status,
      priority: pick(PRIORITIES),
      assignee: pick(AGENTS),
      projectId: project?.id ?? null,
      customer: project?.customer ?? pick(CUSTOMERS),
      dueDate: random() < 0.6 ? `2026-1${random() < 0.5 ? 0 : 1}-${String(10 + Math.floor(random() * 18)).padStart(2, "0")}` : null,
      updatedAt: `hace ${1 + Math.floor(random() * 20)} h`,
      mine: random() < 0.3,
      unread: random() < 0.15,
      description: "Tarea generada para probar el rendimiento y la agrupación con muchos elementos.",
      result: null,
      thread: [],
    } satisfies DemoTask;
  });
}

/** The ten real demo tasks first, so the story still looks familiar, then the generated ones. */
export const MANY_TASKS: DemoTask[] = [...DEMO_TASKS, ...manyTasks()];

const LONG_URL = "https://www.ejemplo-de-un-cliente-con-un-dominio-larguisimo.com/ruta/sin/espacios/que/no/se/puede/partir/jamas?utm_source=newsletter&utm_campaign=octubre-2026";

/** Very long titles, long customer names, other alphabets, emoji and an unbreakable URL. */
export const LONG_TASKS: DemoTask[] = [
  { ...DEMO_TASKS[0]!, id: "l1", identifier: "PAP-9001", title: "Revisar y aprobar la versión definitiva del contrato marco de servicios de comunicación y marketing digital para el ejercicio 2027, incluidos los anexos legales y las condiciones de renovación automática", customer: "Asociación de Propietarios y Vecinos del Polígono Industrial «Las Encinas de Arriba» y Comarca", description: "Texto de descripción muy largo. ".repeat(12) },
  { ...DEMO_TASKS[1]!, id: "l2", identifier: "PAP-9002", title: "Ñandú & Hijos, S.L. — 清洁服务 (限时优惠) 🧹✨ ¿¡Presupuesto urgente!?", customer: "Ñandú & Hijos, S.L.", description: "Cliente con caracteres especiales: ñ, ü, ç, 汉字, emoji 🧹 y símbolos & < > \" '." },
  { ...DEMO_TASKS[2]!, id: "l3", identifier: "PAP-9003", title: "مراجعة قائمة الطعام الجديدة لمقهى النخيل قبل الطباعة", customer: "مقهى النخيل", description: "Texto en árabe (de derecha a izquierda) mezclado con español: revisar la carta." },
  { ...DEMO_TASKS[3]!, id: "l4", identifier: "PAP-9004", title: LONG_URL, customer: "dominio-larguisimo.com", description: LONG_URL },
  { ...DEMO_TASKS[4]!, id: "l5", identifier: "PAP-9005", title: "Hola", customer: "X", assignee: null, description: "Título de una sola palabra y cliente de una letra." },
  { ...DEMO_TASKS[5]!, id: "l6", identifier: "PAP-9006", title: "Tarea de un proyecto con nombre larguísimo y sin cliente asignado todavía", customer: null, projectId: "pj-long", description: "" },
  { ...DEMO_TASKS[6]!, id: "l7", identifier: "PAP-9007", title: "Llamada con el Sr. D. José María de la Concepción Fernández-Villaescusa y Martínez de Zúñiga", customer: "Fernández-Villaescusa e Hijos Asesores Fiscales y Contables", description: "" },
];

export const LONG_PROJECTS: DemoProject[] = [
  { id: "pj-long", name: "Programa integral de transformación digital, comunicación y captación de socios del Polígono Industrial «Las Encinas de Arriba» y Comarca 2026–2028", description: "Descripción muy larga. ".repeat(14), status: "in_progress", customer: "Asociación de Propietarios y Vecinos del Polígono Industrial «Las Encinas de Arriba» y Comarca", lead: "Marta", agents: ["Marta", "Diego", "Leo", "Nora", "Iris", "Álvaro"], targetDate: "2028-12-31", color: 6, startDate: "2026-02-01", budgetCents: 9000000, spentCents: 3120000 },
  { id: "pj-cjk", name: "清洁服务官网改版 · Ñandú & Hijos 🧹", description: "Proyecto con caracteres de otro alfabeto y emoji.", status: "planned", customer: "Ñandú & Hijos, S.L.", lead: null, agents: [], targetDate: null, color: 2, startDate: null },
  { id: "pj-url", name: LONG_URL, description: LONG_URL, status: "backlog", customer: "dominio-larguisimo.com", lead: "Leo", agents: ["Leo"], targetDate: "2027-03-01", color: 8, startDate: "2026-12-01", budgetCents: 100, spentCents: 0 },
  ...DEMO_PROJECTS.slice(0, 2),
];

const PROJECT_WORDS = ["Redes", "Web", "Newsletter", "Vídeo", "Campaña", "SEO", "Reseñas", "Informe"];
const PROJECT_CLIENTS = ["Clínica Dental Sonrisa", "Panadería La Espiga", "Estudio Arquitectura Norte", "Lucía Martín", "Taller Mecánico Ruedas", "Yoga Bahía", "Gimnasio Fuerte", "Academia Ibáñez", "Carolina Bravo", null];
const PROJECT_STATUSES: DemoProject["status"][] = ["in_progress", "in_progress", "in_progress", "planned", "backlog", "completed"];

/** 64 projects, to test search, filters and "show more". */
export function manyProjects(count = 64): DemoProject[] {
  const random = seeded(11);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  return Array.from({ length: count }, (_, index) => {
    const customer = pick(PROJECT_CLIENTS);
    const status = pick(PROJECT_STATUSES);
    const budget = 20000 + Math.floor(random() * 15) * 10000;
    return {
      id: `mp-${index}`,
      name: `${pick(PROJECT_WORDS)} ${customer ?? "interno"} ${2026 + (index % 2)}`,
      description: "Proyecto generado para probar listas largas.",
      status,
      customer,
      lead: pick(["Marta", "Diego", "Leo", "Nora", null]),
      agents: ["Marta", "Diego", "Leo", "Nora"].slice(0, 1 + Math.floor(random() * 4)),
      targetDate: random() < 0.75 ? `2026-1${1 + Math.floor(random() * 2)}-${String(5 + Math.floor(random() * 22)).padStart(2, "0")}` : null,
      color: 1 + Math.floor(random() * 10),
      startDate: `2026-0${3 + Math.floor(random() * 6)}-01`,
      budgetCents: budget,
      spentCents: Math.floor(budget * random() * 0.95),
      archived: status === "completed" && random() < 0.5,
    } satisfies DemoProject;
  });
}
export const MANY_PROJECTS: DemoProject[] = [...DEMO_PROJECTS.filter((project) => !project.archived), ...manyProjects()];
