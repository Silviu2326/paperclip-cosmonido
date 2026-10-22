import type { OfficeCatalogShape } from "@paperclipai/shared";
import { createDevAtlas, DEV_ATLAS_URL, DEV_CATALOG } from "./dev-catalog";

export type OfficeFacing = "up" | "down" | "left" | "right";
export interface OfficeAtlasPoint { x: number; y: number }
export interface OfficeCatalogObject {
  atlas: string;
  x: number; y: number; w: number; h: number;
  footprint: { w: number; h: number };
  walkable: boolean;
  seat?: { dx: number; dy: number; facing: OfficeFacing };
  label: { es: string; en: string };
}
/** Contract 1 (doc/plans/2026-10-21-oficina-pixel-art.md): `/office/catalog.json`. */
export interface OfficeCatalog extends OfficeCatalogShape {
  version: number;
  tileSize: number;
  atlases: Record<string, string>;
  floors: Record<string, { atlas: string; x: number; y: number }>;
  walls: Record<string, { atlas: string; top: OfficeAtlasPoint; face: OfficeAtlasPoint }>;
  objects: Record<string, OfficeCatalogObject>;
}
export type OfficeAtlases = Record<string, CanvasImageSource>;

export const OFFICE_CATALOG_URL = "/office/catalog.json";
export const OFFICE_CREDITS_URL = "/office/CREDITS-office.csv";

function isCatalog(value: unknown): value is OfficeCatalog {
  const catalog = value as Partial<OfficeCatalog> | null;
  return Boolean(catalog && typeof catalog === "object" && catalog.atlases && catalog.floors && catalog.walls && catalog.objects
    && Object.keys(catalog.objects).length > 0 && Object.keys(catalog.floors).length > 0 && Object.keys(catalog.walls).length > 0);
}

/** Loads the shipped catalog; any failure (404, bad JSON, wrong shape) falls back to the built-in development catalog. */
export async function loadOfficeCatalog(fetcher: typeof fetch = fetch): Promise<{ catalog: OfficeCatalog; source: "file" | "dev" }> {
  try {
    const response = await fetcher(OFFICE_CATALOG_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const json: unknown = await response.json();
    if (!isCatalog(json)) throw new Error("catalog shape");
    return { catalog: json, source: "file" };
  } catch {
    return { catalog: DEV_CATALOG, source: "dev" };
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`atlas ${url}`));
    image.src = url;
  });
}

/** Resolves every atlas of the catalog; `dev:` atlases are painted on a canvas. A failing atlas is left out (its tiles are skipped). */
export async function loadOfficeAtlases(catalog: OfficeCatalog): Promise<OfficeAtlases> {
  const atlases: OfficeAtlases = {};
  await Promise.all(Object.entries(catalog.atlases).map(async ([name, url]) => {
    try {
      if (url === DEV_ATLAS_URL) { const atlas = createDevAtlas(); if (atlas) atlases[name] = atlas; }
      else atlases[name] = await loadImage(url);
    } catch { /* tiles of a missing atlas are skipped */ }
  }));
  return atlases;
}

export function officeObjectLabel(catalog: OfficeCatalog, kind: string, language: string): string {
  const label = catalog.objects[kind]?.label;
  if (!label) return kind;
  return language.startsWith("es") ? label.es : label.en;
}
