/**
 * Demo data for the Archivos proposal. File fields mirror CompanyFile
 * (contentType, byteSize, versionCount, audienceKind, validUntil, contextRole,
 * usedInIssueCount, agentVisible, folderPath). Folders mirror the Entrada /
 * Salida roots of the real explorer.
 */
export type FileKind = "image" | "video" | "document" | "audio" | "spreadsheet";
export type ContextRole = "offer" | "brand" | "procedure" | "customer" | "other";
export type AudienceKind = "company" | "project" | "customer";

export interface DemoFolder {
  id: string;
  name: string;
  parentId: string | null;
  root: "in" | "out";
}

export interface DemoVersion {
  number: number;
  by: string;
  at: string;
  note: string | null;
  bytes: number;
}

export interface DemoFile {
  id: string;
  name: string;
  folderId: string;
  kind: FileKind;
  contentType: string;
  bytes: number;
  by: string;
  updatedAt: string;
  agentVisible: boolean;
  contextRole: ContextRole | null;
  audienceKind: AudienceKind;
  audienceLabel: string | null;
  validUntil: string | null;
  usedIn: { id: string; title: string }[];
  versions: DemoVersion[];
  /** Short text shown in the preview for documents. */
  excerpt?: string;
}

export const DEMO_FOLDERS: DemoFolder[] = [
  { id: "in", name: "Entrada", parentId: null, root: "in" },
  { id: "in-brand", name: "Marca y guías", parentId: "in", root: "in" },
  { id: "in-clients", name: "Material de clientes", parentId: "in", root: "in" },
  { id: "in-sonrisa", name: "Clínica Sonrisa", parentId: "in-clients", root: "in" },
  { id: "in-yoga", name: "Yoga Bahía", parentId: "in-clients", root: "in" },
  { id: "out", name: "Salida", parentId: null, root: "out" },
  { id: "out-posts", name: "Publicaciones", parentId: "out", root: "out" },
  { id: "out-video", name: "Vídeos", parentId: "out", root: "out" },
  { id: "out-docs", name: "Propuestas y documentos", parentId: "out", root: "out" },
];

const MB = 1024 * 1024;
const v = (number: number, by: string, at: string, bytes: number, note: string | null = null): DemoVersion => ({ number, by, at, bytes, note });

export const DEMO_FILES: DemoFile[] = [
  {
    id: "f1", name: "Guía de marca Cosmonido.pdf", folderId: "in-brand", kind: "document", contentType: "application/pdf", bytes: 4.2 * MB,
    by: "Silviu", updatedAt: "hace 3 días", agentVisible: true, contextRole: "brand", audienceKind: "company", audienceLabel: null, validUntil: null,
    usedIn: [{ id: "PAP-398", title: "Plantilla de carruseles" }, { id: "PAP-412", title: "Calendario de noviembre" }],
    versions: [v(3, "Silviu", "hace 3 días", 4.2 * MB, "Nuevos colores y tipografía"), v(2, "Silviu", "hace 1 mes", 3.9 * MB), v(1, "Silviu", "hace 4 meses", 3.1 * MB, "Primera versión")],
    excerpt: "Tono cercano y profesional. Colores: turquesa, menta y celeste. Evitar rojos salvo avisos graves. Titulares en tipografía serif.",
  },
  {
    id: "f2", name: "Tarifas y servicios 2026.pdf", folderId: "in-brand", kind: "document", contentType: "application/pdf", bytes: 1.1 * MB,
    by: "Silviu", updatedAt: "hace 2 semanas", agentVisible: true, contextRole: "offer", audienceKind: "company", audienceLabel: null, validUntil: "2026-12-31",
    usedIn: [{ id: "PAP-418", title: "Propuesta rediseño portfolio" }],
    versions: [v(2, "Silviu", "hace 2 semanas", 1.1 * MB, "Subida de precios en redes"), v(1, "Silviu", "hace 6 meses", 1.0 * MB)],
    excerpt: "Gestión de redes desde 320 €/mes. Web con reservas desde 2.400 €. Campañas Google Ads desde 350 €/mes.",
  },
  {
    id: "f3", name: "Cómo respondemos a un cliente enfadado.md", folderId: "in-brand", kind: "document", contentType: "text/markdown", bytes: 0.02 * MB,
    by: "Silviu", updatedAt: "hace 1 mes", agentVisible: true, contextRole: "procedure", audienceKind: "company", audienceLabel: null, validUntil: null,
    usedIn: [], versions: [v(1, "Silviu", "hace 1 mes", 0.02 * MB)],
    excerpt: "1. Agradece el aviso. 2. Resume el problema con sus palabras. 3. Propón una solución y una fecha. 4. Si hay compensación, consúltalo con Silviu.",
  },
  {
    id: "f4", name: "Fotos consulta y equipo.zip", folderId: "in-sonrisa", kind: "image", contentType: "image/jpeg", bytes: 38.4 * MB,
    by: "Laura Gómez", updatedAt: "ayer", agentVisible: true, contextRole: "customer", audienceKind: "customer", audienceLabel: "Clínica Dental Sonrisa", validUntil: "2027-03-01",
    usedIn: [{ id: "PAP-412", title: "Calendario de noviembre" }, { id: "PAP-399", title: "Vídeo de bienvenida" }],
    versions: [v(1, "Laura Gómez", "ayer", 38.4 * MB)],
  },
  {
    id: "f5", name: "Logo clínica (vectorial).svg", folderId: "in-sonrisa", kind: "image", contentType: "image/svg+xml", bytes: 0.08 * MB,
    by: "Laura Gómez", updatedAt: "hace 5 días", agentVisible: true, contextRole: "brand", audienceKind: "customer", audienceLabel: "Clínica Dental Sonrisa", validUntil: null,
    usedIn: [{ id: "PAP-398", title: "Plantilla de carruseles" }], versions: [v(1, "Laura Gómez", "hace 5 días", 0.08 * MB)],
  },
  {
    id: "f6", name: "Briefing Yoga Bahía.docx", folderId: "in-yoga", kind: "document", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 0.3 * MB,
    by: "Sara Vidal", updatedAt: "hace 2 semanas", agentVisible: true, contextRole: "customer", audienceKind: "customer", audienceLabel: "Yoga Bahía", validUntil: null,
    usedIn: [{ id: "PAP-399", title: "Vídeo de bienvenida" }], versions: [v(2, "Sara Vidal", "hace 2 semanas", 0.3 * MB, "Añadió horarios de otoño"), v(1, "Sara Vidal", "hace 2 meses", 0.2 * MB)],
    excerpt: "Clases de vinyasa y yin. Público: mujeres 30-50. Tono: calmado, sin jerga. Evitar promesas de salud.",
  },
  {
    id: "f7", name: "Música ambiente licenciada.mp3", folderId: "in-yoga", kind: "audio", contentType: "audio/mpeg", bytes: 6.7 * MB,
    by: "Silviu", updatedAt: "hace 1 semana", agentVisible: false, contextRole: null, audienceKind: "project", audienceLabel: "Instagram Yoga Bahía", validUntil: "2026-11-02",
    usedIn: [{ id: "PAP-399", title: "Vídeo de bienvenida" }], versions: [v(1, "Silviu", "hace 1 semana", 6.7 * MB)],
  },
  {
    id: "f8", name: "Blanqueamiento sin miedo — carrusel.png", folderId: "out-posts", kind: "image", contentType: "image/png", bytes: 2.4 * MB,
    by: "Marta", updatedAt: "hace 40 min", agentVisible: true, contextRole: null, audienceKind: "customer", audienceLabel: "Clínica Dental Sonrisa", validUntil: null,
    usedIn: [{ id: "PAP-412", title: "Calendario de noviembre" }], versions: [v(2, "Marta", "hace 40 min", 2.4 * MB, "Ajustado al color de la clínica"), v(1, "Marta", "hace 2 h", 2.3 * MB)],
  },
  {
    id: "f9", name: "Mitos de la ortodoncia — carrusel.png", folderId: "out-posts", kind: "image", contentType: "image/png", bytes: 2.1 * MB,
    by: "Marta", updatedAt: "hace 1 h", agentVisible: true, contextRole: null, audienceKind: "customer", audienceLabel: "Clínica Dental Sonrisa", validUntil: null,
    usedIn: [{ id: "PAP-412", title: "Calendario de noviembre" }], versions: [v(1, "Marta", "hace 1 h", 2.1 * MB)],
  },
  {
    id: "f10", name: "Bienvenida Yoga Bahía.mp4", folderId: "out-video", kind: "video", contentType: "video/mp4", bytes: 54.0 * MB,
    by: "Leo", updatedAt: "ayer", agentVisible: true, contextRole: null, audienceKind: "customer", audienceLabel: "Yoga Bahía", validUntil: null,
    usedIn: [{ id: "PAP-399", title: "Vídeo de bienvenida" }], versions: [v(2, "Leo", "ayer", 54.0 * MB, "Subtítulos corregidos"), v(1, "Leo", "hace 2 días", 52.3 * MB)],
  },
  {
    id: "f11", name: "Propuesta rediseño portfolio.pdf", folderId: "out-docs", kind: "document", contentType: "application/pdf", bytes: 1.8 * MB,
    by: "Diego", updatedAt: "hace 3 semanas", agentVisible: true, contextRole: null, audienceKind: "customer", audienceLabel: "Estudio Arquitectura Norte", validUntil: "2026-11-30",
    usedIn: [{ id: "PAP-418", title: "Propuesta rediseño portfolio" }], versions: [v(2, "Diego", "hace 3 semanas", 1.8 * MB, "Alcance con blog"), v(1, "Diego", "hace 1 mes", 1.6 * MB)],
    excerpt: "Rediseño del portfolio de proyectos con galería por obra, blog y SEO inicial. Plazo: 4 semanas. Inversión: 3.800 €.",
  },
  {
    id: "f12", name: "Facturación septiembre.xlsx", folderId: "out-docs", kind: "spreadsheet", contentType: "application/vnd.ms-excel", bytes: 0.2 * MB,
    by: "Silviu", updatedAt: "hace 3 semanas", agentVisible: false, contextRole: null, audienceKind: "company", audienceLabel: null, validUntil: "2026-10-20",
    usedIn: [], versions: [v(1, "Silviu", "hace 3 semanas", 0.2 * MB)],
  },
];

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Demo "now" so the expiry badges are deterministic. */
export const DEMO_NOW = new Date("2026-10-24T09:00:00Z");

export function expiryState(validUntil: string | null): "none" | "ok" | "soon" | "expired" {
  if (!validUntil) return "none";
  const days = (new Date(validUntil).getTime() - DEMO_NOW.getTime()) / 86_400_000;
  return days < 0 ? "expired" : days <= 14 ? "soon" : "ok";
}
