import { describe, expect, it } from "vitest";
import {
  applyOfficePatch, defaultOfficeLayout, officeLayoutSchema, officePatchSchema,
  type OfficeCatalogShape, type OfficeLayout,
} from "./office-layout.js";

const catalog: OfficeCatalogShape = {
  floors: { wood: {}, carpet: {} },
  walls: { plaster: {}, brick: {} },
  objects: {
    desk: { footprint: { w: 2, h: 1 }, walkable: false, seat: { dx: 0, dy: 1, facing: "up" } },
    chair: { footprint: { w: 1, h: 1 }, walkable: true },
    plant: { footprint: { w: 1, h: 1 }, walkable: false },
    sofa: { footprint: { w: 3, h: 1 }, walkable: false, seat: { dx: 1, dy: 0, facing: "down" } },
    coffee: { footprint: { w: 1, h: 1 }, walkable: false },
    window: { footprint: { w: 2, h: 1 }, walkable: true },
    whiteboard: { footprint: { w: 2, h: 1 }, walkable: true },
  },
};
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const empty: OfficeLayout = { version: 1, cols: 12, rows: 8, floor: "wood", wall: "plaster", objects: [] };

describe("applyOfficePatch", () => {
  it("adds objects with a generated or given id and keeps the input immutable", () => {
    const { layout, rejected } = applyOfficePatch(empty, [
      { op: "add", kind: "plant", x: 3, y: 2 },
      { op: "add", kind: "desk", x: 5, y: 4, id: "desk_a", agentId: A, label: "Ada" },
    ], catalog);
    expect(rejected).toEqual([]);
    expect(layout.objects).toHaveLength(2);
    expect(layout.objects[0]!.id).toMatch(/^o_[0-9a-f]{12}$/);
    expect(layout.objects[1]).toEqual({ id: "desk_a", kind: "desk", x: 5, y: 4, agentId: A, label: "Ada" });
    expect(empty.objects).toHaveLength(0);
    expect(officeLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("rejects unknown kinds, duplicate ids, collisions and out-of-bounds placement", () => {
    const base = applyOfficePatch(empty, [{ op: "add", kind: "desk", x: 4, y: 4, id: "d1" }], catalog).layout;
    const { layout, rejected } = applyOfficePatch(base, [
      { op: "add", kind: "sofa2", x: 1, y: 1 },
      { op: "add", kind: "plant", x: 1, y: 1, id: "d1" },
      { op: "add", kind: "plant", x: 5, y: 4 },
      { op: "add", kind: "plant", x: 0, y: 0 },
      { op: "add", kind: "plant", x: 12, y: 2 },
      { op: "add", kind: "plant", x: 2, y: 8 },
      { op: "add", kind: "desk", x: 11, y: 3 },
    ], catalog);
    expect(layout.objects).toHaveLength(1);
    expect(rejected).toEqual([
      "unknown object kind sofa2",
      "duplicate object id d1",
      "plant does not fit at 5,4",
      "plant does not fit at 0,0",
      "plant does not fit at 12,2",
      "plant does not fit at 2,8",
      "desk does not fit at 11,3",
    ]);
  });

  it("moves objects, ignoring their own tiles, and rejects blocked or unknown moves", () => {
    const base = applyOfficePatch(empty, [
      { op: "add", kind: "desk", x: 2, y: 3, id: "d1" },
      { op: "add", kind: "plant", x: 6, y: 3, id: "p1" },
    ], catalog).layout;
    const { layout, rejected } = applyOfficePatch(base, [
      { op: "move", id: "d1", x: 3, y: 3 },
      { op: "move", id: "d1", x: 5, y: 3 },
      { op: "move", id: "nope", x: 1, y: 1 },
    ], catalog);
    expect(layout.objects.find(o => o.id === "d1")).toMatchObject({ x: 3, y: 3 });
    expect(rejected).toEqual(["desk does not fit at 5,3", "unknown object nope"]);
  });

  it("removes objects and reports unknown ids", () => {
    const base = applyOfficePatch(empty, [{ op: "add", kind: "plant", x: 2, y: 2, id: "p1" }], catalog).layout;
    const { layout, rejected } = applyOfficePatch(base, [{ op: "remove", id: "p1" }, { op: "remove", id: "p1" }], catalog);
    expect(layout.objects).toEqual([]);
    expect(rejected).toEqual(["unknown object p1"]);
  });

  it("assigns seats, allows a single seat per agent and unassigns with null", () => {
    const base = applyOfficePatch(empty, [
      { op: "add", kind: "desk", x: 1, y: 3, id: "d1", agentId: A },
      { op: "add", kind: "desk", x: 5, y: 3, id: "d2" },
      { op: "add", kind: "plant", x: 9, y: 3, id: "p1" },
    ], catalog).layout;
    const moved = applyOfficePatch(base, [{ op: "assign", id: "d2", agentId: A }, { op: "assign", id: "p1", agentId: B }], catalog);
    expect(moved.rejected).toEqual(["plant has no seat"]);
    expect(moved.layout.objects.find(o => o.id === "d2")!.agentId).toBe(A);
    expect(moved.layout.objects.find(o => o.id === "d1")!.agentId).toBeUndefined();
    const cleared = applyOfficePatch(moved.layout, [{ op: "assign", id: "d2", agentId: null }, { op: "assign", id: "zzz", agentId: B }], catalog);
    expect(cleared.layout.objects.find(o => o.id === "d2")!.agentId).toBeUndefined();
    expect(cleared.rejected).toEqual(["unknown object zzz"]);
  });

  it("changes theme only to catalog ids and reports the rest", () => {
    const { layout, rejected } = applyOfficePatch(empty, [
      { op: "theme", floor: "carpet", wall: "brick" },
      { op: "theme", floor: "lava" },
      { op: "theme", wall: "glass" },
    ], catalog);
    expect([layout.floor, layout.wall]).toEqual(["carpet", "brick"]);
    expect(rejected).toEqual(["unknown floor lava", "unknown wall glass"]);
  });

  it("resizes and drops objects that no longer fit, reporting how many", () => {
    const base = applyOfficePatch(empty, [
      { op: "add", kind: "plant", x: 2, y: 2, id: "near" },
      { op: "add", kind: "plant", x: 11, y: 7, id: "far" },
    ], catalog).layout;
    const { layout, rejected } = applyOfficePatch(base, [{ op: "resize", cols: 10, rows: 7 }], catalog);
    expect([layout.cols, layout.rows]).toEqual([10, 7]);
    expect(layout.objects.map(o => o.id)).toEqual(["near"]);
    expect(rejected).toEqual(["1 objects outside the new size were removed"]);
    expect(applyOfficePatch(base, [{ op: "resize", cols: 20, rows: 12 }], catalog).rejected).toEqual([]);
  });

  it("applies ops in order so later ops can depend on earlier ones", () => {
    const { layout, rejected } = applyOfficePatch(empty, [
      { op: "add", kind: "plant", x: 3, y: 3, id: "p" },
      { op: "move", id: "p", x: 4, y: 4 },
      { op: "add", kind: "coffee", x: 3, y: 3, id: "c" },
    ], catalog);
    expect(rejected).toEqual([]);
    expect(layout.objects.map(o => [o.id, o.x, o.y])).toEqual([["p", 4, 4], ["c", 3, 3]]);
  });

  it("limits patches to 50 operations in the schema", () => {
    expect(officePatchSchema.safeParse(Array.from({ length: 51 }, (_, i) => ({ op: "remove", id: `o${i}` }))).success).toBe(false);
    expect(officePatchSchema.safeParse([{ op: "add", kind: "plant", x: -1, y: 0 }]).success).toBe(false);
  });
});

describe("defaultOfficeLayout", () => {
  const agents = Array.from({ length: 7 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, name: `Agent ${i}` }));

  it("places one desk per agent, assigned, within bounds and without overlaps", () => {
    const layout = defaultOfficeLayout(agents, catalog);
    expect(officeLayoutSchema.safeParse(layout).success).toBe(true);
    const desks = layout.objects.filter(o => o.kind === "desk");
    expect(desks.map(d => d.agentId).sort()).toEqual(agents.map(a => a.id).sort());
    const replay = applyOfficePatch({ ...layout, objects: [] }, layout.objects.map(o => ({ op: "add" as const, kind: o.kind, x: o.x, y: o.y, id: o.id })), catalog);
    expect(replay.rejected).toEqual([]);
    expect(layout.objects.some(o => o.kind === "sofa")).toBe(true);
    expect(layout.objects.some(o => o.kind === "coffee")).toBe(true);
  });

  it("is deterministic and still provides furniture for an empty company", () => {
    expect(defaultOfficeLayout(agents, catalog)).toEqual(defaultOfficeLayout(agents, catalog));
    const none = defaultOfficeLayout([], catalog);
    expect(none.objects.length).toBeGreaterThan(0);
    expect(none.cols).toBeGreaterThanOrEqual(16);
  });

  it("copes with a catalog lacking optional kinds and caps the size for large companies", () => {
    const minimal: OfficeCatalogShape = { floors: { wood: {} }, walls: { plaster: {} }, objects: { desk: catalog.objects.desk! } };
    const layout = defaultOfficeLayout(agents, minimal);
    expect(layout.objects.every(o => o.kind === "desk")).toBe(true);
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, name: `A${i}` }));
    const big = defaultOfficeLayout(many, catalog);
    expect(big.cols).toBeLessThanOrEqual(40);
    expect(big.rows).toBeLessThanOrEqual(30);
  });
});
