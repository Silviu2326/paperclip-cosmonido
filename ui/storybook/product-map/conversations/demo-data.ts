import type { ConversationChannel, ConversationPriority, ConversationStatus } from "@paperclipai/shared";

/**
 * Demo data for the Conversaciones proposal. Threads follow the real
 * Conversation / ConversationMessage types (channel, status, priority, SLA,
 * assigned agent, direction and actor of each message). Customers and
 * contacts match customers/demo-data.ts. `suggestion` and `calls` are
 * proposal-only: today replies are drafted by agents through external actions
 * and calls live on their own tab.
 */
export type Channel = Extract<ConversationChannel, "email" | "whatsapp" | "webchat" | "voice">;

export interface DemoMessage {
  id: string;
  direction: "inbound" | "outbound";
  actor: "contact" | "user" | "agent" | "system";
  author: string;
  body: string;
  at: string;
  delivery?: "sent" | "delivered" | "read" | "failed";
}

export interface DemoThread {
  id: string;
  channel: Channel;
  subject: string;
  customer: string;
  contact: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  slaDueLabel: string | null;
  slaLate: boolean;
  assignedTo: string;
  lastLabel: string;
  unread: number;
  preview: string;
  messages: DemoMessage[];
  suggestion: { agent: string; text: string; reason: string } | null;
  context: { health: "good" | "watch" | "risk"; services: string; openProposal: string | null; nextAction: string | null };
}

export const DEMO_THREADS: DemoThread[] = [
  {
    id: "t1", channel: "whatsapp", subject: "Dudas sobre la renovación", customer: "Panadería La Espiga", contact: "Antonio Pérez",
    status: "waiting_us", priority: "urgent", slaDueLabel: "Vencida hace 2 h", slaLate: true, assignedTo: "Tú", lastLabel: "hace 3 h", unread: 3,
    preview: "¿Entonces me suben la cuota el mes que viene?",
    messages: [
      { id: "m1", direction: "outbound", actor: "agent", author: "Nora (agente de email)", body: "Hola Antonio, te recordamos que el servicio de newsletter se renueva el 28 de octubre.", at: "Lun 10:12", delivery: "read" },
      { id: "m2", direction: "inbound", actor: "contact", author: "Antonio Pérez", body: "Buenas. ¿La renovación incluye lo de las promociones de Navidad?", at: "Ayer 18:40" },
      { id: "m3", direction: "inbound", actor: "contact", author: "Antonio Pérez", body: "Es que si no, prefiero pensarlo.", at: "Ayer 18:41" },
      { id: "m4", direction: "inbound", actor: "contact", author: "Antonio Pérez", body: "¿Entonces me suben la cuota el mes que viene?", at: "Hoy 06:55" },
    ],
    suggestion: { agent: "Nora", reason: "Tono cercano; la cuota no cambia y las promociones de Navidad están incluidas en el plan actual.", text: "¡Buenos días, Antonio! La cuota se mantiene en 120 €/mes y las promociones de Navidad entran en el plan sin coste extra. Si quieres, te enseño el calendario de envíos y lo cerramos hoy. 🙂" },
    context: { health: "watch", services: "Newsletter mensual · 120 €/mes", openProposal: null, nextAction: "Responder dudas sobre la renovación" },
  },
  {
    id: "t2", channel: "email", subject: "Re: Propuesta rediseño de portfolio", customer: "Estudio Arquitectura Norte", contact: "Elena Navarro",
    status: "waiting_us", priority: "high", slaDueLabel: "Vence hoy 17:00", slaLate: false, assignedTo: "Diego (agente comercial)", lastLabel: "ayer", unread: 1,
    preview: "Hemos visto la propuesta. ¿Podríais bajar el alcance?",
    messages: [
      { id: "m5", direction: "outbound", actor: "agent", author: "Diego (agente comercial)", body: "Hola Elena, adjunto la propuesta para el rediseño del portfolio (3.800 €, 5 semanas).", at: "Hace 3 sem", delivery: "delivered" },
      { id: "m6", direction: "inbound", actor: "contact", author: "Elena Navarro", body: "Hemos visto la propuesta. ¿Podríais bajar el alcance y dejarlo en 3.200 €?", at: "Ayer 16:20" },
    ],
    suggestion: { agent: "Diego", reason: "Mantener el precio ofreciendo una versión por fases; evita bajar el valor.", text: "Hola Elena, gracias por la respuesta. Podemos dividirlo en dos fases: la primera por 3.200 € con las 12 obras principales y la segunda más adelante. ¿Te encaja que lo comentemos a las 17:15?" },
    context: { health: "risk", services: "Mantenimiento web · en pausa", openProposal: "Rediseño de portfolio · 3.800 € · enviada", nextAction: "Presentar la propuesta (hoy 17:15)" },
  },
  {
    id: "t3", channel: "webchat", subject: "Chat de la web", customer: "Academia Ibáñez", contact: "Marcos Ibáñez",
    status: "open", priority: "high", slaDueLabel: "Responde en 8 min", slaLate: false, assignedTo: "Diego (agente comercial)", lastLabel: "hace 1 h", unread: 1,
    preview: "Necesitamos una web y gestionar redes para 3 sedes.",
    messages: [
      { id: "m7", direction: "inbound", actor: "contact", author: "Marcos Ibáñez", body: "Necesitamos una web y gestionar redes para 3 sedes. ¿Presupuesto?", at: "Hoy 08:20" },
      { id: "m8", direction: "outbound", actor: "system", author: "Chat web", body: "Gracias por escribirnos. Un agente te responderá en unos minutos.", at: "Hoy 08:20", delivery: "delivered" },
    ],
    suggestion: { agent: "Diego", reason: "Es un lead nuevo con presupuesto: cualificar con 2 preguntas y ofrecer una llamada.", text: "¡Hola Marcos! Claro. Para ajustar el presupuesto: ¿cuántas sedes quieren en la web y qué redes usáis ahora? Si prefieres, te llamamos hoy a la hora que te venga mejor." },
    context: { health: "good", services: "Aún no es cliente (lead)", openProposal: null, nextAction: "Cualificar y crear oportunidad" },
  },
  {
    id: "t4", channel: "email", subject: "Entregables de noviembre", customer: "Clínica Dental Sonrisa", contact: "Laura Gómez",
    status: "waiting_them", priority: "normal", slaDueLabel: null, slaLate: false, assignedTo: "Marta (agente de cuentas)", lastLabel: "hace 2 días", unread: 0,
    preview: "Os adjunto las 4 publicaciones para vuestra revisión.",
    messages: [
      { id: "m9", direction: "outbound", actor: "agent", author: "Marta (agente de cuentas)", body: "Hola Laura, os adjunto las 4 publicaciones de noviembre para vuestra revisión.", at: "Mié 12:30", delivery: "read" },
      { id: "m10", direction: "inbound", actor: "contact", author: "Laura Gómez", body: "Perfecto, las miro esta semana.", at: "Mié 13:02" },
    ],
    suggestion: null,
    context: { health: "good", services: "Redes · Google Ads · 940 €/mes", openProposal: "Web nueva con reservas · 2.400 € · vista", nextAction: "Revisar 2 entregables antes del viernes" },
  },
  {
    id: "t5", channel: "voice", subject: "Llamada perdida", customer: "Taller Mecánico Ruedas", contact: "Raúl Sánchez",
    status: "open", priority: "normal", slaDueLabel: "Devolver hoy", slaLate: false, assignedTo: "Tú", lastLabel: "hace 40 min", unread: 1,
    preview: "Llamada perdida de 0:00 · dejó un buzón de voz",
    messages: [
      { id: "m11", direction: "inbound", actor: "contact", author: "Raúl Sánchez", body: "Buzón de voz (0:24): «Hola, soy Raúl, he visto la propuesta de las reseñas y quería comentarte un par de cosas. Llámame cuando puedas.»", at: "Hoy 10:30" },
    ],
    suggestion: { agent: "Diego", reason: "Mejor devolver la llamada: está a punto de cerrar la propuesta de 450 €.", text: "Hola Raúl, te devuelvo la llamada ahora. Si no me coges, dime a qué hora te va bien." },
    context: { health: "good", services: "Aún sin servicios", openProposal: "Ficha de Google y reseñas · 450 € · vista 2 veces", nextAction: "Llamar para cerrar la propuesta" },
  },
  {
    id: "t6", channel: "whatsapp", subject: "Revisión del vídeo", customer: "Yoga Bahía", contact: "Sara Vidal",
    status: "closed", priority: "low", slaDueLabel: null, slaLate: false, assignedTo: "Marta (agente de cuentas)", lastLabel: "hace 4 días", unread: 0,
    preview: "¡Genial, muchas gracias!",
    messages: [
      { id: "m12", direction: "outbound", actor: "agent", author: "Marta (agente de cuentas)", body: "Sara, ya tienes disponible el reel de la semana.", at: "Lun 09:00", delivery: "read" },
      { id: "m13", direction: "inbound", actor: "contact", author: "Sara Vidal", body: "¡Genial, muchas gracias!", at: "Lun 09:20" },
    ],
    suggestion: null,
    context: { health: "watch", services: "Gestión de Instagram · 320 €/mes", openProposal: null, nextAction: "Recordar la revisión pendiente" },
  },
];

export interface DemoCall { id: string; contact: string; customer: string; kind: "missed" | "inbound" | "outbound" | "callback"; when: string; duration: string | null }

export const DEMO_CALLS: DemoCall[] = [
  { id: "c1", contact: "Raúl Sánchez", customer: "Taller Mecánico Ruedas", kind: "missed", when: "10:30", duration: null },
  { id: "c2", contact: "Laura Gómez", customer: "Clínica Dental Sonrisa", kind: "callback", when: "Pedida para 13:00", duration: null },
  { id: "c3", contact: "Antonio Pérez", customer: "Panadería La Espiga", kind: "outbound", when: "Ayer 17:20", duration: "4 min" },
];

export const DEMO_AGENDA_TODAY = [
  { time: "13:00", title: "Revisión de contenidos", with: "Laura · Clínica Sonrisa" },
  { time: "17:15", title: "Presentar propuesta", with: "Elena · Arquitectura Norte" },
];
