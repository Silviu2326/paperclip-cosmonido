/**
 * Demo data for the Ajustes proposal. Groups follow the ownership in
 * doc/plans/2026-10-22-revision-paginas-reducir-sin-empeorar.md: user, company,
 * commercial account and instance. Names and numbers match the other demo data.
 */
export type SettingsScope = "user" | "company" | "account" | "instance";

export interface SettingsGroup {
  id: string;
  label: string;
  scope: SettingsScope;
  scopeNote: string;
  icon: string;
  adminOnly?: boolean;
  /** Words the search matches in addition to the label. */
  keywords: string;
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: "profile", label: "Mi perfil", scope: "user", scopeNote: "Solo afecta a tu usuario, en todas las empresas", icon: "UserRound", keywords: "nombre avatar foto idioma sidebar accesos menú navegación agenda oficina clientes" },
  { id: "notifications", label: "Notificaciones", scope: "user", scopeNote: "Tus avisos en Cosmonido, no los de los demás miembros", icon: "BellRing", keywords: "avisos categorías navegador push dispositivo resumen diario email" },
  { id: "security", label: "Seguridad", scope: "user", scopeNote: "Tu inicio de sesión, en todas las empresas", icon: "KeyRound", keywords: "contraseña 2fa verificación dos pasos sesiones dispositivos códigos recuperación" },
  { id: "company", label: "Empresa", scope: "company", scopeNote: "Afecta a todos los miembros de Cosmonido", icon: "Building2", keywords: "general nombre logo miembros invitaciones roles secretos api claves webhooks datos retención exportar importar" },
  { id: "account", label: "Cuenta comercial", scope: "account", scopeNote: "Agrupa las empresas, miembros y plan que pagas", icon: "CreditCard", keywords: "facturación plan factura pago cuenta empresas vinculadas eliminar cancelar" },
  { id: "instance", label: "Administración", scope: "instance", scopeNote: "Toda la instalación. Solo lo ven los administradores", icon: "ServerCog", adminOnly: true, keywords: "plugins adaptadores entornos acceso experimentales usuarios instancia" },
];

export const SCOPE_LABEL: Record<SettingsScope, string> = {
  user: "Tu usuario", company: "Empresa", account: "Cuenta comercial", instance: "Instalación",
};

export const LANGUAGES = ["Español", "English", "Português (Brasil)", "Português (Portugal)"];

export const NOTIFICATION_CATEGORIES = [
  { id: "decisions", label: "Decisiones", text: "Decisiones abiertas que necesitan tu respuesta." },
  { id: "reviews", label: "Revisiones de entregables", text: "Revisiones pendientes asignadas a ti." },
  { id: "tasks", label: "Tareas asignadas", text: "Tareas abiertas asignadas directamente a tu cuenta." },
];

export const DEMO_SESSIONS = [
  { id: "s1", device: "Chrome · Windows", place: "Valencia, ES", last: "Ahora mismo", current: true },
  { id: "s2", device: "Safari · iPhone", place: "Valencia, ES", last: "Hace 2 h", current: false },
  { id: "s3", device: "Chrome · Android", place: "Madrid, ES", last: "Hace 5 días", current: false },
];

export const DEMO_MEMBERS = [
  { id: "m1", name: "Silviu", email: "hastasilviu@gmail.com", role: "Propietario" },
  { id: "m2", name: "Marta Ruiz", email: "marta@cosmonido.com", role: "Administradora" },
  { id: "m3", name: "Pablo Ortega", email: "pablo@arqnorte.studio", role: "Invitado" },
];

export const DEMO_SECRETS = [
  { id: "k1", name: "RESEND_API_KEY", used: "Agente de email", updated: "hace 12 días" },
  { id: "k2", name: "INSTAGRAM_TOKEN", used: "Marta (agente de cuentas)", updated: "hace 3 meses" },
];

export const DEMO_API_KEYS = [
  { id: "a1", name: "Zapier · formularios web", prefix: "pk_live_8f2…", created: "12 sep" },
];

export const DEMO_ACCOUNTS = [
  { id: "ac1", name: "Cosmonido Studio", plan: "Agencia", role: "Propietario", companies: ["Cosmonido"], members: 3 },
  { id: "ac2", name: "Silviu personal", plan: "Gratis", role: "Propietario", companies: [], members: 1 },
];

export const DEMO_INVOICES = [
  { id: "i1", date: "1 oct 2026", amount: "49,00 €", status: "Pagada" },
  { id: "i2", date: "1 sep 2026", amount: "49,00 €", status: "Pagada" },
  { id: "i3", date: "1 ago 2026", amount: "49,00 €", status: "Pagada" },
];

export const DEMO_PLUGINS = [
  { id: "p1", name: "Buffer", enabled: true, text: "Programar publicaciones en redes." },
  { id: "p2", name: "Google Calendar", enabled: true, text: "Sincroniza la agenda." },
  { id: "p3", name: "Wiki de la empresa", enabled: false, text: "Memoria compartida para agentes." },
];

export const DEMO_EXPERIMENTAL = [
  { id: "x1", label: "Bandeja combinada con tareas", on: true },
  { id: "x2", label: "Chat con agentes", on: false },
  { id: "x3", label: "Enlace de Objetivos en la sidebar", on: false },
];
