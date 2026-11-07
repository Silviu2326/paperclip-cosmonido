import { describe, expect, it } from "vitest";
import type { OfficeLayout } from "@paperclipai/shared";
import { DEV_CATALOG } from "./dev-catalog";
import { agentRenderPosition, buildWalkGrid, createSimulation, findPath, step, syncSimulationAgents, type SimState } from "./simulation";

const AGENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function layout(objects: OfficeLayout["objects"] = [], cols = 12, rows = 10): OfficeLayout {
  return { version: 1, cols, rows, floor: "wood", wall: "plaster", objects };
}

function run(state: SimState, totalMs: number, stepMs = 50, onStep?: () => void) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    step(state, stepMs);
    onStep?.();
  }
}

describe("findPath", () => {
  it("routes around obstacles on a 4-neighbour grid", () => {
    const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    // Wall in column 2 from row 0 to row 3: the only gap is row 4.
    for (let y = 0; y <= 3; y++) grid[y][2] = false;
    const path = findPath(grid, [0, 0], [4, 0]);
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual([4, 0]);
    for (const [x, y] of path!) expect(grid[y][x]).toBe(true);
    // Each step moves exactly one tile in one axis.
    let previous: readonly [number, number] = [0, 0];
    for (const tile of path!) {
      expect(Math.abs(tile[0] - previous[0]) + Math.abs(tile[1] - previous[1])).toBe(1);
      previous = tile;
    }
  });

  it("returns null when the goal is sealed off and an empty path when already there", () => {
    const grid = [[true, false, true], [true, false, true], [true, false, true]];
    expect(findPath(grid, [0, 0], [2, 0])).toBeNull();
    expect(findPath(grid, [0, 0], [0, 0])).toEqual([]);
  });

  it("treats the goal as passable even when it is blocked (seats inside furniture)", () => {
    const grid = [[true, false]];
    expect(findPath(grid, [0, 0], [1, 0])).toEqual([[1, 0]]);
  });
});

describe("buildWalkGrid", () => {
  it("blocks every tile of a 3-tile desk (real catalog footprint) and keeps its seat reachable", () => {
    const catalog = { ...DEV_CATALOG, objects: { ...DEV_CATALOG.objects, desk: { ...DEV_CATALOG.objects.desk, footprint: { w: 3, h: 1 }, seat: { dx: 1, dy: 1, facing: "up" as const } } } };
    const grid = buildWalkGrid(layout([{ id: "d", kind: "desk", x: 4, y: 4 }]), catalog);
    expect([grid[4][4], grid[4][5], grid[4][6]]).toEqual([false, false, false]);
    expect(grid[4][7]).toBe(true);
    // The seat sits below the desk; the goal is passable even when the seat tile itself is blocked.
    expect(findPath(grid, [0, 9], [5, 5])?.at(-1)).toEqual([5, 5]);
  });

  it("blocks non-walkable footprints and the wall row", () => {
    const grid = buildWalkGrid(layout([{ id: "d", kind: "desk", x: 2, y: 4 }]), DEV_CATALOG);
    expect(grid[0].every(ok => !ok)).toBe(true);
    expect(grid[4][2]).toBe(false);
    expect(grid[4][3]).toBe(false);
    expect(grid[5][2]).toBe(true);
    // Chairs are walkable and do not block.
    const chairs = buildWalkGrid(layout([{ id: "c", kind: "chair", x: 2, y: 4 }]), DEV_CATALOG);
    expect(chairs[4][2]).toBe(true);
  });
});

describe("simulation", () => {
  it("a working agent walks to its desk and sits facing the monitor", () => {
    const state = createSimulation(
      layout([{ id: "desk", kind: "desk", x: 2, y: 4, agentId: AGENT }]),
      DEV_CATALOG,
      [{ id: AGENT, name: "Walter", status: "running" }],
      7,
    );
    run(state, 15_000);
    const agent = state.agents[0];
    expect(agent.behaviour).toBe("desk");
    expect([agent.tx, agent.ty]).toEqual([2, 5]);
    expect(agent.sitting).toBe(true);
    expect(agent.direction).toBe("up");
    expect(agent.path).toEqual([]);
  });

  it("an idle agent wanders and actually moves", () => {
    const state = createSimulation(
      layout([{ id: "plant", kind: "plant", x: 8, y: 6 }, { id: "coffee", kind: "coffee", x: 2, y: 8 }]),
      DEV_CATALOG,
      [{ id: AGENT, name: "Walter", status: "idle" }],
      3,
    );
    const visited = new Set<string>();
    run(state, 30_000, 50, () => visited.add(`${state.agents[0].tx},${state.agents[0].ty}`));
    expect(visited.size).toBeGreaterThan(3);
    expect(state.agents[0].present).toBe(true);
  });

  it("an absent agent (rest) is skipped and stays where it is", () => {
    const state = createSimulation(layout(), DEV_CATALOG, [{ id: AGENT, name: "Walter", status: "paused" }], 5);
    const start = agentRenderPosition(state.agents[0]);
    run(state, 5_000);
    expect(state.agents[0].present).toBe(false);
    expect(agentRenderPosition(state.agents[0])).toEqual(start);
  });

  it("a sleepy agent goes to the sofa", () => {
    const state = createSimulation(
      layout([{ id: "sofa", kind: "sofa", x: 8, y: 8 }]),
      DEV_CATALOG,
      [{ id: AGENT, name: "Walter", status: "sleepy", state: "sleepy" }],
      9,
    );
    run(state, 20_000);
    expect([state.agents[0].tx, state.agents[0].ty]).toEqual([8, 8]);
    expect(state.agents[0].sitting).toBe(true);
    expect(state.agents[0].marker).toBe("z");
  });

  it("a confused agent stands with a question mark marker", () => {
    const state = createSimulation(layout(), DEV_CATALOG, [{ id: AGENT, name: "Walter", status: "error" }], 2);
    run(state, 1_000);
    expect(state.agents[0].marker).toBe("?");
    expect(state.agents[0].sitting).toBe(false);
  });

  it("a success agent hops and then sits at its desk", () => {
    const state = createSimulation(
      layout([{ id: "desk", kind: "desk", x: 2, y: 4, agentId: AGENT }]),
      DEV_CATALOG,
      [{ id: AGENT, name: "Walter", status: "idle", state: "success" }],
      4,
    );
    let maxHop = 0;
    run(state, 15_000, 50, () => { maxHop = Math.max(maxHop, state.agents[0].hop); });
    expect(maxHop).toBeGreaterThan(0);
    expect(state.agents[0].hopped).toBe(true);
    expect([state.agents[0].tx, state.agents[0].ty]).toEqual([2, 5]);
  });

  it("uses a free desk when the agent has none assigned, and never shares one", () => {
    const state = createSimulation(
      layout([{ id: "d1", kind: "desk", x: 2, y: 4 }, { id: "d2", kind: "desk", x: 6, y: 4 }]),
      DEV_CATALOG,
      [{ id: AGENT, name: "Walter", status: "running" }, { id: OTHER, name: "Ana", status: "running" }],
      11,
    );
    run(state, 20_000);
    const [a, b] = state.agents;
    expect(a.deskId).not.toBeNull();
    expect(b.deskId).not.toBeNull();
    expect(a.deskId).not.toBe(b.deskId);
    expect(a.sitting && b.sitting).toBe(true);
  });

  it("keeps every position finite while stepping, including huge time gaps", () => {
    const state = createSimulation(
      layout([{ id: "desk", kind: "desk", x: 2, y: 4, agentId: AGENT }, { id: "plant", kind: "plant", x: 9, y: 2 }]),
      DEV_CATALOG,
      [{ id: AGENT, name: "Walter", status: "running" }, { id: OTHER, name: "Ana", status: "idle" }],
      13,
    );
    for (let i = 0; i < 400; i++) {
      step(state, i % 50 === 0 ? 60_000 : 33);
      for (const agent of state.agents) {
        const position = agentRenderPosition(agent);
        expect(Number.isFinite(position.x)).toBe(true);
        expect(Number.isFinite(position.y)).toBe(true);
        expect(Number.isFinite(agent.progress)).toBe(true);
      }
    }
  });

  it("syncing agents keeps the ones that stay and adds or drops the rest", () => {
    const state = createSimulation(layout(), DEV_CATALOG, [{ id: AGENT, name: "Walter", status: "idle" }], 1);
    const before = state.agents[0];
    syncSimulationAgents(state, [{ id: AGENT, name: "Walter", status: "idle" }, { id: OTHER, name: "Ana", status: "running" }]);
    expect(state.agents[0]).toBe(before);
    expect(state.agents.map(agent => agent.id)).toEqual([AGENT, OTHER]);
    syncSimulationAgents(state, [{ id: OTHER, name: "Ana", status: "running" }]);
    expect(state.agents.map(agent => agent.id)).toEqual([OTHER]);
  });
});
