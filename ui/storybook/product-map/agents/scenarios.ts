import { DEMO_TEAM, ROLE_TEMPLATES, type TeamAgent } from "./demo-data";

/** Extra states of the Agentes page, derived from DEMO_TEAM so names stay consistent. */
export type AgentsScenario =
  | "normal"
  | "cargando"
  | "error"
  | "muchos"
  | "textos-largos"
  | "sin-permisos"
  | "pausado-por-presupuesto"
  | "error-con-reintento"
  | "limite-de-plan";

const FIRST = ["Ada", "Bruno", "Clara", "Dario", "Eva", "Fabio", "Gema", "Hugo", "Inés", "Jano", "Kira", "Leo", "Mía", "Nico", "Olga", "Pau", "Quim", "Rita", "Saúl", "Tara"];
const STATUSES: TeamAgent["status"][] = ["running", "running", "idle", "idle", "idle", "paused", "error"];

/** ~160 generated agents in a reporting tree three levels deep. */
export function manyAgents(count = 160): TeamAgent[] {
  const generated = Array.from({ length: count }, (_, index): TeamAgent => {
    const template = ROLE_TEMPLATES[index % ROLE_TEMPLATES.length]!;
    const status = STATUSES[index % STATUSES.length]!;
    const budgetCents = (2000 + (index % 5) * 1000);
    const spentCents = Math.round(budgetCents * (0.15 + ((index * 37) % 80) / 100));
    return {
      id: `g${index}`,
      name: `${FIRST[index % FIRST.length]} ${Math.floor(index / FIRST.length) + 1}`,
      role: template.name,
      accent: template.accent,
      status,
      task: status === "running" ? `Tarea ${100 + index} · ${template.skills[0]}` : null,
      progress: status === "running" ? 10 + ((index * 13) % 85) : 0,
      openTasks: index % 7,
      doneThisWeek: (index * 3) % 14,
      spentCents,
      budgetCents,
      autonomy: (["draft_only", "supervised", "autonomous"] as const)[index % 3]!,
      reportsTo: index < 6 ? null : `g${Math.floor((index - 6) / 4)}`,
      instructions: template.text,
      skills: template.skills,
      permissions: [{ label: "Leer y crear tareas", allowed: true }, { label: "Escribir a clientes", allowed: index % 2 === 0 }],
      activity: [{ text: "Terminó una tarea", when: "hace 1 h", kind: "done" }],
      problem: status === "error" ? "El último intento falló. Revisa la conexión y reintenta." : undefined,
    };
  });
  return [...DEMO_TEAM, ...generated];
}

/** Very long names, roles, tasks and skills, with emoji, accents, CJK and right-to-left text. */
export function longTextAgents(): TeamAgent[] {
  const base = DEMO_TEAM[0]!;
  const make = (id: string, patch: Partial<TeamAgent>): TeamAgent => ({ ...base, id, reportsTo: null, ...patch });
  return [
    make("l1", {
      name: "Maximiliano José de la Santísima Trinidad Fernández-Villaverde",
      role: "Responsable de cuentas estratégicas, relaciones institucionales y atención posventa de clientes corporativos",
      task: "Preparando el informe trimestral consolidado de resultados de todas las sedes, con comparativa interanual y recomendaciones para el comité de dirección",
      skills: ["Planificación estratégica de cuentas clave a medio y largo plazo", "Informes consolidados multi-sede", "Negociación de contratos marco", "Atención posventa"],
      instructions: "Lleva las cuentas corporativas de principio a fin. " + "Siempre confirma los importes y las fechas antes de enviar nada al cliente, y deja constancia por escrito de cada acuerdo en la ficha. ".repeat(3),
    }),
    make("l2", { name: "Müller-Åkesson 🤖", role: "Übersetzer · Traducción técnica DE/EN/ES", accent: 7, status: "idle", task: null, progress: 0 }),
    make("l3", { name: "さくら（桜）", role: "ローカライズ担当 · Localización japonesa", accent: 2, status: "running", task: "ウェブサイトの翻訳 · Traduciendo la web al japonés", progress: 55 }),
    make("l4", { name: "نور الهدى", role: "مسؤولة خدمة العملاء · Atención en árabe", accent: 8, status: "running", task: "الرد على استفسارات العملاء", progress: 30 }),
    make("l5", { name: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", role: "Sin espacios para forzar el desbordamiento", accent: 4, status: "error", task: null, progress: 0, problem: "https://www.un-dominio-larguisimo-sin-espacios.example.com/ruta/muy/larga/que/no/se/puede/partir/en/palabras/nunca" }),
  ];
}

/** Marta ran out of her monthly budget and paused herself. */
export function budgetPausedTeam(): TeamAgent[] {
  return DEMO_TEAM.map((agent) => agent.id === "marta"
    ? { ...agent, status: "paused", pausedBy: "budget", task: null, progress: 0, spentCents: agent.budgetCents, openTasks: 6 }
    : agent);
}
