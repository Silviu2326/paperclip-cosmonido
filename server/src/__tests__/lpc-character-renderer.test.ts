import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Server } from "node:http";
import sharp from "sharp";
import { CHARACTER_STATES, LPC_ANIMATIONS, LPC_FRAME_SIZE, LPC_SHEET_COLUMNS, appearanceForLpc, encodeLpcSpec, lpcAssetFolders, type LpcCharacter } from "@paperclipai/shared";
import { LPC_ASSET_ROOT, composeLpcStrip, renderLpcFrame, renderLpcSheet } from "../services/lpc-character-renderer.js";
import { avatarCacheKey, createAgentAvatarService, type AgentAvatarRequest } from "../services/agent-avatars.js";
import { createAgentAvatarPool } from "../services/agent-avatar-pool.js";
import { agentAvatarRoutes } from "../routes/agent-avatars.js";

const character: LpcCharacter = {
  bodyType: "male", skin: "olive", eyes: "green", hair: "plain", hairColor: "chestnut", torso: "longsleeve", torsoColor: "teal",
  legs: "pants", legsColor: "navy", feet: "shoes", feetColor: "brown",
};
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(fn => fn())); });

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]!, a: data[offset + 3]!, width: info.width, height: info.height };
}
function centreOpaquePixels(data: Buffer, width: number, height: number) {
  const samples: Array<[number, number, number]> = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (data[offset + 3]! > 0) samples.push([data[offset]!, data[offset + 1]!, data[offset + 2]!]);
  }
  return samples;
}

describe("lpc-v1 character renderer", () => {
  it("ships every sprite and palette the catalog references", async () => {
    const root = fileURLToPath(LPC_ASSET_ROOT);
    for (const folder of lpcAssetFolders()) for (const animation of LPC_ANIMATIONS) {
      expect(existsSync(`${root}spritesheets/${folder}${animation}.png`), `${folder}${animation}.png`).toBe(true);
    }
    for (const material of ["body", "hair", "cloth", "eye"]) {
      const palette = JSON.parse(await readFile(`${root}palettes/${material}.json`, "utf8")) as { base: string; variants: Record<string, string[]> };
      expect(palette.variants[palette.base]).toBeDefined();
      for (const colours of Object.values(palette.variants)) expect(colours).toHaveLength(palette.variants[palette.base]!.length);
    }
    const credits = await readFile(`${root}CREDITS.csv`, "utf8");
    expect(credits.split("\n")[0]).toContain("filename");
    for (const folder of lpcAssetFolders()) expect(credits).toContain(`"${folder}*"`);
  });
  it("recolours layers by palette and composes deterministic down-facing strips", async () => {
    const olive = await composeLpcStrip(character, "idle");
    const again = await composeLpcStrip(character, "idle");
    expect(olive.width).toBe(2 * LPC_FRAME_SIZE);
    expect(olive.height).toBe(LPC_FRAME_SIZE);
    expect(olive.data.equals(again.data)).toBe(true);
    const black = await composeLpcStrip({ ...character, skin: "black" }, "idle");
    expect(black.data.equals(olive.data)).toBe(false);
    const oliveColours = new Set(centreOpaquePixels(olive.data, olive.width, olive.height).map(rgb => rgb.join(",")));
    // The olive skin palette highlight must be present, and the base (light) palette highlight absent.
    expect(oliveColours.has("211,139,89")).toBe(true);
    expect(oliveColours.has("249,213,186")).toBe(false);
    const bald = await composeLpcStrip({ ...character, hair: "none" }, "idle");
    expect(bald.data.equals(olive.data)).toBe(false);
  });
  it("renders portraits at the requested raster size, bust-cropped below 64px, with muted and dark variants", async () => {
    const small = await pixel(await renderLpcFrame({ character, pose: "rest", size: 24, scale: 2 }), 0, 0);
    expect([small.width, small.height]).toEqual([48, 48]);
    expect(small.a).toBe(0);
    const large = await renderLpcFrame({ character, pose: "working", size: 128, scale: 1 });
    const meta = await sharp(large).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([128, 128, "png"]);
    const dark = await pixel(await renderLpcFrame({ character, pose: "sleepy", size: 64, scale: 1, muted: true, background: "paperclip-dark" }), 0, 0);
    expect([dark.r, dark.g, dark.b, dark.a]).toEqual([23, 23, 23, 255]);
    const muted = await sharp(await renderLpcFrame({ character, pose: "rest", size: 64, scale: 1, muted: true })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [r, g, b] of centreOpaquePixels(muted.data, muted.info.width, muted.info.height)) { expect(r).toBe(g); expect(g).toBe(b); }
  });
  it("lays the animation sheet out one state per row in CHARACTER_STATES order", async () => {
    const sheet = await renderLpcSheet(character);
    const meta = await sharp(sheet).metadata();
    expect([meta.width, meta.height]).toEqual([LPC_SHEET_COLUMNS * LPC_FRAME_SIZE, CHARACTER_STATES.length * LPC_FRAME_SIZE]);
    const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const opaqueInTile = (column: number, row: number) => {
      let count = 0;
      for (let y = row * LPC_FRAME_SIZE; y < (row + 1) * LPC_FRAME_SIZE; y++) for (let x = column * LPC_FRAME_SIZE; x < (column + 1) * LPC_FRAME_SIZE; x++) {
        if (data[(y * info.width + x) * 4 + 3]! > 0) count++;
      }
      return count;
    };
    // rest has a single frame; working (walk) fills all eight columns; the padding column stays empty.
    expect(opaqueInTile(0, CHARACTER_STATES.indexOf("rest"))).toBeGreaterThan(0);
    expect(opaqueInTile(1, CHARACTER_STATES.indexOf("rest"))).toBe(0);
    expect(opaqueInTile(7, CHARACTER_STATES.indexOf("working"))).toBeGreaterThan(0);
    expect(opaqueInTile(8, CHARACTER_STATES.indexOf("working"))).toBe(0);
    expect(opaqueInTile(8, CHARACTER_STATES.indexOf("sleepy"))).toBeGreaterThan(0);
  });
  it("serves lpc-v1 portraits and sheets through the public avatar route and rejects malformed specs", async () => {
    const pool = createAgentAvatarPool(1);
    cleanups.push(() => pool.close());
    const stored = new Map<string, Buffer>();
    const service = createAgentAvatarService({
      async headObject({ objectKey }) { const body = stored.get(objectKey); return body ? { exists: true, contentLength: body.length } : { exists: false }; },
      async getObject({ objectKey }) { const { Readable } = await import("node:stream"); return { stream: Readable.from([stored.get(objectKey)!]) }; },
      async putObject({ objectKey, body }) { stored.set(objectKey, Buffer.from(body as Buffer)); },
      async deleteObject({ objectKey }) { stored.delete(objectKey); },
    } as never, pool.render);
    const app = express(); app.use("/api", agentAvatarRoutes(service).router);
    const server = await new Promise<Server>(resolve => { const running = app.listen(0, "127.0.0.1", () => resolve(running)); });
    cleanups.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/agent-avatars/lpc-v1`;
    const spec = encodeLpcSpec(character);
    const portrait = await fetch(`${base}/${spec}/idle.png?size=32&scale=2&muted=1`);
    expect(portrait.status).toBe(200);
    expect(portrait.headers.get("content-type")).toContain("image/png");
    expect(portrait.headers.get("cache-control")).toContain("immutable");
    expect((await sharp(Buffer.from(await portrait.arrayBuffer())).metadata()).width).toBe(64);
    const sheet = await fetch(`${base}/${spec}/sheet.png`);
    expect(sheet.status).toBe(200);
    expect((await sharp(Buffer.from(await sheet.arrayBuffer())).metadata()).height).toBe(CHARACTER_STATES.length * LPC_FRAME_SIZE);
    expect((await fetch(`${base}/${spec}/sheet.png?size=64`)).status).toBe(400);
    expect((await fetch(`${base}/${spec.replace("olive", "mauve")}/idle.png`)).status).toBe(400);
    expect((await fetch(`${base}/${spec}/idle.png?background=red`)).status).toBe(400);
    expect((await fetch(`${base}/credits`)).headers.get("content-type")).toContain("text/csv");
    const request: AgentAvatarRequest = { appearance: appearanceForLpc(character), muted: true, pose: "rest", size: 512, scale: 1, sheet: true };
    expect(avatarCacheKey(request)).toBe(`generated-agent-avatars/lpc-v1/${spec}/sheet-muted.png`);
    expect(avatarCacheKey({ ...request, sheet: false, pose: "idle", size: 32, scale: 2 })).toBe(`generated-agent-avatars/lpc-v1/${spec}/idle-32-2-muted.png`);
  });
});
