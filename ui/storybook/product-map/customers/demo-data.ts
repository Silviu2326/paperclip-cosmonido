import type { CustomerHealth, CustomerKind } from "@paperclipai/shared";

/**
 * Demo data for the Clientes proposal. Fields mirror the real Customer and
 * Contact types; the aggregates (services, proposals, work, conversations)
 * come from APIs that exist today in separate pages and would be joined for
 * the customer view.
 */
export interface DemoContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  primary: boolean;
  channel: "email" | "whatsapp" | "phone";
}

export interface DemoService {
  id: string;
  name: string;
  monthlyCents: number;
  nextRenewal: string;
  status: "active" | "renewing" | "paused";
}

export interface DemoCustomer {
  id: string;
  name: string;
  kind: CustomerKind;
  domain: string | null;
  tags: string[];
  health: CustomerHealth;
  owner: string;
  contacts: DemoContact[];
  services: DemoService[];
  openProposals: { id: string; title: string; amountCents: number; status: "sent" | "viewed" | "draft" }[];
  activeTasks: number;
  pendingReviews: number;
  unreadConversations: number;
  lastActivity: string;
  lastActivityLabel: string;
  nextAction: string | null;
  createdAt: string;
  /** Archived customers stay readable but leave the active list. */
  archived?: boolean;
}

const contact = (id: string, name: string, title: string | null, email: string | null, extra: Partial<DemoContact> = {}): DemoContact => ({
  id, name, title, email, phone: null, primary: false, channel: "email", ...extra,
});

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    id: "c1", name: "Clínica Dental Sonrisa", kind: "organization", domain: "clinicasonrisa.es", tags: ["Salud", "Redes"],
    health: "good", owner: "Marta (agente de cuentas)",
    contacts: [
      contact("p1", "Laura Gómez", "Directora", "laura@clinicasonrisa.es", { primary: true, channel: "whatsapp", phone: "+34 611 22 33 44" }),
      contact("p2", "Iván Ruiz", "Recepción", "recepcion@clinicasonrisa.es"),
    ],
    services: [
      { id: "s1", name: "Gestión de redes sociales", monthlyCents: 59000, nextRenewal: "2026-11-01", status: "active" },
      { id: "s2", name: "Campañas Google Ads", monthlyCents: 35000, nextRenewal: "2026-11-01", status: "active" },
    ],
    openProposals: [{ id: "pr1", title: "Web nueva con reservas online", amountCents: 240000, status: "viewed" }],
    activeTasks: 6, pendingReviews: 2, unreadConversations: 1,
    lastActivity: "2026-10-23T16:40:00Z", lastActivityLabel: "Aprobó 3 publicaciones de noviembre",
    nextAction: "Revisar 2 entregables antes del viernes", createdAt: "2025-03-14",
  },
  {
    id: "c2", name: "Panadería La Espiga", kind: "organization", domain: "laespiga.com", tags: ["Comercio local"],
    health: "watch", owner: "Tú",
    contacts: [contact("p3", "Antonio Pérez", "Propietario", "antonio@laespiga.com", { primary: true, channel: "phone", phone: "+34 622 10 20 30" })],
    services: [{ id: "s3", name: "Newsletter mensual", monthlyCents: 12000, nextRenewal: "2026-10-28", status: "renewing" }],
    openProposals: [],
    activeTasks: 1, pendingReviews: 0, unreadConversations: 3,
    lastActivity: "2026-10-12T09:15:00Z", lastActivityLabel: "3 mensajes sin responder",
    nextAction: "Responder dudas sobre la renovación", createdAt: "2025-09-02",
  },
  {
    id: "c3", name: "Estudio Arquitectura Norte", kind: "organization", domain: "arqnorte.studio", tags: ["Arquitectura", "Web"],
    health: "risk", owner: "Marta (agente de cuentas)",
    contacts: [
      contact("p4", "Elena Navarro", "Socia", "elena@arqnorte.studio", { primary: true }),
      contact("p5", "Pablo Ortega", "Proyectos", "pablo@arqnorte.studio"),
      contact("p6", "Admin", null, "admin@arqnorte.studio"),
    ],
    services: [{ id: "s4", name: "Mantenimiento web", monthlyCents: 18000, nextRenewal: "2026-10-30", status: "paused" }],
    openProposals: [{ id: "pr2", title: "Rediseño de portfolio", amountCents: 380000, status: "sent" }],
    activeTasks: 0, pendingReviews: 1, unreadConversations: 0,
    lastActivity: "2026-09-29T11:00:00Z", lastActivityLabel: "Pidió cambios en la propuesta hace 3 semanas",
    nextAction: "Recuperar la conversación: servicio en pausa", createdAt: "2024-11-20",
  },
  {
    id: "c4", name: "Lucía Martín", kind: "person", domain: null, tags: ["Coaching"],
    health: "good", owner: "Tú",
    contacts: [contact("p7", "Lucía Martín", null, "hola@luciamartin.coach", { primary: true, channel: "whatsapp", phone: "+34 633 44 55 66" })],
    services: [{ id: "s5", name: "Contenido para LinkedIn", monthlyCents: 29000, nextRenewal: "2026-11-15", status: "active" }],
    openProposals: [{ id: "pr3", title: "Curso online: grabación y edición", amountCents: 150000, status: "draft" }],
    activeTasks: 3, pendingReviews: 0, unreadConversations: 0,
    lastActivity: "2026-10-22T18:05:00Z", lastActivityLabel: "Se publicó el carrusel de la semana",
    nextAction: null, createdAt: "2026-02-08",
  },
  {
    id: "c5", name: "Taller Mecánico Ruedas", kind: "organization", domain: "talleruedas.es", tags: ["Automoción"],
    health: "good", owner: "Diego (agente comercial)",
    contacts: [contact("p8", "Raúl Sánchez", "Gerente", "raul@talleruedas.es", { primary: true, channel: "phone", phone: "+34 644 77 88 99" })],
    services: [],
    openProposals: [{ id: "pr4", title: "Ficha de Google y reseñas", amountCents: 45000, status: "sent" }],
    activeTasks: 1, pendingReviews: 0, unreadConversations: 1,
    lastActivity: "2026-10-23T10:30:00Z", lastActivityLabel: "Abrió la propuesta 2 veces",
    nextAction: "Llamar para cerrar la propuesta", createdAt: "2026-10-15",
  },
  {
    id: "c6", name: "Yoga Bahía", kind: "organization", domain: "yogabahia.com", tags: ["Bienestar", "Redes"],
    health: "watch", owner: "Marta (agente de cuentas)",
    contacts: [contact("p9", "Sara Vidal", "Fundadora", "sara@yogabahia.com", { primary: true, channel: "whatsapp" })],
    services: [{ id: "s6", name: "Gestión de Instagram", monthlyCents: 32000, nextRenewal: "2026-11-05", status: "active" }],
    openProposals: [],
    activeTasks: 2, pendingReviews: 3, unreadConversations: 0,
    lastActivity: "2026-10-20T08:00:00Z", lastActivityLabel: "3 entregables esperando su revisión",
    nextAction: "Recordar la revisión pendiente", createdAt: "2025-06-30",
  },
];

let moneyHidden = false;
/** Scenario switch: members without billing access see "—" instead of amounts. Set by the page wrapper before rendering. */
export function setMoneyHidden(hidden: boolean): void {
  moneyHidden = hidden;
}

export function euros(cents: number): string {
  if (moneyHidden) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}
