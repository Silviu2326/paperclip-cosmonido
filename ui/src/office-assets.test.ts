// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const officeDir = path.resolve(here, "../public/office");

interface Rect { atlas: string; x: number; y: number; w?: number; h?: number }
interface Catalog {
  version: number;
  tileSize: number;
  atlases: Record<string, string>;
  floors: Record<string, Rect>;
  walls: Record<string, { atlas: string; top: { x: number; y: number }; face: { x: number; y: number } }>;
  objects: Record<string, Rect & { w: number; h: number; footprint: { w: number; h: number }; walkable: boolean; seat?: { dx: number; dy: number; facing: string } }>;
}

const catalog: Catalog = JSON.parse(fs.readFileSync(path.join(officeDir, "catalog.json"), "utf8"));

/** Reads width/height from the PNG IHDR chunk (bytes 16-23, big-endian). */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect(Array.from(buf.subarray(0, 8))).toEqual(signature);
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function atlasSize(name: string) {
  const url = catalog.atlases[name];
  expect(url, `atlas ${name} declared`).toBeTruthy();
  return pngSize(path.join(officeDir, url.replace(/^\/office\//, "")));
}

function expectInside(label: string, atlas: string, x: number, y: number, w: number, h: number) {
  const size = atlasSize(atlas);
  expect(x, `${label} x >= 0`).toBeGreaterThanOrEqual(0);
  expect(y, `${label} y >= 0`).toBeGreaterThanOrEqual(0);
  expect(x + w, `${label} inside atlas width`).toBeLessThanOrEqual(size.width);
  expect(y + h, `${label} inside atlas height`).toBeLessThanOrEqual(size.height);
}

describe("office catalog", () => {
  it("has version 1 and 32 px tiles", () => {
    expect(catalog.version).toBe(1);
    expect(catalog.tileSize).toBe(32);
  });

  it("every atlas PNG exists and is a valid PNG", () => {
    for (const name of Object.keys(catalog.atlases)) {
      const size = atlasSize(name);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  it("every floor tile (32x32) lies inside its atlas", () => {
    expect(Object.keys(catalog.floors).length).toBeGreaterThanOrEqual(2);
    for (const [id, f] of Object.entries(catalog.floors)) {
      expectInside(`floor ${id}`, f.atlas, f.x, f.y, catalog.tileSize, catalog.tileSize);
    }
  });

  it("every wall has top and face tiles inside its atlas", () => {
    expect(Object.keys(catalog.walls).length).toBeGreaterThanOrEqual(1);
    for (const [id, wall] of Object.entries(catalog.walls)) {
      expectInside(`wall ${id} top`, wall.atlas, wall.top.x, wall.top.y, catalog.tileSize, catalog.tileSize);
      expectInside(`wall ${id} face`, wall.atlas, wall.face.x, wall.face.y, catalog.tileSize, catalog.tileSize);
    }
  });

  it("every object rect lies inside its atlas, with a footprint of at least 1x1", () => {
    for (const [id, o] of Object.entries(catalog.objects)) {
      expect(o.w, `${id} w > 0`).toBeGreaterThan(0);
      expect(o.h, `${id} h > 0`).toBeGreaterThan(0);
      expectInside(`object ${id}`, o.atlas, o.x, o.y, o.w, o.h);
      expect(o.footprint.w, `${id} footprint.w`).toBeGreaterThanOrEqual(1);
      expect(o.footprint.h, `${id} footprint.h`).toBeGreaterThanOrEqual(1);
      expect(typeof o.walkable).toBe("boolean");
      if (o.seat) {
        expect(["up", "down", "left", "right"]).toContain(o.seat.facing);
      }
    }
  });

  it("covers the required kinds", () => {
    const required = ["desk", "chair", "plant", "sofa", "coffee", "window", "bookshelf", "whiteboard"];
    for (const kind of required) {
      expect(catalog.objects[kind], `object kind ${kind}`).toBeDefined();
    }
    expect(catalog.objects.desk.seat).toBeDefined();
    expect(catalog.objects.chair.seat).toBeDefined();
    expect(catalog.objects.sofa.seat).toBeDefined();
  });
});
