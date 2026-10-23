/**
 * Product map: every board page a user can reach, in one list.
 *
 * Edit this file to decide what the product has. The "Mapa de producto"
 * stories read it, so a change shows up in Storybook as soon as it is saved.
 * Nothing here changes the real app: once a decision is made, the route, the
 * sidebar and the page are changed in ui/src and deployed.
 */

export type PageStatus =
  /** Live in the app. */
  | "live"
  /** Removed as its own screen; the URL redirects to where it lives now. */
  | "retired"
  /** Does not exist yet: a page we want to design. */
  | "proposed";

export type PageSection =
  | "Inicio"
  | "Trabajo"
  | "Clientes y ventas"
  | "Equipo"
  | "Archivos y medios"
  | "Avanzado"
  | "Supervisión"
  | "Apps"
  | "Ajustes personales"
  | "Ajustes de empresa"
  | "Cuenta comercial"
  | "Administración de instancia"
  | "Páginas públicas";

export interface ProductPage {
  id: string;
  name: string;
  section: PageSection;
  /** Board route, without the company prefix. */
  route: string;
  status: PageStatus;
  /** Lucide icon name, used by the proposed sidebar. */
  icon: string;
  /** How the page is reached today. */
  reach: "sidebar" | "contextual" | "flag" | "public";
  note: string;
}

export const PRODUCT_PAGES: ProductPage[] = [
  // Inicio
  { id: "home", name: "Inicio", section: "Inicio", route: "/dashboard", status: "live", icon: "LayoutDashboard", reach: "sidebar", note: "Panorama, resultados del negocio (?results=1) y puesta en marcha." },
  { id: "live", name: "En vivo", section: "Inicio", route: "/dashboard/live", status: "live", icon: "Activity", reach: "contextual", note: "Ejecuciones activas. Desde el panel de agentes activos." },
  { id: "search", name: "Buscar", section: "Inicio", route: "/search", status: "live", icon: "Search", reach: "sidebar", note: "Búsqueda de toda la empresa." },
  { id: "setup", name: "Puesta en marcha", section: "Inicio", route: "/productization", status: "live", icon: "Rocket", reach: "contextual", note: "Recorrido inicial: negocio, equipo y primer resultado." },
  { id: "outcomes", name: "Resultados (página propia)", section: "Inicio", route: "/outcome-metrics", status: "retired", icon: "BarChart3", reach: "contextual", note: "R4: vive en Inicio con camino y periodo en la URL." },

  // Trabajo
  { id: "tasks", name: "Tareas", section: "Trabajo", route: "/issues", status: "live", icon: "CircleCheck", reach: "sidebar", note: "Entrada al trabajo. Con bandeja combinada incluye Mías, Sin leer, Bloqueadas y Todo." },
  { id: "inbox", name: "Bandeja", section: "Trabajo", route: "/inbox", status: "live", icon: "Inbox", reach: "flag", note: "Página propia solo sin la bandeja combinada; si no, es una vista de Tareas." },
  { id: "projects", name: "Proyectos", section: "Trabajo", route: "/projects", status: "live", icon: "Hexagon", reach: "sidebar", note: "Agrupa tareas; cliente opcional." },
  { id: "routines", name: "Rutinas", section: "Trabajo", route: "/routines", status: "live", icon: "Repeat", reach: "sidebar", note: "Horarios, disparadores y ejecuciones." },
  { id: "playbooks", name: "Procedimientos", section: "Trabajo", route: "/playbooks", status: "live", icon: "BookOpen", reach: "contextual", note: "Secuencias versionadas con publicación." },
  { id: "approvals", name: "Aprobaciones (listado)", section: "Trabajo", route: "/approvals", status: "retired", icon: "ShieldCheck", reach: "contextual", note: "R7: filtro de aprobaciones de la bandeja. El detalle se conserva." },
  { id: "assignments", name: "Encargos", section: "Trabajo", route: "/assignments", status: "retired", icon: "ClipboardList", reach: "contextual", note: "Absorbido en Tareas." },
  { id: "chat", name: "Chat con agentes", section: "Trabajo", route: "/chats", status: "live", icon: "MessageCircle", reach: "flag", note: "Con el flag de chat de agentes." },
  { id: "board-chat", name: "Sala de reuniones", section: "Trabajo", route: "/board-chat", status: "live", icon: "MessagesSquare", reach: "flag", note: "Chat general de la empresa, con su flag." },

  // Clientes y ventas
  { id: "customers", name: "Clientes", section: "Clientes y ventas", route: "/customers", status: "live", icon: "Users", reach: "sidebar", note: "Clientes, contactos y servicios en pestañas." },
  { id: "sales", name: "Ventas", section: "Clientes y ventas", route: "/sales", status: "live", icon: "Handshake", reach: "sidebar", note: "Leads, oportunidades, propuestas y formularios." },
  { id: "conversations", name: "Conversaciones", section: "Clientes y ventas", route: "/conversations", status: "live", icon: "MessagesSquare", reach: "sidebar", note: "Hilos con clientes y llamadas." },
  { id: "schedule", name: "Agenda", section: "Clientes y ventas", route: "/schedule", status: "live", icon: "CalendarDays", reach: "sidebar", note: "Solo si se fija en Mi perfil → Accesos." },

  // Equipo
  { id: "agents", name: "Equipo (agentes)", section: "Equipo", route: "/agents/all", status: "live", icon: "Bot", reach: "sidebar", note: "Roster, organigrama y creación." },
  { id: "office", name: "Oficina", section: "Equipo", route: "/office", status: "live", icon: "Armchair", reach: "sidebar", note: "Vista visual del equipo; solo si se fija." },
  { id: "skills", name: "Habilidades", section: "Equipo", route: "/skills", status: "live", icon: "Sparkles", reach: "contextual", note: "Biblioteca, fuentes y Skill Studio." },
  { id: "autonomy", name: "Autonomía", section: "Equipo", route: "/autonomy", status: "live", icon: "Gauge", reach: "contextual", note: "Gobernanza y banco de pruebas por agente y acción." },
  { id: "builder", name: "Editor de configuración avanzada", section: "Equipo", route: "/business-builder", status: "live", icon: "Wrench", reach: "contextual", note: "R5: pendiente de decidir; el banco de autonomía ya enlaza a Autonomía." },
  { id: "catalog", name: "Catálogo privado", section: "Equipo", route: "/portable-catalog", status: "live", icon: "Package", reach: "contextual", note: "Plantillas reutilizables." },
  { id: "marketplace", name: "Catálogo compartido", section: "Equipo", route: "/public-catalog", status: "live", icon: "Store", reach: "contextual", note: "Producto adicional sin validar." },

  // Archivos y medios
  { id: "files", name: "Archivos", section: "Archivos y medios", route: "/artifacts", status: "live", icon: "FolderOpen", reach: "sidebar", note: "Explorador con vista de contexto (?context=1)." },
  { id: "context", name: "Contexto (página propia)", section: "Archivos y medios", route: "/artifacts/context", status: "retired", icon: "FileText", reach: "contextual", note: "R3: vista y filtros dentro de Archivos." },
  { id: "media-new", name: "Crear vídeo", section: "Archivos y medios", route: "/artifacts/media/new", status: "live", icon: "Clapperboard", reach: "contextual", note: "Plantillas de vídeo." },
  { id: "media-queue", name: "Cola de medios", section: "Archivos y medios", route: "/artifacts/media/queue", status: "live", icon: "ListVideo", reach: "contextual", note: "Trabajos globales, fallos y reintentos." },

  // Avanzado
  { id: "goals", name: "Objetivos", section: "Avanzado", route: "/goals", status: "live", icon: "Target", reach: "flag", note: "En la sidebar solo con su flag." },
  { id: "decisions", name: "Decisiones", section: "Avanzado", route: "/decisions", status: "live", icon: "ListChecks", reach: "flag", note: "Escritorio de decisiones y colas." },
  { id: "cases", name: "Casos", section: "Avanzado", route: "/cases", status: "live", icon: "Layers", reach: "flag", note: "Beta, con su flag." },
  { id: "pipelines", name: "Pipelines", section: "Avanzado", route: "/pipelines", status: "live", icon: "GitBranch", reach: "flag", note: "Etapas, revisión y aprendizajes." },
  { id: "status", name: "Tarjetas de estado", section: "Avanzado", route: "/status", status: "live", icon: "LayoutGrid", reach: "flag", note: "Beta." },
  { id: "workspaces", name: "Workspaces", section: "Avanzado", route: "/workspaces", status: "live", icon: "GitBranch", reach: "flag", note: "Inventario global de espacios de trabajo." },

  // Supervisión
  { id: "activity", name: "Actividad", section: "Supervisión", route: "/activity", status: "live", icon: "History", reach: "sidebar", note: "Actividad, ejecuciones, costes, presupuestos y cronología en pestañas." },
  { id: "notifications", name: "Avisos", section: "Supervisión", route: "/inbox/notifications", status: "live", icon: "Bell", reach: "contextual", note: "Listado de avisos; se resuelven en su origen." },

  // Apps
  { id: "apps", name: "Apps", section: "Apps", route: "/apps", status: "live", icon: "Unplug", reach: "sidebar", note: "Catálogo y conexiones." },
  { id: "channels", name: "Canales de clientes", section: "Apps", route: "/apps/channels", status: "live", icon: "Radio", reach: "contextual", note: "Desde Apps." },
  { id: "webchat", name: "Chat web", section: "Apps", route: "/apps/webchat", status: "live", icon: "MessageSquare", reach: "contextual", note: "Widget e identidad." },
  { id: "crm-sync", name: "Sincronización CRM", section: "Apps", route: "/apps/crm-sync", status: "live", icon: "RefreshCw", reach: "contextual", note: "Configuración y conflictos." },
  { id: "advanced-tools", name: "Herramientas avanzadas", section: "Apps", route: "/apps/advanced", status: "live", icon: "Settings2", reach: "contextual", note: "Perfiles y gateways." },

  // Ajustes personales
  { id: "profile", name: "Mi perfil", section: "Ajustes personales", route: "/company/settings/instance/profile", status: "live", icon: "UserRound", reach: "contextual", note: "Nombre, avatar, idioma y accesos de la sidebar." },
  { id: "language", name: "Idioma (página propia)", section: "Ajustes personales", route: "/company/settings/language", status: "retired", icon: "Languages", reach: "contextual", note: "R1: selector dentro de Mi perfil." },
  { id: "navigation", name: "Navegación (página propia)", section: "Ajustes personales", route: "/company/settings/navigation", status: "retired", icon: "PanelLeft", reach: "contextual", note: "R1: desplegable en Mi perfil." },
  { id: "notification-prefs", name: "Notificaciones", section: "Ajustes personales", route: "/company/settings/notifications", status: "live", icon: "BellRing", reach: "contextual", note: "Categorías, dispositivo, push y resumen diario." },
  { id: "security", name: "Acceso y sesiones", section: "Ajustes personales", route: "/company/settings/security", status: "live", icon: "KeyRound", reach: "contextual", note: "2FA y sesiones." },

  // Ajustes de empresa
  { id: "settings", name: "Ajustes (General)", section: "Ajustes de empresa", route: "/company/settings", status: "live", icon: "Settings", reach: "sidebar", note: "Identidad y apariencia de la empresa." },
  { id: "members", name: "Miembros", section: "Ajustes de empresa", route: "/company/settings/members", status: "live", icon: "UsersRound", reach: "contextual", note: "Roles e invitaciones." },
  { id: "secrets", name: "Secretos", section: "Ajustes de empresa", route: "/company/settings/secrets", status: "live", icon: "Lock", reach: "contextual", note: "Credenciales con permisos propios." },
  { id: "retention", name: "Datos y retención", section: "Ajustes de empresa", route: "/company/settings/retention", status: "live", icon: "Archive", reach: "contextual", note: "Previsualiza y confirma purgas." },
  { id: "developer", name: "API y webhooks", section: "Ajustes de empresa", route: "/company/settings/developer", status: "live", icon: "Code", reach: "contextual", note: "Claves y entregas." },
  { id: "export", name: "Exportar", section: "Ajustes de empresa", route: "/company/export", status: "live", icon: "Download", reach: "contextual", note: "Portabilidad." },
  { id: "import", name: "Importar", section: "Ajustes de empresa", route: "/company/import", status: "live", icon: "Upload", reach: "contextual", note: "Asistente; bloqueado en cloud." },

  // Cuenta comercial
  { id: "accounts", name: "Cuentas comerciales", section: "Cuenta comercial", route: "/company/settings/accounts", status: "live", icon: "Building2", reach: "contextual", note: "Titularidad, empresas, miembros y zona de peligro." },
  { id: "account-deletion", name: "Eliminar cuenta (página propia)", section: "Cuenta comercial", route: "/company/settings/account-deletion", status: "retired", icon: "Trash2", reach: "contextual", note: "R1: en la tarjeta de cada cuenta." },
  { id: "billing", name: "Facturación", section: "Cuenta comercial", route: "/company/settings/billing", status: "live", icon: "CreditCard", reach: "contextual", note: "Plan, facturas y proveedor de pago." },
  { id: "installations", name: "Instalaciones gestionadas", section: "Cuenta comercial", route: "/company/settings/installations", status: "live", icon: "Server", reach: "contextual", note: "Empresas para terceros; fuera del recorrido inicial." },

  // Administración de instancia
  { id: "instance-access", name: "Acceso de instancia", section: "Administración de instancia", route: "/company/settings/instance/access", status: "live", icon: "ShieldUser", reach: "contextual", note: "Solo administradores." },
  { id: "environments", name: "Entornos", section: "Administración de instancia", route: "/company/settings/instance/environments", status: "live", icon: "Boxes", reach: "contextual", note: "Runtime de agentes." },
  { id: "plugins", name: "Plugins", section: "Administración de instancia", route: "/company/settings/instance/plugins", status: "live", icon: "Puzzle", reach: "contextual", note: "Extensiones." },
  { id: "adapters", name: "Adaptadores", section: "Administración de instancia", route: "/company/settings/instance/adapters", status: "live", icon: "Cpu", reach: "contextual", note: "Operación técnica." },
  { id: "experimental", name: "Opciones experimentales", section: "Administración de instancia", route: "/company/settings/instance/experimental", status: "live", icon: "FlaskConical", reach: "contextual", note: "Flags de la instalación." },

  // Páginas públicas
  { id: "portal", name: "Portal del cliente", section: "Páginas públicas", route: "/portal/:portalId", status: "live", icon: "Globe", reach: "public", note: "Enlace que se da al cliente." },
  { id: "public-review", name: "Revisión de entregable", section: "Páginas públicas", route: "/review/:companyId/:linkId", status: "live", icon: "FileCheck", reach: "public", note: "Decisión sobre una versión concreta." },
  { id: "pricing", name: "Precios", section: "Páginas públicas", route: "/pricing", status: "live", icon: "Tag", reach: "public", note: "Depende del modelo de venta." },
];

export const PRODUCTION_URL = "https://paperclip.cosmonido.com";

export function pageById(id: string): ProductPage {
  const page = PRODUCT_PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Unknown product page "${id}" in the product map`);
  return page;
}
