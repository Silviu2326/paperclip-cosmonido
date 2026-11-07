import {
  DEMO_FILES,
  DEMO_FOLDERS,
  type AudienceKind,
  type ContextRole,
  type DemoFile,
  type DemoFolder,
  type FileKind,
} from "./demo-data";

/**
 * Scenarios for the Archivos proposal. One config object drives every state
 * (loading, error, huge folder, read-only, uploads…) so the explorer renders
 * every situation without copying components.
 */
export type FilesScenario =
  | "normal"
  | "vacio"
  | "cargando"
  | "error"
  | "muchisimos"
  | "textos-largos"
  | "sin-permisos"
  | "subiendo"
  | "subida-fallida"
  | "caducado"
  | "no-autorizado"
  | "cuota-llena";

export interface DemoUpload {
  id: string;
  name: string;
  bytes: number;
  progress: number;
  status: "waiting" | "uploading" | "done" | "failed";
  /** Progress added every tick while uploading (percentage points). */
  speed: number;
  error?: string;
}

export interface FilesConfig {
  scenario: FilesScenario;
  files: DemoFile[];
  folders: DemoFolder[];
  /** The user can look but not upload or edit agent context. */
  readOnly: boolean;
  lockedFolderIds: string[];
  /** Files of a private project the user is not a member of. */
  lockedFileIds: string[];
  quota: { usedBytes: number; totalBytes: number };
  uploads: DemoUpload[];
  selectedId: string | null;
  folderId: string;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

const KIND_TYPES: Record<FileKind, { ext: string; type: string; mb: number }> = {
  image: { ext: "png", type: "image/png", mb: 2.2 },
  video: { ext: "mp4", type: "video/mp4", mb: 48 },
  document: { ext: "pdf", type: "application/pdf", mb: 1.4 },
  audio: { ext: "mp3", type: "audio/mpeg", mb: 5.5 },
  spreadsheet: { ext: "xlsx", type: "application/vnd.ms-excel", mb: 0.3 },
};

const CUSTOMERS = ["Clínica Dental Sonrisa", "Panadería La Espiga", "Estudio Arquitectura Norte", "Yoga Bahía", "Taller Mecánico Ruedas", "Lucía Martín", "Academia Ibáñez", "Gimnasio Fuerte"];
const SUBJECTS = ["Carrusel", "Reel", "Briefing", "Propuesta", "Factura", "Foto de equipo", "Guion", "Informe mensual", "Logo", "Presupuesto", "Calendario", "Newsletter"];
const OWNERS = ["Marta", "Diego", "Leo", "Nora", "Silviu"];
const KINDS: FileKind[] = ["image", "document", "image", "video", "document", "audio", "spreadsheet", "image"];
const WHEN = ["hace 5 min", "hace 2 h", "ayer", "hace 3 días", "hace 1 semana", "hace 2 semanas", "hace 1 mes"];
const FOLDER_IDS = ["in-brand", "in-sonrisa", "in-yoga", "out-posts", "out-video", "out-docs"];

/** Deterministic pseudo-random so screenshots are stable. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function generated(count: number): DemoFile[] {
  const next = rng(42);
  return Array.from({ length: count }, (_, index) => {
    const kind = KINDS[Math.floor(next() * KINDS.length)]!;
    const spec = KIND_TYPES[kind];
    const customer = CUSTOMERS[Math.floor(next() * CUSTOMERS.length)]!;
    const subject = SUBJECTS[Math.floor(next() * SUBJECTS.length)]!;
    const roleRoll = next();
    const contextRole: ContextRole | null = roleRoll > 0.85 ? "customer" : roleRoll > 0.8 ? "brand" : roleRoll > 0.77 ? "procedure" : null;
    const audienceRoll = next();
    const audienceKind: AudienceKind = audienceRoll > 0.7 ? "company" : audienceRoll > 0.25 ? "customer" : "project";
    const expiryRoll = next();
    const bytes = spec.mb * MB * (0.4 + next() * 1.4);
    return {
      id: `g${index}`,
      name: `${subject} ${customer.split(" ")[0]} ${String(index + 1).padStart(3, "0")}.${spec.ext}`,
      folderId: FOLDER_IDS[Math.floor(next() * FOLDER_IDS.length)]!,
      kind,
      contentType: spec.type,
      bytes,
      by: OWNERS[Math.floor(next() * OWNERS.length)]!,
      updatedAt: WHEN[Math.floor(next() * WHEN.length)]!,
      agentVisible: next() > 0.3,
      contextRole,
      audienceKind,
      audienceLabel: audienceKind === "company" ? null : audienceKind === "project" ? `Proyecto ${customer.split(" ")[0]}` : customer,
      validUntil: expiryRoll > 0.93 ? "2026-10-12" : expiryRoll > 0.88 ? "2026-11-03" : null,
      usedIn: next() > 0.6 ? [{ id: `PAP-${400 + (index % 40)}`, title: `${subject} de ${customer}` }] : [],
      versions: [{ number: 1, by: OWNERS[0]!, at: WHEN[0]!, note: null, bytes }],
    } satisfies DemoFile;
  });
}

const LONG_FOLDER = "Material de clientes — Asociación de Vecinos y Comerciantes del Casco Antiguo de Cartagena";
const LONG_NAMES: { name: string; kind: FileKind; excerpt?: string }[] = [
  { name: "Propuesta_de_rediseno_integral_de_identidad_visual_y_sitio_web_corporativo_con_blog_y_tienda_online_version_final_revisada_por_direccion_v7_DEFINITIVO.pdf", kind: "document", excerpt: "Un documento con un nombre de 150 caracteres sin espacios para comprobar que la lista, la tarjeta y la vista previa no se desbordan." },
  { name: "Reunión de seguimiento con Ñandú & Hijos S.L. — resumen, acuerdos y próximos pasos (octubre–noviembre) 📌.docx", kind: "document", excerpt: "Acentos, eñes, símbolos y emoji en el nombre." },
  { name: "ملف_العميل_الجديد_تقرير_شهري.pdf", kind: "document", excerpt: "Nombre en árabe (de derecha a izquierda)." },
  { name: "社内資料・マーケティング計画_2026年第4四半期.xlsx", kind: "spreadsheet" },
  { name: "foto.png", kind: "image" },
  { name: "Entrevista a la propietaria de la floristería sobre los orígenes del negocio familiar y su visión de futuro (audio completo sin editar).mp3", kind: "audio" },
  { name: "IMG_20261023_171532_HDR_PANO_EDITADA_FINAL_FINAL_2_copia_de_copia.png", kind: "image" },
  { name: "Vídeo de presentación del equipo para la web — plano general, entrevistas individuales y tomas de recurso.mp4", kind: "video" },
];

function longTextFiles(): DemoFile[] {
  const base = DEMO_FILES.slice(0, 4).map((file) => ({ ...file, folderId: "in-long" }));
  const extra: DemoFile[] = LONG_NAMES.map((item, index) => {
    const spec = KIND_TYPES[item.kind];
    return {
      id: `long${index}`,
      name: item.name,
      folderId: index % 2 === 0 ? "in-long" : "in-brand",
      kind: item.kind,
      contentType: spec.type,
      bytes: spec.mb * MB,
      by: index === 0 ? "María de los Ángeles Fernández-Villaverde y Domínguez" : "Silviu",
      updatedAt: "hace 3 días",
      agentVisible: true,
      contextRole: index === 0 ? "offer" : null,
      audienceKind: index === 1 ? "customer" : "company",
      audienceLabel: index === 1 ? "Ñandú & Hijos, Sociedad Limitada de Responsabilidad" : null,
      validUntil: null,
      usedIn: index === 0 ? [{ id: "PAP-418", title: "Propuesta de rediseño integral del portfolio con galería por obra, blog y posicionamiento SEO inicial" }] : [],
      versions: [{ number: 1, by: "Silviu", at: "hace 3 días", note: index === 0 ? "Nota de versión muy larga para comprobar que el historial también se ajusta al ancho del panel lateral sin romper nada." : null, bytes: spec.mb * MB }],
      excerpt: item.excerpt,
    };
  });
  return [...extra, ...base];
}

function config(overrides: Partial<FilesConfig> & Pick<FilesConfig, "scenario">): FilesConfig {
  return {
    files: DEMO_FILES,
    folders: DEMO_FOLDERS,
    readOnly: false,
    lockedFolderIds: [],
    lockedFileIds: [],
    quota: { usedBytes: DEMO_FILES.reduce((sum, file) => sum + file.bytes, 0), totalBytes: 20 * GB },
    uploads: [],
    selectedId: DEMO_FILES[0]!.id,
    folderId: "in",
    ...overrides,
  };
}

export function filesConfig(scenario: FilesScenario): FilesConfig {
  switch (scenario) {
    case "vacio":
      return config({ scenario, files: [], selectedId: null, quota: { usedBytes: 0, totalBytes: 20 * GB } });
    case "cargando":
    case "error":
      return config({ scenario });
    case "muchisimos": {
      const files = [...generated(176), ...DEMO_FILES];
      return config({ scenario, files, selectedId: null, quota: { usedBytes: files.reduce((sum, file) => sum + file.bytes, 0), totalBytes: 20 * GB } });
    }
    case "textos-largos": {
      const folders: DemoFolder[] = [...DEMO_FOLDERS, { id: "in-long", name: LONG_FOLDER, parentId: "in-clients", root: "in" }];
      const files = longTextFiles();
      return config({ scenario, files, folders, folderId: "in-long", selectedId: files[0]!.id });
    }
    case "sin-permisos":
      return config({ scenario, readOnly: true, lockedFolderIds: ["in-yoga", "out-docs"], selectedId: "f1" });
    case "subiendo":
      return config({
        scenario,
        selectedId: "f1",
        uploads: [
          { id: "u1", name: "Fotos del equipo — sesión octubre.zip", bytes: 84 * MB, progress: 22, status: "uploading", speed: 0.6 },
          { id: "u2", name: "Guion del vídeo de bienvenida.docx", bytes: 0.4 * MB, progress: 68, status: "uploading", speed: 1.1 },
          { id: "u3", name: "Tarifas 2027 (borrador).pdf", bytes: 1.6 * MB, progress: 0, status: "waiting", speed: 0.9 },
          { id: "u4", name: "Logo nuevo.svg", bytes: 0.1 * MB, progress: 0, status: "waiting", speed: 1.4 },
        ],
      });
    case "subida-fallida":
      return config({
        scenario,
        selectedId: "f1",
        uploads: [
          { id: "u1", name: "Entrevista cliente 41 min.mp4", bytes: 412 * MB, progress: 57, status: "failed", speed: 1.2, error: "Se cortó la conexión a mitad de la subida." },
          { id: "u2", name: "Briefing Gimnasio Fuerte.pdf", bytes: 0.9 * MB, progress: 100, status: "done", speed: 1 },
          { id: "u3", name: "Datos.exe", bytes: 3 * MB, progress: 0, status: "failed", speed: 1, error: "Este tipo de archivo no está permitido. Prueba con PDF, imagen, vídeo, audio o documento." },
        ],
      });
    case "caducado": {
      const files = DEMO_FILES.map((file) => file.id === "f2" ? { ...file, validUntil: "2026-10-20" } : file.id === "f12" ? { ...file, contextRole: "offer" as const, validUntil: "2026-10-01" } : file.id === "f7" ? { ...file, validUntil: "2026-10-14", contextRole: "other" as const } : file);
      return config({ scenario, files, selectedId: "f2" });
    }
    case "no-autorizado": {
      const files = DEMO_FILES.map((file) => file.id === "f7" || file.id === "f9" ? { ...file, audienceKind: "project" as const, audienceLabel: "Proyecto Confidencial — Fusión" } : file);
      return config({ scenario, files, lockedFileIds: ["f7", "f9"], selectedId: "f7" });
    }
    case "cuota-llena": {
      const used = 18.8 * GB;
      return config({ scenario, quota: { usedBytes: used, totalBytes: 20 * GB }, selectedId: "f4" });
    }
    default:
      return config({ scenario: "normal" });
  }
}

export const FILES_SCENARIO_LABEL: Record<FilesScenario, string> = {
  normal: "Normal",
  vacio: "Vacío",
  cargando: "Cargando",
  error: "Error de carga",
  muchisimos: "Muchísimos archivos",
  "textos-largos": "Textos largos",
  "sin-permisos": "Sin permisos",
  subiendo: "Subida en curso",
  "subida-fallida": "Subida fallida",
  caducado: "Archivo caducado",
  "no-autorizado": "Proyecto no autorizado",
  "cuota-llena": "Cuota casi llena",
};
