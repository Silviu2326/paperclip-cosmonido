import { z } from "zod";

/**
 * Pixel-art office: a per-user, per-company tile layout rendered by the UI
 * (doc/plans/2026-10-21-oficina-pixel-art.md). Objects reference kinds from the
 * UI tile catalog; the schema only knows the catalog's shape, never its art.
 */
export const OFFICE_TILE_SIZE = 32;
export const OFFICE_MIN_COLS = 8, OFFICE_MAX_COLS = 40, OFFICE_MIN_ROWS = 6, OFFICE_MAX_ROWS = 30;

export const officeObjectSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.string().min(1).max(40),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  agentId: z.uuid().optional(),
  label: z.string().max(40).optional(),
}).strict();
export type OfficeObject = z.infer<typeof officeObjectSchema>;

export const officeLayoutSchema = z.object({
  version: z.literal(1),
  cols: z.number().int().min(OFFICE_MIN_COLS).max(OFFICE_MAX_COLS),
  rows: z.number().int().min(OFFICE_MIN_ROWS).max(OFFICE_MAX_ROWS),
  floor: z.string().min(1).max(40),
  wall: z.string().min(1).max(40),
  objects: z.array(officeObjectSchema).max(400),
}).strict();
export type OfficeLayout = z.infer<typeof officeLayoutSchema>;

export const officePatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), kind: z.string().min(1).max(40), x: z.number().int().min(0), y: z.number().int().min(0), agentId: z.uuid().optional(), label: z.string().max(40).optional(), id: z.string().min(1).max(40).optional() }).strict(),
  z.object({ op: z.literal("move"), id: z.string().min(1).max(40), x: z.number().int().min(0), y: z.number().int().min(0) }).strict(),
  z.object({ op: z.literal("remove"), id: z.string().min(1).max(40) }).strict(),
  z.object({ op: z.literal("assign"), id: z.string().min(1).max(40), agentId: z.uuid().nullable() }).strict(),
  z.object({ op: z.literal("theme"), floor: z.string().min(1).max(40).optional(), wall: z.string().min(1).max(40).optional() }).strict(),
  z.object({ op: z.literal("resize"), cols: z.number().int().min(OFFICE_MIN_COLS).max(OFFICE_MAX_COLS), rows: z.number().int().min(OFFICE_MIN_ROWS).max(OFFICE_MAX_ROWS) }).strict(),
]);
export type OfficePatchOp = z.infer<typeof officePatchOpSchema>;
export const officePatchSchema = z.array(officePatchOpSchema).max(50);
export type OfficePatch = z.infer<typeof officePatchSchema>;

/** The subset of the UI catalog the layout logic needs: footprints and walkability per object kind, plus theme ids. */
export interface OfficeCatalogShape {
  floors: Record<string, unknown>;
  walls: Record<string, unknown>;
  objects: Record<string, { footprint: { w: number; h: number }; walkable: boolean; seat?: { dx: number; dy: number; facing: "up" | "down" | "left" | "right" } }>;
}

export function officeObjectId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `o_${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
/** Tiles an object occupies: anchored at its bottom-left tile, footprint extends right and up. */
export function officeObjectTiles(object: Pick<OfficeObject, "x" | "y" | "kind">, catalog: OfficeCatalogShape): Array<[number, number]> {
  const footprint = catalog.objects[object.kind]?.footprint ?? { w: 1, h: 1 };
  const tiles: Array<[number, number]> = [];
  for (let dx = 0; dx < footprint.w; dx++) for (let dy = 0; dy < footprint.h; dy++) tiles.push([object.x + dx, object.y - dy]);
  return tiles;
}
function fits(layout: OfficeLayout, object: Pick<OfficeObject, "x" | "y" | "kind">, catalog: OfficeCatalogShape, ignoreId?: string): boolean {
  const tiles = officeObjectTiles(object, catalog);
  // Row 0 is the wall; furniture lives from row 1 down.
  if (tiles.some(([x, y]) => x < 0 || y < 1 || x >= layout.cols || y >= layout.rows)) return false;
  const occupied = new Set<string>();
  for (const other of layout.objects) {
    if (other.id === ignoreId) continue;
    for (const [x, y] of officeObjectTiles(other, catalog)) occupied.add(`${x},${y}`);
  }
  return !tiles.some(([x, y]) => occupied.has(`${x},${y}`));
}

/** Applies ops in order; invalid ones are skipped and reported, the rest still apply. */
export function applyOfficePatch(layout: OfficeLayout, patch: OfficePatch, catalog: OfficeCatalogShape): { layout: OfficeLayout; rejected: string[] } {
  let next: OfficeLayout = { ...layout, objects: layout.objects.map(object => ({ ...object })) };
  const rejected: string[] = [];
  for (const op of patch) {
    switch (op.op) {
      case "add": {
        if (!catalog.objects[op.kind]) { rejected.push(`unknown object kind ${op.kind}`); break; }
        const object: OfficeObject = { id: op.id ?? officeObjectId(), kind: op.kind, x: op.x, y: op.y, ...(op.agentId ? { agentId: op.agentId } : {}), ...(op.label ? { label: op.label } : {}) };
        if (next.objects.some(other => other.id === object.id)) { rejected.push(`duplicate object id ${object.id}`); break; }
        if (!fits(next, object, catalog)) { rejected.push(`${op.kind} does not fit at ${op.x},${op.y}`); break; }
        next = { ...next, objects: [...next.objects, object] };
        break;
      }
      case "move": {
        const object = next.objects.find(other => other.id === op.id);
        if (!object) { rejected.push(`unknown object ${op.id}`); break; }
        if (!fits(next, { ...object, x: op.x, y: op.y }, catalog, object.id)) { rejected.push(`${object.kind} does not fit at ${op.x},${op.y}`); break; }
        next = { ...next, objects: next.objects.map(other => other.id === op.id ? { ...other, x: op.x, y: op.y } : other) };
        break;
      }
      case "remove": {
        if (!next.objects.some(other => other.id === op.id)) { rejected.push(`unknown object ${op.id}`); break; }
        next = { ...next, objects: next.objects.filter(other => other.id !== op.id) };
        break;
      }
      case "assign": {
        const object = next.objects.find(other => other.id === op.id);
        if (!object) { rejected.push(`unknown object ${op.id}`); break; }
        if (!catalog.objects[object.kind]?.seat) { rejected.push(`${object.kind} has no seat`); break; }
        next = { ...next, objects: next.objects.map(other => {
          if (other.id === op.id) { const { agentId: _previous, ...rest } = other; return op.agentId ? { ...rest, agentId: op.agentId } : rest; }
          // One seat per agent.
          if (op.agentId && other.agentId === op.agentId) { const { agentId: _moved, ...rest } = other; return rest; }
          return other;
        }) };
        break;
      }
      case "theme": {
        if (op.floor && !catalog.floors[op.floor]) { rejected.push(`unknown floor ${op.floor}`); break; }
        if (op.wall && !catalog.walls[op.wall]) { rejected.push(`unknown wall ${op.wall}`); break; }
        next = { ...next, ...(op.floor ? { floor: op.floor } : {}), ...(op.wall ? { wall: op.wall } : {}) };
        break;
      }
      case "resize": {
        const resized = { ...next, cols: op.cols, rows: op.rows };
        const kept = next.objects.filter(object => fits({ ...resized, objects: [] }, object, catalog));
        if (kept.length !== next.objects.length) rejected.push(`${next.objects.length - kept.length} objects outside the new size were removed`);
        next = { ...resized, objects: kept };
        break;
      }
    }
  }
  return { layout: next, rejected };
}

/** A starter office: a desk per agent along the wall, a sofa, a coffee corner and some plants. */
export function defaultOfficeLayout(agents: ReadonlyArray<{ id: string; name: string }>, catalog: OfficeCatalogShape): OfficeLayout {
  const desks = Math.max(agents.length, 2);
  const cols = Math.min(OFFICE_MAX_COLS, Math.max(16, desks * 3 + 6));
  const rows = Math.min(OFFICE_MAX_ROWS, Math.max(12, 10 + Math.ceil(desks / 6) * 3));
  let layout: OfficeLayout = { version: 1, cols, rows, floor: Object.keys(catalog.floors)[0] ?? "wood", wall: Object.keys(catalog.walls)[0] ?? "plaster", objects: [] };
  const patch: OfficePatch = [];
  const has = (kind: string) => Boolean(catalog.objects[kind]);
  if (has("window")) for (let x = 2; x < cols - 2; x += 6) patch.push({ op: "add", kind: "window", x, y: 1, id: `window_${x}` });
  agents.forEach((agent, index) => {
    const column = index % Math.max(1, Math.floor((cols - 4) / 3));
    const row = Math.floor(index / Math.max(1, Math.floor((cols - 4) / 3)));
    const x = 2 + column * 3, y = 4 + row * 3;
    if (has("desk")) patch.push({ op: "add", kind: "desk", x, y, id: `desk_${index}`, agentId: agent.id, label: agent.name.slice(0, 40) });
  });
  if (has("sofa")) patch.push({ op: "add", kind: "sofa", x: cols - 4, y: rows - 2, id: "sofa_1" });
  if (has("coffee")) patch.push({ op: "add", kind: "coffee", x: 1, y: rows - 2, id: "coffee_1" });
  if (has("plant")) { patch.push({ op: "add", kind: "plant", x: 0, y: 1, id: "plant_1" }); patch.push({ op: "add", kind: "plant", x: cols - 1, y: 1, id: "plant_2" }); }
  if (has("whiteboard")) patch.push({ op: "add", kind: "whiteboard", x: Math.floor(cols / 2), y: 1, id: "whiteboard_1" });
  layout = applyOfficePatch(layout, patch, catalog).layout;
  return layout;
}
