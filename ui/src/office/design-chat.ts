import { applyOfficePatch, officeObjectId, OFFICE_MAX_COLS, OFFICE_MAX_ROWS, OFFICE_MIN_COLS, OFFICE_MIN_ROWS, type OfficeLayout, type OfficeObject, type OfficePatch, type OfficePatchOp } from "@paperclipai/shared";
import { officeObjectLabel, type OfficeCatalog } from "./catalog";

/**
 * Local interpreter for the office design chat (contract 6). No AI: it reads Spanish or English
 * commands and turns them into an OfficePatch. Every op is validated against the layout while it is
 * built, so the returned patch always applies cleanly with applyOfficePatch.
 */

export type DesignLanguage = "es" | "en";
export interface DesignAgent { id: string; name: string }
export interface DesignInput {
  message: string;
  layout: OfficeLayout;
  catalog: OfficeCatalog;
  agents: readonly DesignAgent[];
  /** Used when the message itself does not reveal the language. */
  language?: DesignLanguage;
}
export interface DesignResult {
  patch: OfficePatch;
  reply: string;
  language: DesignLanguage;
  /** False when no command was recognised (the reply then lists examples). */
  understood: boolean;
}

type Tile = [number, number];
interface Place { start: Tile; minRing: number }

/** Lower-case, no accents, single spaces: all matching runs on this form. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[¿?¡!.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KIND_WORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["desk", ["mesa", "mesas", "escritorio", "desk", "table", "puesto"]],
  ["chair", ["silla", "sillas", "chair", "asiento"]],
  ["plant", ["planta", "plantas", "plant", "maceta", "arbol"]],
  ["sofa", ["sofa", "sillon", "couch"]],
  ["coffee", ["cafetera", "cafe", "coffee"]],
  ["window", ["ventana", "ventanas", "window"]],
  ["bookshelf", ["estanteria", "biblioteca", "libreria", "bookshelf", "bookcase"]],
  ["whiteboard", ["pizarra", "pizarron", "whiteboard", "board"]],
];

const ADD_RE = /\b(pon|pone|poner|anade|anadir|agrega|agregar|coloca|colocar|mete|meter|add|put|place|insert)\b/;
const REMOVE_RE = /\b(quita|quitar|elimina|eliminar|borra|borrar|saca|sacar|remove|delete|erase|take out)\b/;
const MOVE_RE = /\b(mueve|mover|traslada|trasladar|cambia de sitio|move|relocate)\b/;
const ASSIGN_RE = /\b(asigna|asignar|asignale|assign|give)\b/;
const BIGGER_RE = /\b(agranda|agrandar|amplia|ampliar|bigger|larger|expand|grow|mas grande|mas amplia)\b/;
const SMALLER_RE = /\b(encoge|encoger|reduce|reducir|shrink|smaller|mas pequena|mas pequeno)\b/;
const FLOOR_RE = /\b(suelo|piso|floor)\b/;
const WALL_RE = /\b(pared|muro|wall)\b/;
const PLACE_MARK_RE = /\b(junto a la|junto al|junto a|junto|al lado de la|al lado del|al lado de|al lado|cerca de la|cerca del|cerca de|cerca|next to|beside|near)\b/;
const COORD_RE = /\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)|\b(\d{1,2})\s*,\s*(\d{1,2})\b/;
const DIMS_RE = /\b(\d{1,2})\s*(?:x|por|by)\s*(\d{1,2})\b/;
const ES_HINT = /\b(pon|pone|poner|anade|anadir|agrega|coloca|quita|elimina|mueve|junto|cerca|mesa|sofa|silla|planta|ventana|pizarra|cafe|cafetera|estanteria|cambia|suelo|pared|agranda|encoge|mas|pequena|para|asigna|asignar|la|el|una|un|al|quitar|mover|arriba|abajo|izquierda|derecha|centro|oficina)\b/g;
const EN_HINT = /\b(put|add|place|remove|delete|move|next|near|beside|desk|chair|plant|couch|window|board|coffee|bookshelf|change|floor|wall|bigger|smaller|for|assign|the|top|bottom|left|right|center|office)\b/g;

const THEME_SYNONYMS: Record<string, readonly string[]> = {
  wood: ["madera", "parquet", "tarima", "wood"],
  carpet: ["alfombra", "moqueta", "carpet", "rug"],
  blue: ["azul", "blue"],
  plaster: ["yeso", "plaster", "lisa", "blanca", "blanco"],
};
const THEME_LABELS: Record<string, Record<DesignLanguage, string>> = {
  wood: { es: "madera", en: "wood" },
  carpet_blue: { es: "alfombra azul", en: "blue carpet" },
  carpet: { es: "alfombra", en: "carpet" },
  plaster: { es: "yeso", en: "plaster" },
};

const wordRe = (word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
const has = (text: string, pattern: RegExp) => pattern.test(text);

function detectLanguage(text: string, fallback: DesignLanguage): DesignLanguage {
  const es = text.match(ES_HINT)?.length ?? 0;
  const en = text.match(EN_HINT)?.length ?? 0;
  if (es === en) return fallback;
  return es > en ? "es" : "en";
}

/** Object kind named in the text: the one whose word appears first. Only kinds present in the catalog count. */
function kindIn(text: string, catalog: OfficeCatalog): string | null {
  let best: { kind: string; index: number } | null = null;
  for (const [kind, words] of KIND_WORDS) {
    if (!catalog.objects[kind]) continue;
    for (const word of words) {
      const match = wordRe(word).exec(text);
      if (match && (!best || match.index < best.index)) best = { kind, index: match.index };
    }
  }
  return best?.kind ?? null;
}

function findAgent(text: string, agents: readonly DesignAgent[]): DesignAgent | null {
  let best: DesignAgent | null = null;
  let bestLength = 0;
  for (const agent of agents) {
    const full = normalizeText(agent.name);
    const first = full.split(" ")[0] ?? "";
    for (const candidate of [full, first]) {
      if (candidate.length < 3 || candidate.length <= bestLength) continue;
      if (wordRe(candidate).test(text)) { best = agent; bestLength = candidate.length; }
    }
  }
  return best;
}

/** Theme key whose words (or known synonyms) appear in the text; the best-scoring key wins. */
function themeKey(text: string, keys: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const key of keys) {
    const score = key.split(/[_-]/).reduce((sum, word) => {
      const synonyms = THEME_SYNONYMS[word] ?? [word];
      return sum + (synonyms.some(synonym => wordRe(synonym).test(text)) ? 1 : 0);
    }, 0);
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best;
}

function pickObject(layout: OfficeLayout, catalog: OfficeCatalog, kind: string, agentId: string | null, near: Tile | null): OfficeObject | null {
  const candidates = layout.objects.filter(object => object.kind === kind);
  if (agentId) return candidates.find(object => object.agentId === agentId) ?? null;
  if (!candidates.length) return null;
  if (near) candidates.sort((a, b) => Math.abs(a.x - near[0]) + Math.abs(a.y - near[1]) - (Math.abs(b.x - near[0]) + Math.abs(b.y - near[1])));
  return catalog.objects[kind] ? candidates[0] : null;
}

/** Nearest free tile to `start` for the op built by `makeOp`, searching rings outwards. Null when the office is full. */
function findSpot(layout: OfficeLayout, catalog: OfficeCatalog, start: Tile, minRing: number, makeOp: (x: number, y: number) => OfficePatchOp): Tile | null {
  const limit = Math.max(layout.cols, layout.rows) + 1;
  for (let ring = minRing; ring <= limit; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = start[0] + dx;
        const y = start[1] + dy;
        if (x < 0 || y < 1 || x >= layout.cols || y >= layout.rows) continue;
        if (applyOfficePatch(layout, [makeOp(x, y)], catalog).rejected.length === 0) return [x, y];
      }
    }
  }
  return null;
}

/** Where the user wants something: coordinates, a corner, a side, the centre, or next to an object (or an agent's desk). */
function placeFor(text: string, tail: string, input: DesignInput): Place | null {
  const { layout, catalog, agents } = input;
  const coord = COORD_RE.exec(text);
  if (coord) return { start: [Number(coord[1] ?? coord[3]), Number(coord[2] ?? coord[4])], minRing: 0 };
  const top = has(text, /\b(arriba|superior|top|upper)\b/);
  const bottom = has(text, /\b(abajo|inferior|bottom|lower)\b/);
  const left = has(text, /\b(izquierda|left)\b/);
  const right = has(text, /\b(derecha|right)\b/);
  const midRow = Math.floor(layout.rows / 2);
  if ((top || bottom) && (left || right)) return { start: [left ? 1 : layout.cols - 2, top ? 1 : layout.rows - 2], minRing: 0 };
  if (left || right) return { start: [left ? 1 : layout.cols - 2, midRow], minRing: 0 };
  if (has(text, /\b(centro|center|middle)\b/)) return { start: [Math.floor(layout.cols / 2), midRow], minRing: 0 };
  if (tail) {
    const agent = findAgent(tail, agents);
    const target = agent
      ? layout.objects.find(object => object.agentId === agent.id)
      : undefined;
    const kind = kindIn(tail, catalog);
    const anchor = target ?? (kind ? pickObject(layout, catalog, kind, null, null) : null);
    if (anchor) return { start: [anchor.x, anchor.y], minRing: 1 };
  }
  return null;
}

/** Interprets one message against the current layout. Pure: the layout passed in is never mutated. */
export function interpretOfficeMessage(input: DesignInput): DesignResult {
  const { layout: initial, catalog, agents } = input;
  const text = normalizeText(input.message);
  const language = detectLanguage(text, input.language ?? "es");
  const pick = (es: string, en: string) => (language === "es" ? es : en);
  const done = (ops: OfficePatchOp[], reply: string): DesignResult => ({ patch: ops, reply, language, understood: true });
  const notUnderstood = (): DesignResult => ({
    patch: [],
    language,
    understood: false,
    reply: pick(
      'No entendí. Prueba con: "pon una planta arriba a la izquierda", "quita el sofá", "mueve la mesa de Walter a la derecha", "mesa para Walter", "cambia el suelo a madera", "agranda la oficina" o "pon una silla junto a la ventana".',
      'I did not understand. Try: "put a plant top left", "remove the sofa", "move Walter\'s desk to the right", "desk for Walter", "change the floor to wood", "make the office bigger" or "put a chair next to the window".',
    ),
  });
  const fail = (es: string, en: string): DesignResult => ({ patch: [], language, understood: true, reply: pick(es, en) });

  const dims = DIMS_RE.exec(text);
  const kindAnywhere = kindIn(text, catalog);
  const marker = PLACE_MARK_RE.exec(text);
  const head = marker ? text.slice(0, marker.index).trim() : text;
  const tail = marker ? text.slice(marker.index + marker[0].length).trim() : "";
  const kindHead = kindIn(head, catalog) ?? kindAnywhere;

  // Size: an explicit WxH, or "bigger"/"smaller" when no object is named.
  if (dims || (!kindAnywhere && (has(text, BIGGER_RE) || has(text, SMALLER_RE)))) {
    const current = { cols: initial.cols, rows: initial.rows };
    const wanted = dims
      ? { cols: Number(dims[1]), rows: Number(dims[2]) }
      : has(text, BIGGER_RE)
        ? { cols: current.cols + 4, rows: current.rows + 2 }
        : { cols: current.cols - 4, rows: current.rows - 2 };
    const cols = Math.min(OFFICE_MAX_COLS, Math.max(OFFICE_MIN_COLS, wanted.cols));
    const rows = Math.min(OFFICE_MAX_ROWS, Math.max(OFFICE_MIN_ROWS, wanted.rows));
    const op: OfficePatchOp = { op: "resize", cols, rows };
    const result = applyOfficePatch(initial, [op], catalog);
    const removed = result.rejected.length;
    return done([op], pick(
      `Oficina de ${cols} × ${rows}.${removed ? ` Quité ${removed} objeto(s) que quedaban fuera.` : ""}`,
      `Office is now ${cols} × ${rows}.${removed ? ` Removed ${removed} object(s) that were outside.` : ""}`,
    ));
  }

  // Theme: floor or wall. The style must be one the catalog knows.
  if (FLOOR_RE.test(text) || WALL_RE.test(text)) {
    const wantsWall = WALL_RE.test(text) && !FLOOR_RE.test(text);
    const floor = themeKey(text, Object.keys(catalog.floors));
    const wall = themeKey(text, Object.keys(catalog.walls));
    if (wantsWall) {
      if (!wall) return fail(`No conozco ese estilo de pared. Disponibles: ${Object.keys(catalog.walls).join(", ")}.`, `I do not know that wall style. Available: ${Object.keys(catalog.walls).join(", ")}.`);
      return done([{ op: "theme", wall }], pick(`Pared cambiada a ${THEME_LABELS[wall]?.es ?? wall}.`, `Wall changed to ${THEME_LABELS[wall]?.en ?? wall}.`));
    }
    if (!floor) return fail(`No conozco ese suelo. Puedes elegir: ${Object.keys(catalog.floors).map(key => THEME_LABELS[key]?.es ?? key).join(", ")}.`, `I do not know that floor. You can choose: ${Object.keys(catalog.floors).map(key => THEME_LABELS[key]?.en ?? key).join(", ")}.`);
    return done([{ op: "theme", floor }], pick(`Suelo cambiado a ${THEME_LABELS[floor]?.es ?? floor}.`, `Floor changed to ${THEME_LABELS[floor]?.en ?? floor}.`));
  }

  const agentInHead = findAgent(head, agents);
  const agentAnywhere = findAgent(text, agents);
  const place = placeFor(text, tail, input);
  const label = (kind: string) => officeObjectLabel(catalog, kind, language);
  const isRemove = has(text, REMOVE_RE);
  const isMove = has(text, MOVE_RE);
  const isAssign = has(text, ASSIGN_RE);
  const isAdd = has(text, ADD_RE);

  if (isRemove) {
    const kind = kindHead ?? (agentAnywhere ? "desk" : null);
    if (!kind) return notUnderstood();
    const object = pickObject(initial, catalog, kind, kind === "desk" ? agentAnywhere?.id ?? null : null, place?.start ?? null);
    if (!object) return fail(
      kind === "desk" && agentAnywhere ? `${agentAnywhere.name} no tiene mesa.` : `No hay ${label(kind)} que quitar.`,
      kind === "desk" && agentAnywhere ? `${agentAnywhere.name} has no desk.` : `There is no ${label(kind)} to remove.`,
    );
    return done([{ op: "remove", id: object.id }], pick(`He quitado ${label(kind)} (${object.x}, ${object.y}).`, `Removed the ${label(kind)} at (${object.x}, ${object.y}).`));
  }

  if (isMove) {
    const kind = kindHead ?? (agentAnywhere ? "desk" : null);
    if (!kind) return notUnderstood();
    const object = pickObject(initial, catalog, kind, kind === "desk" ? agentAnywhere?.id ?? null : null, place?.start ?? null);
    if (!object) return fail(`No encuentro ${label(kind)} que mover.`, `I cannot find a ${label(kind)} to move.`);
    if (!place) return fail(`¿A dónde la muevo? Por ejemplo: arriba a la izquierda, junto a la ventana o (4, 3).`, `Where should I move it? For example: top left, next to the window or (4, 3).`);
    const spot = findSpot(initial, catalog, place.start, place.minRing, (x, y) => ({ op: "move", id: object.id, x, y }));
    if (!spot) return fail(`No hay sitio libre para ${label(kind)}.`, `There is no free space for the ${label(kind)}.`);
    return done([{ op: "move", id: object.id, x: spot[0], y: spot[1] }], pick(`He movido ${label(kind)} a (${spot[0]}, ${spot[1]}).`, `Moved the ${label(kind)} to (${spot[0]}, ${spot[1]}).`));
  }

  if (kindHead === "desk" && agentInHead) {
    const agent = agentInHead;
    const coord = COORD_RE.exec(text);
    const atCoord = coord ? initial.objects.find(object => object.kind === "desk" && object.x === Number(coord[1] ?? coord[3]) && object.y === Number(coord[2] ?? coord[4])) : undefined;
    if (atCoord && !isAdd) {
      return done([{ op: "assign", id: atCoord.id, agentId: agent.id }], pick(`${agent.name} tiene ahora la mesa en (${atCoord.x}, ${atCoord.y}).`, `${agent.name} now has the desk at (${atCoord.x}, ${atCoord.y}).`));
    }
    const existing = initial.objects.find(object => object.kind === "desk" && object.agentId === agent.id);
    if (existing && !isAdd && !place && !isAssign) {
      return fail(`${agent.name} ya tiene mesa en (${existing.x}, ${existing.y}).`, `${agent.name} already has a desk at (${existing.x}, ${existing.y}).`);
    }
    const freeDesk = !isAdd && !place ? initial.objects.find(object => object.kind === "desk" && !object.agentId) : undefined;
    if (freeDesk) {
      return done([{ op: "assign", id: freeDesk.id, agentId: agent.id }], pick(`${agent.name} tiene ahora la mesa en (${freeDesk.x}, ${freeDesk.y}).`, `${agent.name} now has the desk at (${freeDesk.x}, ${freeDesk.y}).`));
    }
    // No free desk (or an explicit place): add one, then assign it so any previous desk is released.
    const id = officeObjectId();
    const start = place?.start ?? [Math.floor(initial.cols / 2), Math.floor(initial.rows / 2)];
    const spot = findSpot(initial, catalog, start, place?.minRing ?? 0, (x, y) => ({ op: "add", kind: "desk", x, y, id }));
    if (!spot) return fail(`No hay sitio libre para una mesa.`, `There is no free space for a desk.`);
    const assign: OfficePatchOp = { op: "assign", id, agentId: agent.id };
    const add: OfficePatchOp = { op: "add", kind: "desk", x: spot[0], y: spot[1], id };
    const withAssign = applyOfficePatch(initial, [add, assign], catalog);
    if (withAssign.rejected.length) return fail(`No hay sitio libre para una mesa.`, `There is no free space for a desk.`);
    return done([add, assign], pick(`He puesto una mesa para ${agent.name} en (${spot[0]}, ${spot[1]}).`, `I placed a desk for ${agent.name} at (${spot[0]}, ${spot[1]}).`));
  }

  if (isAdd || (kindHead && !isAssign)) {
    const kind = kindHead;
    if (!kind) return notUnderstood();
    const id = officeObjectId();
    const start = place?.start ?? [Math.floor(initial.cols / 2), Math.floor(initial.rows / 2)];
    const spot = findSpot(initial, catalog, start, place?.minRing ?? 0, (x, y) => ({ op: "add", kind, x, y, id }));
    if (!spot) return fail(`No hay sitio libre para ${label(kind)}.`, `There is no free space for the ${label(kind)}.`);
    return done([{ op: "add", kind, x: spot[0], y: spot[1], id }], pick(`He puesto ${label(kind)} en (${spot[0]}, ${spot[1]}).`, `I placed a ${label(kind)} at (${spot[0]}, ${spot[1]}).`));
  }

  return notUnderstood();
}
