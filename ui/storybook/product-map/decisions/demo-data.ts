import type { AttentionSeverity, AttentionSourceKind } from "@paperclipai/shared";

/**
 * Demo data for the Decisiones proposal. Shape follows the real AttentionItem
 * (sourceKind, severity, whyNow, decision verbs, origin agent, related task
 * and project, decideBy). `preview` and `bundle` are proposal-only: the real
 * item links to the source instead of embedding it.
 */
export type DemoVerb = "approve" | "reject" | "answer" | "review" | "retry" | "raise_budget" | "accept";

export interface DemoDecision {
  id: string;
  sourceKind: AttentionSourceKind;
  severity: AttentionSeverity;
  title: string;
  whyNow: string;
  verbs: DemoVerb[];
  agent: string | null;
  task: string | null;
  project: string | null;
  customer: string | null;
  createdAt: string;
  decideBy: string | null;
  preview?: { kind: "text" | "options" | "budget" | "list"; lines: string[] };
  bundle?: number;
}

export const DEMO_DECISIONS: DemoDecision[] = [
  {
    id: "d1", sourceKind: "budget_alert", severity: "critical", title: "Presupuesto de Marta al 96 %",
    whyNow: "Si llega al 100 % se pausará y quedan 4 publicaciones de noviembre por programar.",
    verbs: ["raise_budget", "reject"], agent: "Marta (agente de cuentas)", task: null, project: "Redes Clínica Sonrisa", customer: "Clínica Dental Sonrisa",
    createdAt: "2026-10-24T07:10:00Z", decideBy: "2026-10-24T18:00:00Z",
    preview: { kind: "budget", lines: ["Gastado 48,10 € de 50 € este mes", "Propuesta: subir a 70 € solo en noviembre"] },
  },
  {
    id: "d2", sourceKind: "approval", severity: "high", title: "Publicar 4 posts de noviembre",
    whyNow: "Marta los ha preparado y la clínica quiere empezar el lunes.",
    verbs: ["approve", "reject"], agent: "Marta (agente de cuentas)", task: "PAP-412 Calendario de noviembre", project: "Redes Clínica Sonrisa", customer: "Clínica Dental Sonrisa",
    createdAt: "2026-10-23T17:40:00Z", decideBy: "2026-10-25T09:00:00Z", bundle: 4,
    preview: { kind: "list", lines: ["Blanqueamiento sin miedo (carrusel)", "Conoce al equipo: Dra. Gómez (reel)", "Mitos de la ortodoncia (carrusel)", "Promoción revisión anual (post)"] },
  },
  {
    id: "d3", sourceKind: "issue_thread_interaction", severity: "high", title: "¿Qué precio ponemos a la web de Arquitectura Norte?",
    whyNow: "Diego tiene la propuesta lista y espera tu respuesta para enviarla.",
    verbs: ["answer"], agent: "Diego (agente comercial)", task: "PAP-418 Propuesta rediseño portfolio", project: null, customer: "Estudio Arquitectura Norte",
    createdAt: "2026-10-23T12:05:00Z", decideBy: null,
    preview: { kind: "options", lines: ["3.200 € — alcance básico, 4 semanas", "3.800 € — con blog y SEO inicial (recomendada)", "4.500 € — incluye sesión de fotos"] },
  },
  {
    id: "d4", sourceKind: "review", severity: "medium", title: "Revisar el vídeo de bienvenida de Yoga Bahía",
    whyNow: "Es el primer entregable del servicio; la clienta lo verá después de tu visto bueno.",
    verbs: ["review"], agent: "Leo (editor de vídeo)", task: "PAP-399 Vídeo de bienvenida", project: "Instagram Yoga Bahía", customer: "Yoga Bahía",
    createdAt: "2026-10-22T16:20:00Z", decideBy: "2026-10-26T12:00:00Z",
    preview: { kind: "text", lines: ["Vídeo vertical de 38 s · subtítulos en español · música con licencia"] },
  },
  {
    id: "d5", sourceKind: "failed_run", severity: "medium", title: "La newsletter de La Espiga no se envió",
    whyNow: "El proveedor de email rechazó la conexión anoche; los 312 suscriptores no la han recibido.",
    verbs: ["retry"], agent: "Nora (agente de email)", task: "PAP-405 Newsletter de octubre", project: null, customer: "Panadería La Espiga",
    createdAt: "2026-10-24T02:14:00Z", decideBy: null,
    preview: { kind: "text", lines: ["Error: credenciales de envío caducadas (Apps → Email)"] },
  },
  {
    id: "d6", sourceKind: "join_request", severity: "low", title: "Pablo Ortega pide acceso a la empresa",
    whyNow: "Es contacto de Estudio Arquitectura Norte y quiere ver el avance del portfolio.",
    verbs: ["accept", "reject"], agent: null, task: null, project: null, customer: "Estudio Arquitectura Norte",
    createdAt: "2026-10-21T09:30:00Z", decideBy: null,
  },
  {
    id: "d7", sourceKind: "decision", severity: "low", title: "¿Contratamos un agente de atención por WhatsApp?",
    whyNow: "Las conversaciones sin responder subieron un 40 % esta semana.",
    verbs: ["approve", "reject"], agent: "Sistema", task: null, project: null, customer: null,
    createdAt: "2026-10-20T10:00:00Z", decideBy: null,
    preview: { kind: "text", lines: ["Coste estimado: 18 €/mes · responde en menos de 2 min · deriva a ti lo que no sabe"] },
  },
];

export const DEMO_DECIDED: { id: string; title: string; outcome: "approved" | "rejected" | "answered"; at: string }[] = [
  { id: "x1", title: "Aprobar propuesta para Taller Ruedas", outcome: "approved", at: "hace 2 h" },
  { id: "x2", title: "Responder a Lucía sobre el curso", outcome: "answered", at: "ayer" },
  { id: "x3", title: "Descartar campaña de verano", outcome: "rejected", at: "ayer" },
];
