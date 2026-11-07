import { DEMO_APPS, type AppCategory, type DemoApp } from "./demo-data";

/**
 * Scenarios for the Apps proposal. One config drives every state (loading,
 * error, catalog of ~90, read-only member, plan limit, pending approvals…)
 * so the three layout variants show the same situations.
 */
export type AppsScenario =
  | "normal"
  | "sin-conexiones"
  | "cargando"
  | "error"
  | "muchisimos"
  | "textos-largos"
  | "sin-permisos"
  | "conexion-caducada"
  | "error-comprobacion"
  | "aprobacion-pendiente"
  | "limite-plan";

export interface AppsConfig {
  scenario: AppsScenario;
  apps: DemoApp[];
  /** A member who can see the connections but not create or change them. */
  readOnly: boolean;
  hasConnections: boolean;
  plan: { name: string; max: number } | null;
}

const GENERATED_NAMES: [string, AppCategory][] = [
  ["Slack", "Comunicación"], ["Microsoft Teams", "Comunicación"], ["Telegram", "Comunicación"], ["Outlook", "Comunicación"], ["Zoom", "Calendario"],
  ["Calendly", "Calendario"], ["Cal.com", "Calendario"], ["Outlook Calendar", "Calendario"], ["Facebook Pages", "Redes sociales"], ["LinkedIn", "Redes sociales"],
  ["TikTok", "Redes sociales"], ["X", "Redes sociales"], ["YouTube", "Redes sociales"], ["Pinterest", "Redes sociales"], ["Notion", "Documentos"],
  ["Dropbox", "Documentos"], ["OneDrive", "Documentos"], ["Airtable", "Documentos"], ["Google Sheets", "Documentos"], ["Confluence", "Documentos"],
  ["Meta Ads", "Anuncios"], ["LinkedIn Ads", "Anuncios"], ["TikTok Ads", "Anuncios"], ["Microsoft Ads", "Anuncios"], ["PayPal", "Pagos"],
  ["Redsys", "Pagos"], ["Bizum Empresas", "Pagos"], ["GoCardless", "Pagos"], ["Holded", "Pagos"], ["Quaderno", "Pagos"],
];
const BRANDS = ["#4A154B", "#6264A7", "#26A5E4", "#0078D4", "#2D8CFF", "#006BFF", "#292929", "#0A66C2", "#1877F2", "#000000", "#FF0000", "#E60023", "#37352F", "#0061FF"];
const SUFFIXES = ["", " Pro", " Business", " Lite", " Empresas", " Plus"];

function generatedApps(count: number): DemoApp[] {
  return Array.from({ length: count }, (_, index) => {
    const [base, category] = GENERATED_NAMES[index % GENERATED_NAMES.length]!;
    const suffix = SUFFIXES[Math.floor(index / GENERATED_NAMES.length) % SUFFIXES.length]!;
    const name = `${base}${suffix}`;
    const connected = index % 7 === 3;
    return {
      id: `gen${index}`,
      name,
      category,
      tagline: `Conecta ${name} para que tu equipo trabaje desde ahí`,
      brand: BRANDS[index % BRANDS.length]!,
      letter: name[0]!,
      state: connected ? "connected" : "available",
      authKind: index % 3 === 0 ? "api_key" : "oauth",
      account: connected ? "hola@cosmonido.com" : null,
      lastCheck: connected ? "hace 1 h" : null,
      attention: null,
      usedBy: connected ? 1 + (index % 3) : 0,
      groups: [
        { id: "read", title: "Ver datos", text: "Consultar la información de la cuenta.", needs: "read" },
        { id: "write", title: "Hacer cambios", text: "Actuar en tu nombre. Siempre con tu aprobación.", needs: "write" },
      ],
      permissions: DEMO_APPS[0]!.permissions.map((permission) => ({ ...permission, access: connected && permission.agent === "Marta" ? "read" : "none" })),
    } satisfies DemoApp;
  });
}

const LONG_APPS: DemoApp[] = [
  {
    ...DEMO_APPS[0]!,
    id: "long1",
    name: "Sistema Integrado de Gestión Documental y Archivo Electrónico Corporativo — Edición Profesional para Administraciones",
    tagline: "Una descripción deliberadamente larga que ocupa varias líneas para comprobar que la tarjeta, la ficha de la conexión y el asistente de conexión recortan o dividen el texto sin desbordarse ni empujar los botones fuera de su sitio.",
    account: "administracion.general.facturacion.y.contabilidad@asociacion-vecinal-casco-antiguo-cartagena.example.org",
    attention: "El permiso de envío caducó anoche y, hasta que vuelvas a conectar la cuenta, ningún agente podrá enviar correos en nombre de la asociación vecinal ni responder a las solicitudes de los socios de las distintas comisiones de trabajo.",
    letter: "S",
  },
  { ...DEMO_APPS[1]!, id: "long2", name: "ملف التقويم والاجتماعات", tagline: "تقويم الاجتماعات وحجز المواعيد مع العملاء", account: "hola@cosmonido.com", letter: "م" },
  { ...DEMO_APPS[2]!, id: "long3", name: "社内カレンダーとスケジュール管理ツール", tagline: "チームの予定と顧客との打ち合わせを管理します", account: "@clinica_sonrisa_dental_oficial_de_cartagena_y_la_manga", letter: "社" },
  { ...DEMO_APPS[3]!, id: "long4", name: "WhatsApp", tagline: "Corto", letter: "W" },
  { ...DEMO_APPS[4]!, id: "long5", name: "Google Drive para Equipos y Organizaciones Sin Ánimo de Lucro con Almacenamiento Compartido", tagline: "Documentos 📄 y carpetas 📁 compartidas con clientes (incluye emoji ✨)", account: "ñandú.y.compañía@ejemplo-con-ñ.example.com", letter: "D" },
  ...DEMO_APPS.slice(5, 7),
];

const withTeam = (app: DemoApp, patch: Partial<DemoApp>): DemoApp => ({ ...app, ...patch });

function config(scenario: AppsScenario, apps: DemoApp[], overrides: Partial<AppsConfig> = {}): AppsConfig {
  return { scenario, apps, readOnly: false, hasConnections: true, plan: null, ...overrides };
}

export function appsConfig(scenario: AppsScenario): AppsConfig {
  switch (scenario) {
    case "sin-conexiones":
      return config(scenario, DEMO_APPS.map((app) => ({ ...app, state: "available" as const, account: null, lastCheck: null, attention: null, usedBy: 0 })), { hasConnections: false });
    case "muchisimos":
      return config(scenario, [...DEMO_APPS, ...generatedApps(84)]);
    case "textos-largos":
      return config(scenario, LONG_APPS);
    case "sin-permisos":
      return config(scenario, DEMO_APPS, { readOnly: true });
    case "conexion-caducada":
      return config(scenario, DEMO_APPS.map((app) =>
        app.id === "instagram" ? withTeam(app, { state: "attention", attention: "Instagram revocó el acceso hace 3 días por un cambio de contraseña. Marta no puede programar las publicaciones de noviembre." })
        : app.id === "drive" ? withTeam(app, { state: "attention", attention: "Google pidió confirmar de nuevo los permisos de Drive. Leo no puede guardar los vídeos entregados." })
        : app));
    case "error-comprobacion":
      return config(scenario, DEMO_APPS.map((app) =>
        app.id === "drive" ? withTeam(app, { check: "failed", checkError: "La comprobación agotó el tiempo (30 s). Es posible que Google esté tardando; tus agentes siguen usándola.", lastCheck: "hace 2 días" })
        : app.id === "gcal" ? withTeam(app, { check: "failed", checkError: "Google respondió con un error del servidor (502). Se volverá a intentar en 5 minutos.", lastCheck: "hace 6 h" })
        : app.id === "gmail" ? withTeam(app, { state: "connected", attention: null, lastCheck: "hace 12 min" })
        : app));
    case "aprobacion-pendiente":
      return config(scenario, DEMO_APPS.map((app) =>
        app.id === "stripe" ? withTeam(app, { state: "pending", pending: { approver: "Ana Torres (administradora)", since: "hace 2 días" } })
        : app.id === "gads" ? withTeam(app, { state: "pending", pending: { approver: "Ana Torres (administradora)", since: "hoy" } })
        : app.id === "gmail" ? withTeam(app, { state: "connected", attention: null, lastCheck: "hace 12 min" })
        : app));
    case "limite-plan":
      return config(scenario, DEMO_APPS.map((app) => app.id === "gmail" ? withTeam(app, { state: "connected", attention: null, lastCheck: "hace 12 min" }) : app), { plan: { name: "Básico", max: 5 } });
    case "cargando":
    case "error":
    default:
      return config("normal", DEMO_APPS);
  }
}

export const APPS_SCENARIO_LABEL: Record<AppsScenario, string> = {
  normal: "Normal",
  "sin-conexiones": "Sin conexiones",
  cargando: "Cargando",
  error: "Error de carga",
  muchisimos: "Muchísimas apps",
  "textos-largos": "Textos largos",
  "sin-permisos": "Sin permisos",
  "conexion-caducada": "Conexión caducada",
  "error-comprobacion": "Error en la comprobación",
  "aprobacion-pendiente": "Aprobación pendiente",
  "limite-plan": "Límite del plan",
};
