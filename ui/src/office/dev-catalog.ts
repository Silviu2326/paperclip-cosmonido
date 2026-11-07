import type { OfficeCatalog, OfficeCatalogObject, OfficeFacing } from "./catalog";

/** Marker URL: the atlas is generated at runtime on a canvas instead of fetched. */
export const DEV_ATLAS_URL = "dev:interior";
const T = 32;

interface DevArt { x: number; y: number; w: number; h: number; fill: string; edge: string; detail?: string }
const OBJECT_ART: Record<string, DevArt> = {
  desk: { x: 0, y: 64, w: 64, h: 48, fill: "#a9743f", edge: "#5a3a1c", detail: "#3b4a5a" },
  chair: { x: 64, y: 64, w: 32, h: 32, fill: "#3d5a80", edge: "#1d2f4a" },
  plant: { x: 96, y: 64, w: 32, h: 48, fill: "#3f8f4a", edge: "#1f4d27", detail: "#8a5a2b" },
  sofa: { x: 0, y: 128, w: 64, h: 32, fill: "#b04a4a", edge: "#612424" },
  coffee: { x: 64, y: 128, w: 32, h: 48, fill: "#d9d2c3", edge: "#6b6354", detail: "#4a3320" },
  window: { x: 96, y: 128, w: 32, h: 32, fill: "#8fc8ef", edge: "#f1f1f1" },
  bookshelf: { x: 0, y: 176, w: 32, h: 64, fill: "#7a4f2a", edge: "#40270f", detail: "#c9a14a" },
  whiteboard: { x: 32, y: 176, w: 64, h: 32, fill: "#f4f4f0", edge: "#777777", detail: "#4a76c9" },
};

/** Paints the development atlas: 32 px floor and wall tiles on row 0 and 1, object art below. Null when 2D canvas is unavailable. */
export function createDevAtlas(): CanvasImageSource | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rect = (x: number, y: number, w: number, h: number, fill: string, edge: string) => {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  rect(0, 0, T, T, "#c99a5b", "#b4864a");
  rect(T, 0, T, T, "#55708f", "#46607d");
  rect(2 * T, 0, T, T, "#d8d2c6", "#b9b2a4");
  rect(3 * T, 0, T, T, "#cfc8ba", "#8d8676");
  for (const art of Object.values(OBJECT_ART)) {
    rect(art.x, art.y, art.w, art.h, art.fill, art.edge);
    if (art.detail) { ctx.fillStyle = art.detail; ctx.fillRect(art.x + 8, art.y + 8, art.w - 16, Math.max(4, art.h / 4)); }
  }
  return canvas;
}

function object(art: string, w: number, h: number, es: string, en: string, extra: Partial<OfficeCatalogObject> = {}): OfficeCatalogObject {
  const a = OBJECT_ART[art];
  return { atlas: "interior", x: a.x, y: a.y, w: a.w, h: a.h, footprint: { w, h }, walkable: false, label: { es, en }, ...extra };
}
const seat = (dx: number, dy: number, facing: OfficeFacing) => ({ dx, dy, facing });

/** Same shape as /office/catalog.json, used until the real atlas ships or when it fails to load. */
export const DEV_CATALOG: OfficeCatalog = {
  version: 1,
  tileSize: T,
  atlases: { interior: DEV_ATLAS_URL },
  floors: {
    wood: { atlas: "interior", x: 0, y: 0 },
    carpet_blue: { atlas: "interior", x: T, y: 0 },
  },
  walls: { plaster: { atlas: "interior", top: { x: 2 * T, y: 0 }, face: { x: 3 * T, y: 0 } } },
  objects: {
    desk: object("desk", 2, 1, "Mesa", "Desk", { seat: seat(0, 1, "up") }),
    chair: object("chair", 1, 1, "Silla", "Chair", { walkable: true, seat: seat(0, 0, "down") }),
    plant: object("plant", 1, 1, "Planta", "Plant"),
    sofa: object("sofa", 2, 1, "Sofá", "Sofa", { seat: seat(0, 0, "down") }),
    coffee: object("coffee", 1, 1, "Cafetera", "Coffee machine"),
    window: object("window", 1, 1, "Ventana", "Window"),
    bookshelf: object("bookshelf", 1, 1, "Estantería", "Bookshelf"),
    whiteboard: object("whiteboard", 2, 1, "Pizarra", "Whiteboard"),
  },
};
