/**
 * Demo data for the Chat con agentes proposal. The conversation mirrors the
 * real agent chat (one continuous issue per agent and user); tasks and
 * artifacts mirror the two panels beside it (AgentWorkPanels). The inline
 * "event" cards (task created, deliverable, approval) come from activity that
 * today is only visible in the task thread, and would be rendered in the chat.
 */
export type DemoAgentStatus = "idle" | "working" | "paused" | "needs-you";

export interface DemoAgent {
  id: string;
  name: string;
  role: string;
  /** Index into the brand agent palette (1–10). */
  color: number;
  status: DemoAgentStatus;
  /** What the agent is doing right now, when working. */
  doing?: string;
  starred?: boolean;
  unread: number;
  lastMessage: string;
  lastAt: string;
}

export type DemoMessage =
  | { id: string; kind: "text"; from: "user" | "agent"; text: string; at: string }
  | { id: string; kind: "task"; title: string; identifier: string; status: "todo" | "in_progress" | "in_review" | "done"; at: string }
  | { id: string; kind: "deliverable"; title: string; fileKind: "doc" | "image" | "video" | "sheet"; meta: string; at: string }
  | { id: string; kind: "approval"; title: string; detail: string; state: "pending" | "approved"; at: string }
  | { id: string; kind: "working"; steps: { label: string; done: boolean }[]; at: string };

export interface DemoTask {
  id: string;
  identifier: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  updated: string;
}

export interface DemoArtifact {
  id: string;
  title: string;
  fileKind: "doc" | "image" | "video" | "sheet";
  meta: string;
  updated: string;
}

export interface DemoConversation {
  agentId: string;
  messages: DemoMessage[];
  tasks: DemoTask[];
  artifacts: DemoArtifact[];
  /** Suggested next prompts for this agent. */
  suggestions: string[];
}

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "a-ceo", name: "Diego", role: "Agente comercial", color: 7, status: "needs-you", starred: true, unread: 1,
    lastMessage: "Necesito tu OK para enviar la propuesta a Clínica Sonrisa.", lastAt: "hace 4 min",
  },
  {
    id: "a-content", name: "Marta", role: "Agente de cuentas", color: 8, status: "working", starred: true, unread: 0,
    doing: "Escribiendo el calendario de octubre", lastMessage: "Voy por el post 9 de 12.", lastAt: "hace 1 min",
  },
  {
    id: "a-accounts", name: "Nora", role: "Agente de email", color: 2, status: "idle", unread: 0,
    lastMessage: "Dejé el resumen semanal en Archivos.", lastAt: "ayer",
  },
  {
    id: "a-design", name: "Leo", role: "Editor de vídeo", color: 10, status: "working", unread: 2,
    doing: "Renderizando el reel de Pastelería Lola", lastMessage: "Primer corte listo para revisar.", lastAt: "hace 12 min",
  },
  {
    id: "a-finance", name: "Álvaro", role: "Facturación", color: 5, status: "paused", unread: 0,
    lastMessage: "Pausado: falta el IBAN de Taller Norte.", lastAt: "hace 2 días",
  },
  {
    id: "a-research", name: "Iris", role: "Investigadora", color: 3, status: "idle", unread: 0,
    lastMessage: "El informe de competencia está terminado.", lastAt: "hace 3 días",
  },
];

export const DEMO_CONVERSATIONS: Record<string, DemoConversation> = {
  "a-ceo": {
    agentId: "a-ceo",
    suggestions: ["¿Cómo va la semana?", "Prepara el resumen para el cliente", "¿Qué necesita mi decisión?"],
    messages: [
      { id: "m1", kind: "text", from: "user", text: "Diego, ¿cómo vamos con la propuesta para la clínica?", at: "10:02" },
      { id: "m2", kind: "text", from: "agent", text: "Está casi lista. He juntado el alcance (redes + newsletter), tres opciones de precio y el calendario del primer mes. Solo falta tu visto bueno.", at: "10:03" },
      { id: "m3", kind: "task", title: "Redactar propuesta para Clínica Dental Sonrisa", identifier: "PAP-142", status: "in_review", at: "10:03" },
      { id: "m4", kind: "deliverable", title: "Propuesta Clínica Sonrisa v2", fileKind: "doc", meta: "Documento · 4 páginas", at: "10:04" },
      { id: "m5", kind: "text", from: "user", text: "Súbele el precio medio un 5 % y mándala.", at: "10:09" },
      { id: "m6", kind: "text", from: "agent", text: "Hecho: el plan medio queda en 620 €/mes. Como es un envío al cliente, necesito que lo apruebes tú.", at: "10:10" },
      { id: "m7", kind: "approval", title: "Enviar propuesta a laura@clinicasonrisa.es", detail: "Plan medio · 620 €/mes · válida 15 días", state: "pending", at: "10:10" },
    ],
    tasks: [
      { id: "t1", identifier: "PAP-142", title: "Redactar propuesta para Clínica Dental Sonrisa", status: "in_review", updated: "hace 4 min" },
      { id: "t2", identifier: "PAP-139", title: "Agenda de reuniones de la semana", status: "done", updated: "ayer" },
      { id: "t3", identifier: "PAP-131", title: "Revisar contratos de servicios recurrentes", status: "in_progress", updated: "hace 2 días" },
      { id: "t4", identifier: "PAP-127", title: "Plan de objetivos del trimestre", status: "todo", updated: "hace 5 días" },
    ],
    artifacts: [
      { id: "f1", title: "Propuesta Clínica Sonrisa v2", fileKind: "doc", meta: "4 páginas", updated: "hace 4 min" },
      { id: "f2", title: "Tarifas 2026", fileKind: "sheet", meta: "3 hojas", updated: "hace 2 días" },
    ],
  },
  "a-content": {
    agentId: "a-content",
    suggestions: ["Enséñame lo que llevas", "Cambia el tono a más cercano", "Añade un post sobre ofertas"],
    messages: [
      { id: "m1", kind: "text", from: "user", text: "Necesito el calendario de contenido de octubre para tres clientes.", at: "09:15" },
      { id: "m2", kind: "text", from: "agent", text: "Perfecto. ¿Mismo tono que en septiembre, cercano y con humor ligero?", at: "09:15" },
      { id: "m3", kind: "text", from: "user", text: "Sí, y que haya 4 reels por cliente.", at: "09:17" },
      { id: "m4", kind: "task", title: "Calendario de contenido de octubre (3 clientes)", identifier: "PAP-150", status: "in_progress", at: "09:18" },
      { id: "m5", kind: "working", at: "09:40", steps: [
        { label: "Leer el contexto de cada cliente", done: true },
        { label: "Proponer temas y fechas", done: true },
        { label: "Redactar los 12 posts", done: false },
        { label: "Revisar tono y enlaces", done: false },
      ] },
    ],
    tasks: [
      { id: "t1", identifier: "PAP-150", title: "Calendario de contenido de octubre (3 clientes)", status: "in_progress", updated: "hace 1 min" },
      { id: "t2", identifier: "PAP-146", title: "Newsletter de otoño para Pastelería Lola", status: "in_review", updated: "ayer" },
      { id: "t3", identifier: "PAP-120", title: "Banco de ideas para reels", status: "done", updated: "hace 4 días" },
    ],
    artifacts: [
      { id: "f1", title: "Borrador calendario octubre", fileKind: "sheet", meta: "9 de 12 posts", updated: "hace 1 min" },
      { id: "f2", title: "Newsletter otoño", fileKind: "doc", meta: "2 páginas", updated: "ayer" },
    ],
  },
  "a-research": {
    agentId: "a-research",
    suggestions: ["Haz un resumen de la semana", "Analiza a un competidor", "¿Qué puedes hacer por mí?"],
    messages: [],
    tasks: [{ id: "t1", identifier: "PAP-118", title: "Informe de competencia del sector dental", status: "done", updated: "hace 3 días" }],
    artifacts: [{ id: "f1", title: "Informe de competencia", fileKind: "doc", meta: "12 páginas", updated: "hace 3 días" }],
  },
  "a-design": {
    agentId: "a-design",
    suggestions: ["Muéstrame el corte", "Prueba con música más suave", "Haz una versión vertical"],
    messages: [
      { id: "m1", kind: "text", from: "user", text: "Monta un reel de 20 s con las fotos de la nueva tarta.", at: "08:50" },
      { id: "m2", kind: "task", title: "Reel de otoño para Pastelería Lola", identifier: "PAP-148", status: "in_progress", at: "08:51" },
      { id: "m3", kind: "text", from: "agent", text: "Primer corte listo. Usé el tono cálido de su marca y subtítulos en pantalla.", at: "09:02" },
      { id: "m4", kind: "deliverable", title: "Reel otoño · corte 1", fileKind: "video", meta: "Vídeo · 0:20 · 1080×1920", at: "09:02" },
    ],
    tasks: [
      { id: "t1", identifier: "PAP-148", title: "Reel de otoño para Pastelería Lola", status: "in_progress", updated: "hace 12 min" },
      { id: "t2", identifier: "PAP-141", title: "Portada de la newsletter", status: "done", updated: "ayer" },
    ],
    artifacts: [
      { id: "f1", title: "Reel otoño · corte 1", fileKind: "video", meta: "0:20", updated: "hace 12 min" },
      { id: "f2", title: "Portada newsletter", fileKind: "image", meta: "1600×900", updated: "ayer" },
    ],
  },
};
