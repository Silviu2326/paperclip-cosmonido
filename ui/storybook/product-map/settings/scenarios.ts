import {
  DEMO_ACCOUNTS,
  DEMO_API_KEYS,
  DEMO_EXPERIMENTAL,
  DEMO_INVOICES,
  DEMO_MEMBERS,
  DEMO_PLUGINS,
  DEMO_SECRETS,
  DEMO_SESSIONS,
} from "./demo-data";

/**
 * Scenarios for the Ajustes proposal: the page in a normal day and in the
 * awkward situations that decide whether a settings screen is trustworthy.
 */
export type SettingsScenario =
  | "normal" | "loading" | "error" | "many" | "long-text" | "no-permission"
  | "save-error" | "unsaved-leave" | "locked-by-admin" | "session-expired" | "two-factor";

/** a: grouped navigation · b: one long page with search and inline editing · c: task assistant. */
export type SettingsVariant = "a" | "b" | "c";

export interface SettingsData {
  members: { id: string; name: string; email: string; role: string }[];
  secrets: { id: string; name: string; used: string; updated: string }[];
  apiKeys: { id: string; name: string; prefix: string; created: string }[];
  invoices: { id: string; date: string; amount: string; status: string }[];
  sessions: { id: string; device: string; place: string; last: string; current: boolean }[];
  accounts: { id: string; name: string; plan: string; role: string; companies: string[]; members: number }[];
  plugins: { id: string; name: string; enabled: boolean; text: string }[];
  experimental: { id: string; label: string; on: boolean }[];
}

const FIRST = ["Ana", "Luis", "Carmen", "Pablo", "Irene", "Marcos", "Lucía", "Hugo", "Sara", "Álvaro", "Elena", "Diego", "Noa", "Iván", "Paula", "Raúl"];
const LAST = ["García", "Martín", "López", "Sánchez", "Pérez", "Gómez", "Ruiz", "Díaz", "Moreno", "Navarro", "Vidal", "Ortega"];
const ROLES = ["Administrador/a", "Miembro", "Invitado/a", "Facturación"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DEVICES = ["Chrome · Windows", "Safari · iPhone", "Chrome · Android", "Firefox · macOS", "Edge · Windows", "Safari · iPad"];
const PLACES = ["Valencia, ES", "Madrid, ES", "Barcelona, ES", "Sevilla, ES", "Lisboa, PT", "Ciudad de México, MX"];

function base(): SettingsData {
  return {
    members: DEMO_MEMBERS, secrets: DEMO_SECRETS, apiKeys: DEMO_API_KEYS, invoices: DEMO_INVOICES, sessions: DEMO_SESSIONS,
    accounts: DEMO_ACCOUNTS, plugins: DEMO_PLUGINS, experimental: DEMO_EXPERIMENTAL,
  };
}

const LONG_TEXT = "Esta descripción es deliberadamente larguísima para comprobar que el texto se parte en varias líneas y no desborda la tarjeta ni empuja los controles fuera de la pantalla.";

export function buildSettingsData(scenario: SettingsScenario): SettingsData {
  const data = base();
  if (scenario === "many") {
    return {
      ...data,
      members: Array.from({ length: 120 }, (_, index) => ({
        id: `m${index}`,
        name: `${FIRST[index % FIRST.length]} ${LAST[(index * 5) % LAST.length]} ${LAST[(index * 7 + 3) % LAST.length]}`,
        email: `${FIRST[index % FIRST.length]!.toLowerCase().replace("á", "a").replace("í", "i")}.${LAST[(index * 5) % LAST.length]!.toLowerCase().replace("á", "a").replace("í", "i").replace("é", "e")}${index}@cosmonido.com`,
        role: index === 0 ? "Propietario" : ROLES[index % ROLES.length]!,
      })),
      secrets: Array.from({ length: 40 }, (_, index) => ({ id: `k${index}`, name: `INTEGRACION_${String(index + 1).padStart(2, "0")}_TOKEN`, used: index % 3 ? "Marta (agente de cuentas)" : "Agente de email", updated: `hace ${index + 2} días` })),
      apiKeys: Array.from({ length: 12 }, (_, index) => ({ id: `a${index}`, name: `Webhook ${index + 1} · formularios`, prefix: `pk_live_${(index * 7919 + 4099).toString(16).slice(0, 3)}…`, created: `${(index % 27) + 1} ${MONTHS[index % 12]}` })),
      invoices: Array.from({ length: 36 }, (_, index) => {
        const offset = 9 - index;
        const month = ((offset % 12) + 12) % 12;
        const year = 2026 + Math.floor(offset / 12);
        return { id: `i${index}`, date: `1 ${MONTHS[month]} ${year}`, amount: index > 24 ? "29,00 €" : "49,00 €", status: index === 4 ? "Reembolsada" : "Pagada" };
      }),
      sessions: Array.from({ length: 25 }, (_, index) => ({ id: `s${index}`, device: DEVICES[index % DEVICES.length]!, place: PLACES[index % PLACES.length]!, last: index === 0 ? "Ahora mismo" : `Hace ${index * 3} h`, current: index === 0 })),
    };
  }
  if (scenario === "long-text") {
    return {
      ...data,
      members: [
        { id: "l1", name: "José Ángel Ñandú-Øvergård de la Cruz y Martínez de Todos los Santos ✨", email: "jose.angel.nandu-overgard.de.la.cruz.y.martinez.de.todos.los.santos@asociacion-cultural-deportiva-antiguos-alumnos.example", role: "Propietario" },
        { id: "l2", name: "山田太郎 (Taller Ruedas Japón)", email: "yamada.taro@ruedas.example.jp", role: "Administrador/a" },
        { id: "l3", name: "مريم الأحمد", email: "maryam@example.org", role: "Invitado/a" },
        { id: "l4", name: "Zoë O'Brien-Núñez", email: "zoe+facturas+octubre+noviembre+diciembre@example.com", role: "Facturación con un nombre de rol larguísimo" },
      ],
      secrets: [
        { id: "k1", name: "INTEGRACION_CON_EL_PROVEEDOR_DE_CORREO_TRANSACCIONAL_Y_MARKETING_DE_LA_CLINICA_DENTAL_SONRISA_VALENCIA", used: "Marta (agente de cuentas de la clínica dental, la panadería, el yoga y la arquitectura)", updated: "hace 12 días" },
        { id: "k2", name: "TOKEN_" + "ABCDEFGHIJ".repeat(8), used: LONG_TEXT, updated: "hace 3 meses" },
      ],
      apiKeys: [{ id: "a1", name: "Zapier · formularios web · campaña de otoño de la sede de Ruzafa · versión 2 (no borrar)", prefix: "pk_live_8f2…", created: "12 sep" }],
      accounts: [{ id: "ac1", name: "Cosmonido Studio Sociedad Limitada Unipersonal — Cuenta comercial principal de todas las empresas del grupo", plan: "Agencia", role: "Propietario", companies: ["Cosmonido"], members: 3 }, ...DEMO_ACCOUNTS.slice(1)],
      plugins: [{ id: "p1", name: "Integración con el calendario corporativo de la asociación cultural y deportiva de antiguos alumnos", enabled: true, text: LONG_TEXT }, ...DEMO_PLUGINS.slice(1)],
      sessions: [
        { id: "s1", device: "Chrome 141.0.7390.55 · Windows 11 Pro 23H2 (compilación 22631.4602) · extensión de accesibilidad activada", place: "Valencia, Comunidad Valenciana, España", last: "Ahora mismo", current: true },
        ...DEMO_SESSIONS.slice(1),
      ],
    };
  }
  return data;
}

/** Settings the instance administrator has fixed; the user sees them locked. */
export const ADMIN_LOCKED = ["language", "office", "retention", "twoFactor"] as const;
export const ADMIN_LOCK_LABEL: Record<(typeof ADMIN_LOCKED)[number], string> = {
  language: "Idioma de la interfaz",
  office: "Fijar Oficina",
  retention: "Purgar conversaciones cerradas",
  twoFactor: "Verificación en dos pasos (obligatoria)",
};
