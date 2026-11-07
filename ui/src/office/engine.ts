import type { AgentAppearance, LpcDirection } from "@paperclipai/shared";
import { LPC_DIRECTIONS, type OfficeLayout } from "@paperclipai/shared";
import type { OfficeAtlases, OfficeCatalog } from "./catalog";
import { agentPortraitUrl, agentWorldUrl, WORLD_FRAME_SIZE, worldSheetCell } from "./sprites";
import { agentRenderPosition, createSimulation, setSimulationLayout, step, syncSimulationAgents, type SimAgent, type SimAgentInput, type SimState } from "./simulation";

/** Canvas 2D renderer for the pixel-art office (page contract 7, behaviour contract 5). */
const TILE = 32;
/** Feet line inside the 64 px frame; the sprite's top-left sits at (feet row - SPRITE_FEET_Y). */
const SPRITE_FEET_Y = 60;
/** Largest simulated step; a hidden tab resumes without teleporting agents. */
const MAX_FRAME_MS = 250;

export interface EngineAgent extends SimAgentInput {
  appearance: AgentAppearance | null;
}

interface ImageEntry { image: HTMLImageElement; ready: boolean }

export interface OfficeEngineOptions {
  canvas: HTMLCanvasElement;
  catalog: OfficeCatalog;
  atlases: OfficeAtlases;
  layout: OfficeLayout;
  agents: EngineAgent[];
  seed?: number;
}

export interface EngineView { zoom: 1 | 2; offsetX: number; offsetY: number; worldWidth: number; worldHeight: number }

/** The wall's top strip is drawn one tile above row 0, so the drawable world is one tile taller than the grid. */
const WALL_TOP_TILES = 1;

/** Integer zoom: 2x when the whole office (wall strip included) fits at 2x, otherwise 1x. */
export function zoomFor(cssWidth: number, cssHeight: number, cols: number, rows: number): 1 | 2 {
  return cols * TILE * 2 <= cssWidth && (rows + WALL_TOP_TILES) * TILE * 2 <= cssHeight ? 2 : 1;
}

/** Zoom plus the centred offset (css pixels) of the office inside the container. */
export function viewFor(cssWidth: number, cssHeight: number, cols: number, rows: number): EngineView {
  const zoom = zoomFor(cssWidth, cssHeight, cols, rows);
  const worldWidth = cols * TILE * zoom;
  const worldHeight = (rows + WALL_TOP_TILES) * TILE * zoom;
  return {
    zoom,
    offsetX: Math.floor((cssWidth - worldWidth) / 2),
    offsetY: Math.floor((cssHeight - worldHeight) / 2),
    worldWidth,
    worldHeight,
  };
}

export class OfficeEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private catalog: OfficeCatalog;
  private atlases: OfficeAtlases;
  private readonly sim: SimState;
  private appearances = new Map<string, AgentAppearance | null>();
  private images = new Map<string, ImageEntry>();
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private view: EngineView = { zoom: 1, offsetX: 0, offsetY: 0, worldWidth: 0, worldHeight: 0 };
  private frameId: number | null = null;
  private lastTime: number | null = null;
  private disposed = false;
  private readonly onVisibility = () => {
    if (document.hidden) this.stop(); else this.start();
  };

  constructor(options: OfficeEngineOptions) {
    this.canvas = options.canvas;
    this.ctx = options.canvas.getContext("2d");
    this.catalog = options.catalog;
    this.atlases = options.atlases;
    this.sim = createSimulation(options.layout, options.catalog, [], options.seed ?? 1);
    this.setAgents(options.agents);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
  }

  setLayout(layout: OfficeLayout, catalog: OfficeCatalog = this.catalog, atlases: OfficeAtlases = this.atlases) {
    this.catalog = catalog;
    this.atlases = atlases;
    setSimulationLayout(this.sim, layout, catalog);
    this.view = viewFor(this.cssWidth, this.cssHeight, this.sim.cols, this.sim.rows);
    this.draw();
  }

  setAgents(agents: EngineAgent[]) {
    this.appearances = new Map(agents.map(agent => [agent.id, agent.appearance]));
    syncSimulationAgents(this.sim, agents.map(({ id, name, status, state }) => ({ id, name, status, state })));
    // Both images are requested: the portrait is the fallback while the world sheet is missing or still loading.
    for (const agent of agents) {
      const world = agentWorldUrl(agent.appearance, agent.id);
      if (world) this.loadImage(world);
      this.loadImage(agentPortraitUrl(agent.appearance, agent.id));
    }
    this.draw();
  }

  /** Sizes the backing store for the container (css pixels) and device pixel ratio; the zoom is chosen to fit. */
  resize(cssWidth: number, cssHeight: number, dpr = 1) {
    this.cssWidth = Math.max(0, Math.floor(cssWidth));
    this.cssHeight = Math.max(0, Math.floor(cssHeight));
    this.dpr = dpr > 0 ? dpr : 1;
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * this.dpr));
    this.view = viewFor(this.cssWidth, this.cssHeight, this.sim.cols, this.sim.rows);
    this.draw();
  }

  /** Agent whose sprite is under the pointer (css pixels relative to the canvas), topmost first. */
  agentAt(cssX: number, cssY: number): SimAgent | null {
    const { zoom, offsetX, offsetY } = this.view;
    const worldX = (cssX - offsetX) / zoom;
    const worldY = (cssY - offsetY) / zoom - WALL_TOP_TILES * TILE;
    const agents = this.visibleAgents().reverse();
    for (const agent of agents) {
      const { left, top } = this.spriteBox(agent);
      if (worldX >= left + 12 && worldX <= left + WORLD_FRAME_SIZE - 12 && worldY >= top + 8 && worldY <= top + WORLD_FRAME_SIZE) return agent;
    }
    return null;
  }

  /** Starts the rAF loop unless the page is hidden, destroyed or already running. */
  start() {
    if (this.disposed || this.frameId !== null || typeof requestAnimationFrame !== "function") return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.lastTime = null;
    const tick = (now: number) => {
      this.frameId = null;
      if (this.disposed || (typeof document !== "undefined" && document.hidden)) return;
      const dt = this.lastTime === null ? 0 : Math.min(MAX_FRAME_MS, now - this.lastTime);
      this.lastTime = now;
      step(this.sim, dt);
      this.draw();
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frameId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.lastTime = null;
  }

  destroy() {
    this.disposed = true;
    this.stop();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
  }

  get state(): SimState { return this.sim; }

  /** Paints one frame: floor, wall row, objects by anchor y, then agents by y. Safe without a 2D context. */
  draw() {
    const ctx = this.ctx;
    if (!ctx || this.canvas.width === 0) return;
    const { zoom, offsetX, offsetY } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // World y = 0 is the top of row 0; the wall's top strip sits at y = -TILE, shifted down by WALL_TOP_TILES.
    ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom, this.dpr * offsetX, this.dpr * (offsetY + WALL_TOP_TILES * TILE * zoom));
    ctx.imageSmoothingEnabled = false;

    const { cols, rows, layout } = this.sim;
    const floor = this.catalog.floors[layout.floor];
    const wall = this.catalog.walls[layout.wall];
    for (let x = 0; x < cols; x++) {
      if (wall) {
        this.blit(ctx, wall.atlas, wall.top.x, wall.top.y, TILE, TILE, x * TILE, -TILE, TILE, TILE);
        this.blit(ctx, wall.atlas, wall.face.x, wall.face.y, TILE, TILE, x * TILE, 0, TILE, TILE);
      }
    }
    for (let y = 1; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (floor) {
        this.blit(ctx, floor.atlas, floor.x, floor.y, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }

    const objects = layout.objects
      .filter(object => this.catalog.objects[object.kind])
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const object of objects) {
      const art = this.catalog.objects[object.kind];
      this.blit(ctx, art.atlas, art.x, art.y, art.w, art.h, object.x * TILE, (object.y + 1) * TILE - art.h, art.w, art.h);
    }

    for (const agent of this.visibleAgents()) this.drawAgent(ctx, agent);
  }

  private visibleAgents(): SimAgent[] {
    return this.sim.agents
      .filter(agent => agent.present)
      .sort((a, b) => agentRenderPosition(a).y - agentRenderPosition(b).y);
  }

  private drawAgent(ctx: CanvasRenderingContext2D, agent: SimAgent) {
    const appearance = this.appearances.get(agent.id) ?? null;
    const worldUrl = agentWorldUrl(appearance, agent.id);
    const world = worldUrl ? this.images.get(worldUrl) : undefined;
    const { left, top } = this.spriteBox(agent);
    const direction: LpcDirection = (LPC_DIRECTIONS as readonly string[]).includes(agent.direction) ? agent.direction as LpcDirection : "down";
    if (world?.ready) {
      const { column, row } = worldSheetCell(direction, agent.frame, agent.sitting);
      ctx.drawImage(world.image, column * WORLD_FRAME_SIZE, row * WORLD_FRAME_SIZE, WORLD_FRAME_SIZE, WORLD_FRAME_SIZE, left, top, WORLD_FRAME_SIZE, WORLD_FRAME_SIZE);
    } else {
      // No world sheet (other appearances, or the sheet failed): the static portrait keeps the agent visible.
      const portrait = this.images.get(agentPortraitUrl(appearance, agent.id));
      if (portrait?.ready) ctx.drawImage(portrait.image, left, top, WORLD_FRAME_SIZE, WORLD_FRAME_SIZE);
    }
    if (agent.marker) {
      const bubbleX = left + WORLD_FRAME_SIZE - 14;
      const bubbleY = top - 4;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(bubbleX, bubbleY, 14, 16);
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 1;
      ctx.strokeRect(bubbleX + 0.5, bubbleY + 0.5, 13, 15);
      ctx.fillStyle = "#333333";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(agent.marker, bubbleX + 7, bubbleY + 2);
    }
  }

  /** Top-left of the 64 px sprite in world pixels: centred on the tile, feet on the tile's lower edge, a hop lifts it. */
  private spriteBox(agent: SimAgent): { left: number; top: number } {
    const position = agentRenderPosition(agent);
    return {
      left: Math.round(position.x * TILE + TILE / 2 - WORLD_FRAME_SIZE / 2),
      top: Math.round((position.y + 1) * TILE - SPRITE_FEET_Y),
    };
  }

  private blit(ctx: CanvasRenderingContext2D, atlasName: string, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
    const atlas = this.atlases[atlasName];
    if (!atlas) return;
    ctx.drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  private loadImage(url: string): ImageEntry | undefined {
    const cached = this.images.get(url);
    if (cached) return cached;
    if (typeof Image !== "function") return undefined;
    const image = new Image();
    const entry: ImageEntry = { image, ready: false };
    this.images.set(url, entry);
    image.onload = () => { entry.ready = true; this.draw(); };
    image.src = url;
    return entry;
  }
}
