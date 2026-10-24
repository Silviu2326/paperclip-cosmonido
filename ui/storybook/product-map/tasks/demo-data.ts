import type { IssuePriority, IssueStatus, ProjectStatus } from "@paperclipai/shared";

/**
 * Demo data for the Tareas and Proyectos proposals. Fields mirror the real
 * Issue (status, priority, assignee, project, customer via project, dates) and
 * Project (status, lead agent, customer, target date). Same customers, agents
 * and PAP-xxx tasks as the Clientes, Decisiones and Inicio proposals.
 * `unread`, `mine`, `result` and `thread` are proposal-only conveniences: the
 * real app derives them from inbox state, comments and work products.
 */
export interface DemoMessage {
  id: string;
  from: string;
  fromKind: "agent" | "human";
  text: string;
  at: string;
}

export interface DemoDependency { identifier: string; title: string; status: IssueStatus; assignee: string | null }
export interface DemoRun { agent: string; startedAt: string; step: string; stepIndex: number; steps: number; costCents: number; logs: string[] }
export interface DemoReview { requestedBy: string; summary: string; checklist: { text: string; ok: boolean }[] }

export interface DemoTask {
  id: string;
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string | null;
  projectId: string | null;
  customer: string | null;
  dueDate: string | null;
  updatedAt: string;
  mine: boolean;
  unread: boolean;
  description: string;
  result: { title: string; kind: "document" | "video" | "email" | "link"; note: string } | null;
  thread: DemoMessage[];
  /** Tasks (or decisions) this one waits for. Real issues have blockers; shown here in the detail. */
  blockedBy?: DemoDependency[];
  /** Live execution of an agent on this task: current step, cost and the log tail. */
  run?: DemoRun;
  /** What the reviewer has to check before approving. */
  review?: DemoReview;
}

export interface DemoProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  customer: string | null;
  lead: string | null;
  agents: string[];
  targetDate: string | null;
  /** Brand palette index (1–10) for the card accent. */
  color: number;
  startDate?: string | null;
  /** Budget for the project and what it has cost so far (proposal-only aggregate). */
  budgetCents?: number;
  spentCents?: number;
  archived?: boolean;
}

export const DEMO_PROJECTS: DemoProject[] = [
  { id: "pj1", name: "Redes Clínica Sonrisa", description: "Calendario mensual, publicaciones y campañas de la clínica.", status: "in_progress", customer: "Clínica Dental Sonrisa", lead: "Marta", agents: ["Marta", "Leo"], targetDate: "2026-11-30", color: 7, startDate: "2026-09-01", budgetCents: 90000, spentCents: 61200 },
  { id: "pj2", name: "Rediseño de portfolio", description: "Nueva web con proyectos, blog y SEO inicial.", status: "planned", customer: "Estudio Arquitectura Norte", lead: "Diego", agents: ["Diego"], targetDate: "2026-12-15", color: 2, startDate: "2026-10-15", budgetCents: 60000, spentCents: 4800 },
  { id: "pj3", name: "Instagram Yoga Bahía", description: "Vídeos y publicaciones semanales para la comunidad.", status: "in_progress", customer: "Yoga Bahía", lead: "Leo", agents: ["Leo", "Marta"], targetDate: "2026-11-20", color: 8, startDate: "2026-10-01", budgetCents: 40000, spentCents: 22100 },
  { id: "pj4", name: "Newsletter La Espiga", description: "Envío mensual a los 312 suscriptores.", status: "in_progress", customer: "Panadería La Espiga", lead: "Nora", agents: ["Nora"], targetDate: null, color: 10, startDate: "2026-06-01", budgetCents: 12000, spentCents: 7300 },
  { id: "pj5", name: "Curso online de Lucía", description: "Guion, grabación y edición del curso.", status: "backlog", customer: "Lucía Martín", lead: null, agents: [], targetDate: "2027-02-01", color: 3, startDate: "2026-12-01", budgetCents: 150000, spentCents: 0 },
  { id: "pj6", name: "Procesos internos", description: "Plantillas, rutinas y mejoras del propio negocio.", status: "in_progress", customer: null, lead: "Marta", agents: ["Marta", "Diego"], targetDate: null, color: 5, startDate: "2026-01-10", budgetCents: 30000, spentCents: 17400 },
  { id: "pj7", name: "Campaña de verano 2026", description: "Promoción de verano de la clínica. Cerrada y archivada.", status: "completed", customer: "Clínica Dental Sonrisa", lead: "Marta", agents: ["Marta"], targetDate: "2026-08-31", color: 4, startDate: "2026-06-15", budgetCents: 35000, spentCents: 31900, archived: true },
  { id: "pj8", name: "Web antigua de La Espiga", description: "Sustituida por la nueva ficha de Google y la newsletter.", status: "cancelled", customer: "Panadería La Espiga", lead: null, agents: [], targetDate: null, color: 6, startDate: "2025-11-01", budgetCents: 20000, spentCents: 5200, archived: true },
];

const msg = (id: string, from: string, fromKind: DemoMessage["fromKind"], text: string, at: string): DemoMessage => ({ id, from, fromKind, text, at });

export const DEMO_TASKS: DemoTask[] = [
  {
    id: "t1", identifier: "PAP-412", title: "Calendario de noviembre", status: "in_review", priority: "high", assignee: "Marta", projectId: "pj1", customer: "Clínica Dental Sonrisa",
    dueDate: "2026-10-25", updatedAt: "hace 1 h", mine: true, unread: true,
    description: "Preparar y programar las 4 publicaciones de noviembre con su copy y creatividades.",
    result: { title: "Calendario de noviembre (4 posts)", kind: "document", note: "Pendiente de tu aprobación para publicar." },
    thread: [
      msg("m1", "Tú", "human", "Quiero que el primero sea el de blanqueamiento y que nombre a la Dra. Gómez.", "ayer 18:02"),
      msg("m2", "Marta", "agent", "Hecho. He ordenado: blanqueamiento, equipo, mitos de ortodoncia y promoción de revisión anual. ¿Los aprobamos juntos?", "hoy 07:10"),
    ],
    review: {
      requestedBy: "Marta",
      summary: "4 publicaciones listas para programar el lunes 27 a las 10:00.",
      checklist: [
        { text: "El texto no promete resultados médicos", ok: true },
        { text: "Aparece el nombre y cargo correctos de la Dra. Gómez", ok: true },
        { text: "Las imágenes tienen permiso de uso de la clínica", ok: false },
        { text: "Las fechas no chocan con la promoción de Black Friday", ok: true },
      ],
    },
  },
  {
    id: "t2", identifier: "PAP-418", title: "Propuesta de rediseño de portfolio", status: "blocked", priority: "high", assignee: "Diego", projectId: "pj2", customer: "Estudio Arquitectura Norte",
    dueDate: "2026-10-27", updatedAt: "hace 3 h", mine: true, unread: true,
    description: "Enviar la propuesta con tres opciones de alcance y precio.",
    result: null,
    thread: [
      msg("m3", "Diego", "agent", "Estoy bloqueado: necesito que elijas el precio (3.200, 3.800 o 4.500 €) antes de enviarla.", "hoy 06:40"),
    ],
    blockedBy: [
      { identifier: "PAP-417", title: "Aprobar el alcance de la sesión de fotos", status: "in_review", assignee: "Leo" },
      { identifier: "PAP-419", title: "Pedir el logotipo vectorial al cliente", status: "todo", assignee: "Diego" },
    ],
  },
  {
    id: "t3", identifier: "PAP-399", title: "Vídeo de bienvenida", status: "in_review", priority: "medium", assignee: "Leo", projectId: "pj3", customer: "Yoga Bahía",
    dueDate: "2026-10-26", updatedAt: "ayer", mine: true, unread: false,
    description: "Vídeo vertical de bienvenida para nuevos alumnos.",
    result: { title: "bienvenida-final.mp4", kind: "video", note: "38 s · subtítulos en español · música con licencia." },
    thread: [msg("m4", "Leo", "agent", "Listo para revisión. La música tiene licencia comercial.", "ayer 16:20")],
  },
  {
    id: "t4", identifier: "PAP-405", title: "Newsletter de octubre", status: "blocked", priority: "critical", assignee: "Nora", projectId: "pj4", customer: "Panadería La Espiga",
    dueDate: "2026-10-24", updatedAt: "hace 7 h", mine: false, unread: true,
    description: "Enviar la newsletter del mes a 312 suscriptores.",
    result: null,
    thread: [msg("m5", "Nora", "agent", "El proveedor rechazó la conexión (credenciales caducadas). Hay que renovarlas en Apps → Email.", "hoy 02:14")],
  },
  {
    id: "t5", identifier: "PAP-421", title: "Carrusel semanal de LinkedIn", status: "in_progress", priority: "medium", assignee: "Marta", projectId: null, customer: "Lucía Martín",
    dueDate: "2026-10-28", updatedAt: "hace 20 min", mine: false, unread: false,
    description: "Carrusel de 8 diapositivas sobre hábitos de coaching.",
    result: null,
    thread: [msg("m6", "Marta", "agent", "Voy por la diapositiva 5. Te lo paso para revisar esta tarde.", "hoy 08:45")],
    run: {
      agent: "Marta", startedAt: "08:31", step: "Maquetando la diapositiva 5 de 8", stepIndex: 5, steps: 8, costCents: 38,
      logs: [
        "Leyendo el brief de Lucía y sus 3 últimos carruseles",
        "Elegida la idea: «3 hábitos que sostienen un cambio»",
        "Escrito el guion de las 8 diapositivas",
        "Generadas las ilustraciones con la paleta de marca",
        "Maquetadas las diapositivas 1 a 4",
        "Maquetando la diapositiva 5: texto y contraste",
      ],
    },
  },
  {
    id: "t6", identifier: "PAP-423", title: "Ficha de Google y reseñas", status: "todo", priority: "medium", assignee: "Diego", projectId: null, customer: "Taller Mecánico Ruedas",
    dueDate: "2026-11-02", updatedAt: "ayer", mine: false, unread: false,
    description: "Optimizar la ficha y pedir reseñas a clientes recientes.",
    result: null, thread: [],
  },
  {
    id: "t7", identifier: "PAP-427", title: "Plantilla de informe mensual", status: "todo", priority: "low", assignee: null, projectId: "pj6", customer: null,
    dueDate: null, updatedAt: "hace 2 días", mine: true, unread: false,
    description: "Crear una plantilla común para el informe de resultados de cada cliente.",
    result: null, thread: [],
  },
  {
    id: "t8", identifier: "PAP-430", title: "Guion del primer módulo del curso", status: "backlog", priority: "low", assignee: null, projectId: "pj5", customer: "Lucía Martín",
    dueDate: null, updatedAt: "hace 4 días", mine: false, unread: false,
    description: "Escribir el guion del módulo de introducción.",
    result: null, thread: [],
  },
  {
    id: "t9", identifier: "PAP-408", title: "Reel «Conoce al equipo»", status: "done", priority: "medium", assignee: "Leo", projectId: "pj1", customer: "Clínica Dental Sonrisa",
    dueDate: "2026-10-20", updatedAt: "hace 3 días", mine: false, unread: false,
    description: "Reel de 20 s presentando a la Dra. Gómez.",
    result: { title: "reel-equipo.mp4", kind: "video", note: "Publicado el 21 de octubre. 1.240 visualizaciones." },
    thread: [msg("m7", "Leo", "agent", "Publicado. Lleva 1.240 visualizaciones.", "hace 3 días")],
  },
  {
    id: "t10", identifier: "PAP-402", title: "Ajustes del mantenimiento web", status: "in_progress", priority: "low", assignee: "Diego", projectId: "pj2", customer: "Estudio Arquitectura Norte",
    dueDate: null, updatedAt: "hace 5 h", mine: false, unread: false,
    description: "Actualizar plugins y revisar copias de seguridad.",
    result: null, thread: [],
  },
];

export const STATUS_ORDER: IssueStatus[] = ["blocked", "in_review", "in_progress", "todo", "backlog", "done", "cancelled"];
export const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "Pendiente", todo: "Por hacer", in_progress: "En curso", in_review: "En revisión", done: "Hecha", blocked: "Bloqueada", cancelled: "Cancelada",
};
export const PRIORITY_LABEL: Record<IssuePriority, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  backlog: "En espera", planned: "Planificado", in_progress: "En curso", completed: "Completado", cancelled: "Cancelado",
};

/** Progress of a project = done tasks over all non-cancelled tasks. */
export function projectProgress(projectId: string, tasks: DemoTask[]): { done: number; total: number; open: number; blocked: number; percent: number } {
  const own = tasks.filter((task) => task.projectId === projectId && task.status !== "cancelled");
  const done = own.filter((task) => task.status === "done").length;
  return { done, total: own.length, open: own.length - done, blocked: own.filter((task) => task.status === "blocked").length, percent: own.length ? Math.round((done / own.length) * 100) : 0 };
}
