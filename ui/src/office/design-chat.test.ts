import { describe, expect, it } from "vitest";
import { applyOfficePatch, officePatchSchema, type OfficeLayout } from "@paperclipai/shared";
import { DEV_CATALOG } from "./dev-catalog";
import { interpretOfficeMessage, normalizeText, type DesignAgent } from "./design-chat";

const WALTER = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";
const agents: DesignAgent[] = [{ id: WALTER, name: "Walter" }, { id: ANA, name: "Ana" }];

const base: OfficeLayout = {
  version: 1,
  cols: 16,
  rows: 12,
  floor: "wood",
  wall: "plaster",
  objects: [
    { id: "window_1", kind: "window", x: 4, y: 1 },
    { id: "sofa_1", kind: "sofa", x: 10, y: 10 },
    { id: "desk_ana", kind: "desk", x: 2, y: 5, agentId: ANA },
    { id: "desk_free", kind: "desk", x: 8, y: 5 },
    { id: "plant_1", kind: "plant", x: 14, y: 4 },
  ],
};

function ask(message: string, layout: OfficeLayout = base, language?: "es" | "en") {
  const result = interpretOfficeMessage({ message, layout, catalog: DEV_CATALOG, agents, language });
  // Every patch the interpreter returns must apply without rejections and pass the server schema.
  const applied = applyOfficePatch(layout, result.patch, DEV_CATALOG);
  // A resize may drop objects that fall outside the new size; the interpreter reports that in its reply.
  if (!result.patch.some(op => op.op === "resize")) expect(applied.rejected).toEqual([]);
  expect(officePatchSchema.safeParse(result.patch).success).toBe(true);
  return { ...result, applied: applied.layout };
}

describe("normalizeText", () => {
  it("drops accents, case and punctuation", () => {
    expect(normalizeText("¿Pon un Sofá, por favor?")).toBe("pon un sofa, por favor");
  });
});

describe("design chat: add", () => {
  it("adds a plant in a corner (es)", () => {
    const result = ask("pon una planta arriba a la izquierda");
    expect(result.understood).toBe(true);
    expect(result.language).toBe("es");
    expect(result.patch).toHaveLength(1);
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "plant", x: 1, y: 1 });
    expect(result.reply).toContain("(1, 1)");
  });

  it("adds a plant in a corner (en)", () => {
    const result = ask("put a plant bottom right");
    expect(result.language).toBe("en");
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "plant", x: 14, y: 10 });
    expect(result.reply).toMatch(/placed/i);
  });

  it("adds next to the window and skips occupied tiles (es)", () => {
    const result = ask("añade una silla junto a la ventana");
    const add = result.patch[0];
    expect(add).toMatchObject({ op: "add", kind: "chair" });
    // Not on the window itself, and within one tile of it.
    expect(add.op === "add" && (add.x !== 4 || add.y !== 1)).toBe(true);
    expect(add.op === "add" && Math.abs(add.x - 4) <= 1 && Math.abs(add.y - 1) <= 1).toBe(true);
  });

  it("adds next to a window (en)", () => {
    const result = ask("add a chair next to the window");
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "chair" });
  });

  it("adds at the centre (es) and spirals outwards when the centre is taken", () => {
    const taken: OfficeLayout = { ...base, objects: [...base.objects, { id: "plant_center", kind: "plant", x: 8, y: 6 }] };
    const result = ask("coloca un sofá en el centro", taken);
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "sofa" });
    const add = result.patch[0];
    expect(add.op === "add" && (add.x !== 8 || add.y !== 6)).toBe(true);
  });

  it("adds at the centre (en)", () => {
    const result = ask("put a coffee in the center", { ...base, objects: [] });
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "coffee", x: 8, y: 6 });
  });

  it("adds at explicit coordinates", () => {
    const result = ask("pon una estantería en (3, 8)");
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "bookshelf", x: 3, y: 8 });
  });

  it("refuses when there is no room for the object", () => {
    const full: OfficeLayout = { ...base, cols: 8, rows: 6, objects: [] };
    const filled: OfficeLayout = {
      ...full,
      objects: Array.from({ length: 8 * 5 }, (_, index) => ({ id: `p${index}`, kind: "plant", x: index % 8, y: 1 + Math.floor(index / 8) })),
    };
    const result = ask("pon una planta en el centro", filled);
    expect(result.patch).toEqual([]);
    expect(result.reply).toMatch(/sitio libre/);
  });
});

describe("design chat: remove", () => {
  it("removes the named object (es)", () => {
    const result = ask("quita el sofá", base);
    expect(result.patch).toEqual([{ op: "remove", id: "sofa_1" }]);
    expect(result.applied.objects.find(object => object.id === "sofa_1")).toBeUndefined();
  });

  it("removes the named object (en)", () => {
    const result = ask("remove the plant");
    expect(result.patch).toEqual([{ op: "remove", id: "plant_1" }]);
    expect(result.language).toBe("en");
  });

  it("removes an agent's desk when the agent is named", () => {
    const result = ask("elimina la mesa de Ana");
    expect(result.patch).toEqual([{ op: "remove", id: "desk_ana" }]);
  });

  it("says so when there is nothing to remove", () => {
    const result = ask("quita la pizarra", base);
    expect(result.patch).toEqual([]);
    expect(result.understood).toBe(true);
  });
});

describe("design chat: move", () => {
  it("moves an object to a side (es)", () => {
    const result = ask("mueve la planta a la derecha");
    expect(result.patch).toHaveLength(1);
    expect(result.patch[0]).toMatchObject({ op: "move", id: "plant_1" });
    const move = result.patch[0];
    expect(move.op === "move" && move.x).toBe(14);
  });

  it("moves an object next to another (en)", () => {
    const result = ask("move the plant next to the window");
    expect(result.patch[0]).toMatchObject({ op: "move", id: "plant_1" });
  });

  it("moves an agent's desk to a corner (es)", () => {
    const result = ask("mueve la mesa de Ana arriba a la derecha");
    expect(result.patch[0]).toMatchObject({ op: "move", id: "desk_ana", x: 14, y: 1 });
  });

  it("asks where when no place is given", () => {
    const result = ask("mueve el sofá");
    expect(result.patch).toEqual([]);
    expect(result.reply).toMatch(/A dónde/);
  });
});

describe("design chat: theme", () => {
  it("changes the floor to wood (es)", () => {
    const result = ask("cambia el suelo a madera", { ...base, floor: "carpet_blue" });
    expect(result.patch).toEqual([{ op: "theme", floor: "wood" }]);
    expect(result.applied.floor).toBe("wood");
  });

  it("changes the floor to carpet (en)", () => {
    const result = ask("change the floor to carpet");
    expect(result.patch).toEqual([{ op: "theme", floor: "carpet_blue" }]);
    expect(result.language).toBe("en");
  });

  it("changes the wall (es)", () => {
    const result = ask("cambia la pared a yeso");
    expect(result.patch).toEqual([{ op: "theme", wall: "plaster" }]);
  });

  it("explains unknown styles (en)", () => {
    const result = ask("change the floor to lava");
    expect(result.patch).toEqual([]);
    expect(result.reply).toMatch(/floor/i);
  });
});

describe("design chat: assign", () => {
  it("gives a free desk to an agent (es)", () => {
    const result = ask("mesa para Walter");
    expect(result.patch).toEqual([{ op: "assign", id: "desk_free", agentId: WALTER }]);
    expect(result.reply).toContain("Walter");
  });

  it("gives a free desk to an agent (en)", () => {
    const result = ask("desk for Walter");
    expect(result.patch).toEqual([{ op: "assign", id: "desk_free", agentId: WALTER }]);
    expect(result.language).toBe("en");
  });

  it("assigns the desk at explicit coordinates (es)", () => {
    const result = ask("asigna la mesa (2, 5) a Walter");
    expect(result.patch).toEqual([{ op: "assign", id: "desk_ana", agentId: WALTER }]);
    expect(result.applied.objects.find(object => object.id === "desk_ana")?.agentId).toBe(WALTER);
    expect(result.applied.objects.find(object => object.id === "desk_free")?.agentId).toBeUndefined();
  });

  it("adds a new desk when none is free, assigned in the same patch (en)", () => {
    const busy: OfficeLayout = { ...base, objects: base.objects.map(object => object.id === "desk_free" ? { ...object, agentId: ANA } : object) };
    const result = ask("assign a desk to Walter", busy);
    expect(result.patch[0]).toMatchObject({ op: "add", kind: "desk" });
    expect(result.patch[1]).toMatchObject({ op: "assign", agentId: WALTER });
    expect(result.applied.objects.filter(object => object.agentId === WALTER)).toHaveLength(1);
  });

  it("says when the agent already has a desk and nothing else was asked", () => {
    const result = ask("mesa para Ana");
    expect(result.patch).toEqual([]);
    expect(result.reply).toMatch(/ya tiene mesa/);
  });
});

describe("design chat: resize", () => {
  it("makes the office bigger (es)", () => {
    const result = ask("agranda la oficina");
    expect(result.patch).toEqual([{ op: "resize", cols: 20, rows: 14 }]);
  });

  it("makes the office smaller (en)", () => {
    const result = ask("make the office smaller");
    expect(result.patch).toEqual([{ op: "resize", cols: 12, rows: 10 }]);
  });

  it("accepts explicit dimensions and clamps them", () => {
    expect(ask("pon la oficina de 12x9").patch).toEqual([{ op: "resize", cols: 12, rows: 9 }]);
    expect(ask("resize the office to 99 by 1").patch).toEqual([{ op: "resize", cols: 40, rows: 6 }]);
  });
});

describe("design chat: fallbacks", () => {
  it("answers with examples when nothing is recognised (es)", () => {
    const result = ask("hola qué tal");
    expect(result.understood).toBe(false);
    expect(result.patch).toEqual([]);
    expect(result.reply).toMatch(/No entendí/);
    expect(result.language).toBe("es");
  });

  it("answers with examples when nothing is recognised (en)", () => {
    const result = ask("hello there friend", base, "en");
    expect(result.understood).toBe(false);
    expect(result.reply).toMatch(/did not understand/);
  });

  it("uses the requested language when the message does not reveal it", () => {
    expect(ask("hola", base, "en").language).toBe("en");
  });

  it("never mutates the layout it was given", () => {
    const snapshot = JSON.stringify(base);
    ask("quita el sofá");
    ask("mesa para Walter");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
