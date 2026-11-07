import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OFFICE_SERVER_CATALOG } from "../services/office-layouts.js";

/** The server mirrors the UI catalog's footprints so default layouts fit the real art. */
describe("office catalog mirror", () => {
  it("matches ui/public/office/catalog.json", () => {
    const file = fileURLToPath(new URL("../../../ui/public/office/catalog.json", import.meta.url));
    const catalog = JSON.parse(readFileSync(file, "utf8")) as { floors: Record<string, unknown>; walls: Record<string, unknown>; objects: Record<string, { footprint: { w: number; h: number }; walkable: boolean; seat?: unknown }> };
    expect(Object.keys(OFFICE_SERVER_CATALOG.floors).sort()).toEqual(Object.keys(catalog.floors).sort());
    expect(Object.keys(OFFICE_SERVER_CATALOG.walls).sort()).toEqual(Object.keys(catalog.walls).sort());
    expect(Object.keys(OFFICE_SERVER_CATALOG.objects).sort()).toEqual(Object.keys(catalog.objects).sort());
    for (const [kind, object] of Object.entries(catalog.objects)) {
      expect(OFFICE_SERVER_CATALOG.objects[kind], kind).toEqual({ footprint: object.footprint, walkable: object.walkable, ...(object.seat ? { seat: object.seat } : {}) });
    }
  });
});
