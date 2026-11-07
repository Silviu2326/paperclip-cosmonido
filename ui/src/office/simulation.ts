import { characterStateForAgent, officeObjectTiles, type CharacterState, type OfficeLayout, type OfficeObject } from "@paperclipai/shared";
import type { OfficeCatalog, OfficeFacing } from "./catalog";

/** Contract 5: tile-based behaviour of the agents in the office. Pure: no DOM, no clock; time comes from `step`. */
export const WALK_SPEED_TILES_PER_SECOND = 2;
export const WALK_FRAME_RATE = 8;
export const WALK_FRAMES = 8;
const HOP_MS = 600;
const HOP_HEIGHT_TILES = 0.35;
const MAX_STEP_MS = 250;

export type Tile = readonly [number, number];
export interface SimAgentInput { id: string; name: string; status: string; /** Overrides the state derived from `status`. */ state?: CharacterState }
export type SimBehaviour = "desk" | "wander" | "board" | "sofa" | "stand";
export interface SimAgent {
  id: string; name: string; status: string;
  state: CharacterState;
  present: boolean;
  /** Tile the agent stands on; it is walking toward `path[0]` by `progress` (0..1). */
  tx: number; ty: number;
  path: Tile[];
  progress: number;
  direction: OfficeFacing;
  /** 0 idle/sit pose, 1..8 walk frames. */
  frame: number;
  sitting: boolean;
  marker: "?" | "z" | null;
  /** Vertical lift in tiles (success hop). */
  hop: number;
  behaviour: SimBehaviour;
  goal: Tile | null;
  goalFacing: OfficeFacing | null;
  goalSits: boolean;
  pauseMs: number;
  walkMs: number;
  hopMs: number;
  hopped: boolean;
  deskId: string | null;
}
export interface SimState {
  cols: number; rows: number;
  layout: OfficeLayout;
  catalog: OfficeCatalog;
  walkable: boolean[][];
  agents: SimAgent[];
  rng: number;
}

function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function random(state: SimState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  return mulberry32(state.rng);
}
function hashString(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

export function buildWalkGrid(layout: OfficeLayout, catalog: OfficeCatalog): boolean[][] {
  const grid = Array.from({ length: layout.rows }, (_, y) => Array.from({ length: layout.cols }, () => y > 0));
  for (const object of layout.objects) {
    if (catalog.objects[object.kind]?.walkable !== false) continue;
    for (const [x, y] of officeObjectTiles(object, catalog)) if (grid[y]?.[x] !== undefined) grid[y][x] = false;
  }
  return grid;
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [[0, -1], [-1, 0], [0, 1], [1, 0]];
/** 4-neighbour A*. Start and goal are always passable, so seats inside furniture can be reached. Returns the tiles after the start, or null. */
export function findPath(walkable: boolean[][], from: Tile, to: Tile): Tile[] | null {
  const rows = walkable.length, cols = walkable[0]?.length ?? 0;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  if (!inside(from[0], from[1]) || !inside(to[0], to[1])) return null;
  if (from[0] === to[0] && from[1] === to[1]) return [];
  const key = (x: number, y: number) => y * cols + x;
  const startKey = key(from[0], from[1]);
  const heuristic = (x: number, y: number) => Math.abs(x - to[0]) + Math.abs(y - to[1]);
  const cost = new Map<number, number>([[startKey, 0]]);
  const parent = new Map<number, number>();
  const open: Array<{ x: number; y: number; f: number }> = [{ x: from[0], y: from[1], f: heuristic(from[0], from[1]) }];
  const closed = new Set<number>();
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const current = open.splice(best, 1)[0];
    const currentKey = key(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    if (current.x === to[0] && current.y === to[1]) {
      const path: Tile[] = [];
      let at = currentKey;
      while (at !== startKey) { path.unshift([at % cols, Math.floor(at / cols)]); at = parent.get(at)!; }
      return path;
    }
    for (const [dx, dy] of DIRECTIONS) {
      const x = current.x + dx, y = current.y + dy;
      if (!inside(x, y)) continue;
      const isGoal = x === to[0] && y === to[1];
      if (!isGoal && !walkable[y][x]) continue;
      const next = key(x, y);
      const newCost = (cost.get(currentKey) ?? 0) + 1;
      if (newCost < (cost.get(next) ?? Infinity)) {
        cost.set(next, newCost); parent.set(next, currentKey);
        open.push({ x, y, f: newCost + heuristic(x, y) });
      }
    }
  }
  return null;
}

function seatTile(object: OfficeObject, catalog: OfficeCatalog): { tile: Tile; facing: OfficeFacing } | null {
  const seat = catalog.objects[object.kind]?.seat;
  return seat ? { tile: [object.x + seat.dx, object.y + seat.dy], facing: seat.facing } : null;
}
/** A walkable tile next to the object (where an agent stands to use it). */
function standTile(state: SimState, object: OfficeObject): Tile | null {
  const footprint = state.catalog.objects[object.kind]?.footprint ?? { w: 1, h: 1 };
  const candidates: Tile[] = [];
  for (let dx = 0; dx < footprint.w; dx++) candidates.push([object.x + dx, object.y + 1]);
  for (let dy = 0; dy < footprint.h; dy++) { candidates.push([object.x - 1, object.y - dy]); candidates.push([object.x + footprint.w, object.y - dy]); }
  return candidates.find(([x, y]) => state.walkable[y]?.[x]) ?? null;
}
function pointsOfInterest(state: SimState): Tile[] {
  const tiles: Tile[] = [];
  for (const object of state.layout.objects) {
    if (!["coffee", "window", "whiteboard", "plant", "bookshelf"].includes(object.kind)) continue;
    const tile = standTile(state, object);
    if (tile) tiles.push(tile);
  }
  return tiles;
}
function nearestWalkable(state: SimState, around: Tile): Tile | null {
  let best: Tile | null = null, bestDistance = Infinity;
  state.walkable.forEach((row, y) => row.forEach((ok, x) => {
    if (!ok) return;
    const distance = Math.abs(x - around[0]) + Math.abs(y - around[1]);
    if (distance < bestDistance) { best = [x, y]; bestDistance = distance; }
  }));
  return best;
}

function behaviourFor(state: CharacterState): { behaviour: SimBehaviour; present: boolean } {
  switch (state) {
    case "rest": return { behaviour: "stand", present: false };
    case "working": case "success": return { behaviour: "desk", present: true };
    case "thinking": case "loading": return { behaviour: "board", present: true };
    case "sleepy": return { behaviour: "sofa", present: true };
    case "confused": return { behaviour: "stand", present: true };
    default: return { behaviour: "wander", present: true };
  }
}

function resolveDesk(state: SimState, agent: SimAgent): OfficeObject | null {
  const seats = state.layout.objects.filter(object => state.catalog.objects[object.kind]?.seat);
  const own = seats.find(object => object.agentId === agent.id);
  if (own) return own;
  // Free = not assigned to any agent in the office and not picked by another agent.
  const taken = new Set<string>();
  for (const object of seats) if (object.agentId && state.agents.some(other => other.id === object.agentId)) taken.add(object.id);
  for (const other of state.agents) if (other.id !== agent.id && other.deskId) taken.add(other.deskId);
  const free = seats.filter(object => !taken.has(object.id));
  return free.find(object => object.kind === "desk") ?? free.find(object => object.kind !== "sofa") ?? null;
}

function spawnTile(state: SimState): Tile {
  return nearestWalkable(state, [Math.floor(state.cols / 2), state.rows - 1]) ?? [0, 1];
}

function applyInput(state: SimState, agent: SimAgent, input: SimAgentInput, first = false) {
  const next = input.state ?? characterStateForAgent(input.status);
  agent.name = input.name; agent.status = input.status;
  if (!first && next === agent.state) return;
  const wasPresent = agent.present;
  const { behaviour, present } = behaviourFor(next);
  agent.state = next; agent.behaviour = behaviour; agent.present = present;
  agent.goal = null; agent.goalFacing = null; agent.goalSits = false; agent.hopped = false; agent.pauseMs = 0; agent.deskId = null;
  agent.sitting = false;
  agent.marker = next === "confused" ? "?" : next === "sleepy" ? "z" : null;
  if (present && !wasPresent) {
    const [tx, ty] = spawnTile(state);
    agent.tx = tx; agent.ty = ty; agent.path = []; agent.progress = 0; agent.direction = "up";
  }
  if (!present) { agent.path = []; agent.progress = 0; }
}

function makeAgent(state: SimState, input: SimAgentInput): SimAgent {
  const [tx, ty] = spawnTile(state);
  const agent: SimAgent = {
    id: input.id, name: input.name, status: input.status, state: "idle", present: false,
    tx, ty, path: [], progress: 0, direction: "down", frame: 0, sitting: false, marker: null, hop: 0,
    behaviour: "wander", goal: null, goalFacing: null, goalSits: false, pauseMs: 0, walkMs: 0, hopMs: 0, hopped: false, deskId: null,
  };
  applyInput(state, agent, input, true);
  return agent;
}

export function createSimulation(layout: OfficeLayout, catalog: OfficeCatalog, agents: SimAgentInput[], seed = 1): SimState {
  const state: SimState = { cols: layout.cols, rows: layout.rows, layout, catalog, walkable: buildWalkGrid(layout, catalog), agents: [], rng: seed >>> 0 };
  state.agents = agents.map(input => makeAgent(state, input));
  return state;
}

/** Replaces the layout (editing); agents keep their tile if it is still walkable, otherwise they respawn. */
export function setSimulationLayout(state: SimState, layout: OfficeLayout, catalog: OfficeCatalog = state.catalog) {
  state.layout = layout; state.catalog = catalog; state.cols = layout.cols; state.rows = layout.rows;
  state.walkable = buildWalkGrid(layout, catalog);
  for (const agent of state.agents) {
    agent.goal = null; agent.path = []; agent.progress = 0; agent.sitting = false; agent.deskId = null; agent.pauseMs = 0;
    if (!state.walkable[agent.ty]?.[agent.tx]) { const [tx, ty] = spawnTile(state); agent.tx = tx; agent.ty = ty; }
  }
}

/** Adds, removes and updates agents from fresh data without teleporting the ones that stay. */
export function syncSimulationAgents(state: SimState, inputs: SimAgentInput[]) {
  const ids = new Set(inputs.map(input => input.id));
  state.agents = state.agents.filter(agent => ids.has(agent.id));
  for (const input of inputs) {
    const existing = state.agents.find(agent => agent.id === input.id);
    if (existing) applyInput(state, existing, input); else state.agents.push(makeAgent(state, input));
  }
}

function chooseGoal(state: SimState, agent: SimAgent) {
  agent.goal = null; agent.goalFacing = null; agent.goalSits = false;
  const middle: Tile = [Math.floor(state.cols / 2), Math.floor(state.rows / 2)];
  switch (agent.behaviour) {
    case "desk": {
      const desk = resolveDesk(state, agent);
      const seat = desk ? seatTile(desk, state.catalog) : null;
      if (desk && seat) { agent.deskId = desk.id; agent.goal = seat.tile; agent.goalFacing = seat.facing; agent.goalSits = true; }
      else agent.goal = nearestWalkable(state, middle);
      break;
    }
    case "board": {
      const board = state.layout.objects.find(object => object.kind === "whiteboard");
      agent.goal = (board && standTile(state, board)) ?? nearestWalkable(state, [middle[0], 1]);
      agent.goalFacing = "up";
      break;
    }
    case "sofa": {
      const sofas = state.layout.objects.filter(object => object.kind === "sofa" && state.catalog.objects[object.kind]?.seat);
      const sofa = sofas[hashString(agent.id) % Math.max(1, sofas.length)];
      const seat = sofa ? seatTile(sofa, state.catalog) : null;
      if (seat) { agent.goal = seat.tile; agent.goalFacing = seat.facing; agent.goalSits = true; }
      else agent.goal = nearestWalkable(state, [state.cols - 2, state.rows - 2]);
      break;
    }
    case "stand": {
      agent.goal = nearestWalkable(state, middle);
      agent.goalFacing = "down";
      break;
    }
    case "wander": {
      const spots = pointsOfInterest(state);
      let goal: Tile | null = null;
      if (spots.length && random(state) < 0.7) goal = spots[Math.floor(random(state) * spots.length)];
      else {
        for (let attempt = 0; attempt < 20 && !goal; attempt++) {
          const x = Math.floor(random(state) * state.cols), y = 1 + Math.floor(random(state) * (state.rows - 1));
          if (state.walkable[y]?.[x]) goal = [x, y];
        }
      }
      if (goal && goal[0] === agent.tx && goal[1] === agent.ty) goal = null;
      agent.goal = goal;
      break;
    }
  }
}

function faceToward(agent: SimAgent, dx: number, dy: number) {
  if (Math.abs(dx) > Math.abs(dy)) agent.direction = dx < 0 ? "left" : "right";
  else if (dy !== 0) agent.direction = dy < 0 ? "up" : "down";
}

function stepAgent(state: SimState, agent: SimAgent, dtMs: number) {
  if (agent.hopMs > 0) {
    agent.hopMs = Math.max(0, agent.hopMs - dtMs);
    agent.hop = Math.sin((1 - agent.hopMs / HOP_MS) * Math.PI) * HOP_HEIGHT_TILES;
    if (agent.hopMs === 0) { agent.hop = 0; agent.hopped = true; }
    return;
  }
  if (agent.path.length) {
    agent.sitting = false;
    faceToward(agent, agent.path[0][0] - agent.tx, agent.path[0][1] - agent.ty);
    agent.progress += (WALK_SPEED_TILES_PER_SECOND * dtMs) / 1000;
    agent.walkMs += dtMs;
    while (agent.progress >= 1 && agent.path.length) {
      const [x, y] = agent.path.shift()!;
      agent.progress -= 1; agent.tx = x; agent.ty = y;
      if (agent.path.length) faceToward(agent, agent.path[0][0] - x, agent.path[0][1] - y);
    }
    if (!agent.path.length) { agent.progress = 0; agent.walkMs = 0; }
    agent.frame = agent.path.length ? 1 + (Math.floor((agent.walkMs * WALK_FRAME_RATE) / 1000) % WALK_FRAMES) : 0;
    return;
  }
  agent.frame = 0;
  if (!agent.goal) {
    if (agent.pauseMs > 0) { agent.pauseMs -= dtMs; return; }
    chooseGoal(state, agent);
    if (!agent.goal) { agent.pauseMs = agent.behaviour === "wander" ? 800 : 1500; return; }
  }
  const goal = agent.goal;
  if (agent.tx === goal[0] && agent.ty === goal[1]) {
    if (agent.goalFacing) agent.direction = agent.goalFacing;
    agent.sitting = agent.goalSits;
    if (agent.state === "success" && !agent.hopped) { agent.hopMs = HOP_MS; return; }
    if (agent.behaviour === "wander") { agent.goal = null; agent.pauseMs = 1500 + random(state) * 3500; }
    return;
  }
  const path = findPath(state.walkable, [agent.tx, agent.ty], goal);
  if (!path) { agent.goal = null; agent.pauseMs = 1500; return; }
  agent.path = path;
}

/** Advances every present agent by `dtMs`. Large gaps (hidden tab) are clamped so agents do not jump. */
export function step(state: SimState, dtMs: number) {
  const dt = Math.min(Math.max(0, Number.isFinite(dtMs) ? dtMs : 0), MAX_STEP_MS);
  for (const agent of state.agents) if (agent.present) stepAgent(state, agent, dt);
}

/** Interpolated tile position (fractional) used for drawing. */
export function agentRenderPosition(agent: SimAgent): { x: number; y: number } {
  const next = agent.path[0];
  if (!next) return { x: agent.tx, y: agent.ty - agent.hop };
  return { x: agent.tx + (next[0] - agent.tx) * agent.progress, y: agent.ty + (next[1] - agent.ty) * agent.progress - agent.hop };
}
