/**
 * Demo data for the Apps proposal. A connection mirrors ToolConnection
 * (status draft/active/disabled, authKind oauth/api_key, healthStatus,
 * lastHealthCheckAt) plus the per-agent permissions the real permissions tab
 * edits. Agents match home/demo-data.ts.
 */
export type AppCategory = "Comunicación" | "Calendario" | "Redes sociales" | "Documentos" | "Anuncios" | "Pagos";
export type AppState = "connected" | "attention" | "available" | "pending";
export type Access = "none" | "read" | "ask" | "write";

export interface DemoPermission {
  agent: string;
  role: string;
  access: Access;
}

export interface DemoActionGroup {
  id: string;
  title: string;
  text: string;
  /** Which kind of access the group needs at minimum. */
  needs: "read" | "write";
}

export interface DemoApp {
  id: string;
  name: string;
  category: AppCategory;
  tagline: string;
  /** Brand colour for the logo tile. Hex because these are third-party brands. */
  brand: string;
  letter: string;
  state: AppState;
  authKind: "oauth" | "api_key";
  account: string | null;
  lastCheck: string | null;
  attention: string | null;
  usedBy: number;
  groups: DemoActionGroup[];
  permissions: DemoPermission[];
  /** Contextual entries that live under this app today. */
  related?: { label: string; text: string }[];
  /** The last health check failed although the connection is still in use (a timeout, a 5xx…). */
  check?: "failed";
  checkError?: string;
  /** A connection request waiting for an administrator. */
  pending?: { approver: string; since: string };
}

const team = (levels: [Access, Access, Access, Access]): DemoPermission[] => [
  { agent: "Marta", role: "Agente de cuentas", access: levels[0] },
  { agent: "Diego", role: "Agente comercial", access: levels[1] },
  { agent: "Leo", role: "Editor de vídeo", access: levels[2] },
  { agent: "Nora", role: "Agente de email", access: levels[3] },
];

export const DEMO_APPS: DemoApp[] = [
  {
    id: "gmail", name: "Gmail", category: "Comunicación", tagline: "Lee y envía correos desde tu cuenta", brand: "#EA4335", letter: "G",
    state: "attention", authKind: "oauth", account: "hola@cosmonido.com", lastCheck: "hace 7 h",
    attention: "El permiso de envío caducó anoche. Vuelve a conectar la cuenta para que Nora pueda enviar la newsletter.",
    usedBy: 2,
    groups: [
      { id: "read", title: "Leer correos", text: "Buscar y abrir mensajes, sin modificar nada.", needs: "read" },
      { id: "draft", title: "Crear borradores", text: "Preparar respuestas que tú revisas antes de enviar.", needs: "write" },
      { id: "send", title: "Enviar correos", text: "Mandar mensajes en tu nombre a clientes y suscriptores.", needs: "write" },
    ],
    permissions: team(["read", "ask", "none", "write"]),
    related: [{ label: "Canales de clientes", text: "Asocia este correo a las conversaciones con clientes." }],
  },
  {
    id: "gcal", name: "Google Calendar", category: "Calendario", tagline: "Reuniones, disponibilidad y reservas", brand: "#4285F4", letter: "C",
    state: "connected", authKind: "oauth", account: "hola@cosmonido.com", lastCheck: "hace 12 min", attention: null, usedBy: 2,
    groups: [
      { id: "read", title: "Ver tu agenda", text: "Consultar huecos libres y reuniones.", needs: "read" },
      { id: "write", title: "Crear y mover reuniones", text: "Reservar citas con clientes en tu calendario.", needs: "write" },
    ],
    permissions: team(["read", "write", "none", "none"]),
    related: [{ label: "Agenda", text: "Tipos de reunión y enlaces de reserva pública." }],
  },
  {
    id: "instagram", name: "Instagram", category: "Redes sociales", tagline: "Programa y publica posts, carruseles y reels", brand: "#C13584", letter: "I",
    state: "connected", authKind: "oauth", account: "@clinicasonrisa.es", lastCheck: "hace 25 min", attention: null, usedBy: 2,
    groups: [
      { id: "stats", title: "Ver estadísticas", text: "Alcance, interacciones y seguidores.", needs: "read" },
      { id: "publish", title: "Publicar contenido", text: "Subir posts y reels programados. Siempre con tu aprobación.", needs: "write" },
    ],
    permissions: team(["ask", "none", "read", "none"]),
  },
  {
    id: "whatsapp", name: "WhatsApp Business", category: "Comunicación", tagline: "Atiende a tus clientes por WhatsApp", brand: "#25D366", letter: "W",
    state: "available", authKind: "api_key", account: null, lastCheck: null, attention: null, usedBy: 0,
    groups: [
      { id: "read", title: "Leer conversaciones", text: "Ver los mensajes de tus clientes.", needs: "read" },
      { id: "reply", title: "Responder mensajes", text: "Contestar dentro de las 24 h permitidas.", needs: "write" },
    ],
    permissions: team(["none", "none", "none", "none"]),
    related: [{ label: "Canales de clientes", text: "Número, plantillas y consentimiento." }, { label: "Chat web", text: "Widget con la misma identidad." }],
  },
  {
    id: "drive", name: "Google Drive", category: "Documentos", tagline: "Documentos y carpetas compartidas con clientes", brand: "#0F9D58", letter: "D",
    state: "connected", authKind: "oauth", account: "hola@cosmonido.com", lastCheck: "hace 2 h", attention: null, usedBy: 3,
    groups: [
      { id: "read", title: "Leer archivos", text: "Abrir documentos y hojas que elijas.", needs: "read" },
      { id: "write", title: "Crear y editar", text: "Guardar entregables en una carpeta concreta.", needs: "write" },
    ],
    permissions: team(["read", "read", "write", "none"]),
  },
  {
    id: "gads", name: "Google Ads", category: "Anuncios", tagline: "Campañas y presupuesto de anuncios", brand: "#FBBC04", letter: "A",
    state: "available", authKind: "oauth", account: null, lastCheck: null, attention: null, usedBy: 0,
    groups: [
      { id: "read", title: "Ver campañas", text: "Resultados, coste y conversiones.", needs: "read" },
      { id: "write", title: "Cambiar pujas y presupuestos", text: "Modificar el gasto. Pide siempre aprobación.", needs: "write" },
    ],
    permissions: team(["none", "none", "none", "none"]),
  },
  {
    id: "stripe", name: "Stripe", category: "Pagos", tagline: "Cobros, facturas y suscripciones", brand: "#635BFF", letter: "S",
    state: "available", authKind: "api_key", account: null, lastCheck: null, attention: null, usedBy: 0,
    groups: [
      { id: "read", title: "Ver cobros", text: "Pagos, clientes y facturas.", needs: "read" },
      { id: "write", title: "Crear enlaces de pago", text: "Preparar cobros para tus propuestas.", needs: "write" },
    ],
    permissions: team(["none", "none", "none", "none"]),
  },
  {
    id: "mailchimp", name: "Mailchimp", category: "Comunicación", tagline: "Listas y campañas de email", brand: "#FFE01B", letter: "M",
    state: "connected", authKind: "api_key", account: "Panadería La Espiga", lastCheck: "ayer", attention: null, usedBy: 1,
    groups: [
      { id: "lists", title: "Ver listas", text: "Suscriptores y segmentos.", needs: "read" },
      { id: "send", title: "Enviar campañas", text: "Lanzar newsletters a una lista.", needs: "write" },
    ],
    permissions: team(["none", "none", "none", "write"]),
  },
];

export const CATEGORIES: ("Todas" | AppCategory)[] = ["Todas", "Comunicación", "Calendario", "Redes sociales", "Documentos", "Anuncios", "Pagos"];

export const CONTEXTUAL_ENTRIES = [
  { id: "channels", title: "Canales de clientes", text: "Dónde te escriben tus clientes: correo, WhatsApp y llamadas.", status: "2 activos" },
  { id: "webchat", title: "Chat web", text: "El widget de tu web: instalación e identidad.", status: "Sin instalar" },
  { id: "crm", title: "Sincronización CRM", text: "Mantén clientes y contactos al día entre herramientas.", status: "Al día" },
];

export const ACCESS_LABEL: Record<Access, string> = {
  none: "Sin acceso",
  read: "Solo leer",
  ask: "Pide permiso",
  write: "Puede actuar",
};
