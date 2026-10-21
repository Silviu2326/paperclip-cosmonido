import { readFile } from "node:fs/promises";
import sharp, { type OverlayOptions, type Sharp } from "sharp";
import {
  CHARACTER_STATES, LPC_DOWN_ROW, LPC_FRAME_SIZE, LPC_POSES, LPC_SHEET_COLUMNS, PAPERCLIP_DARK_AVATAR_BACKGROUND, lpcLayers,
  type AgentAvatarBackground, type AgentAvatarSize, type CharacterState, type LpcAnimation, type LpcCharacter, type LpcMaterial,
} from "@paperclipai/shared";

/**
 * lpc-v1 compositor. Mirrors the Universal LPC Spritesheet Character Generator:
 * layers are drawn in z order, each recoloured by mapping its material's base
 * palette to the chosen variant with a tolerance of 1 per channel. Only the
 * down-facing row of each per-animation sheet is used. No DOM, no WebGL.
 */
export const LPC_ASSET_ROOT = new URL("../lpc-assets/", import.meta.url);
const FRAME = LPC_FRAME_SIZE;
const CHANNELS = 4;

type Palette = { base: string; variants: Record<string, string[]> };
type RawImage = { data: Buffer; width: number; height: number };
type ColorPair = readonly [number, number, number, number, number, number];

const paletteCache = new Map<LpcMaterial, Promise<Palette>>();
function palette(material: LpcMaterial): Promise<Palette> {
  let pending = paletteCache.get(material);
  if (!pending) {
    pending = readFile(new URL(`palettes/${material}.json`, LPC_ASSET_ROOT), "utf8").then(text => JSON.parse(text) as Palette);
    pending.catch(() => paletteCache.delete(material));
    paletteCache.set(material, pending);
  }
  return pending;
}
const hex = (value: string) => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)] as const;
async function colorPairs(recolors: readonly (readonly [LpcMaterial, string])[]): Promise<ColorPair[]> {
  const pairs: ColorPair[] = [];
  for (const [material, variant] of recolors) {
    const { base, variants } = await palette(material);
    if (variant === base) continue;
    const source = variants[base], target = variants[variant];
    if (!source || !target || source.length !== target.length) throw new Error(`Unknown ${material} palette variant ${variant}`);
    for (let i = 0; i < source.length; i++) {
      const [sr, sg, sb] = hex(source[i]!), [tr, tg, tb] = hex(target[i]!);
      pairs.push([sr, sg, sb, tr, tg, tb]);
    }
  }
  return pairs;
}
function recolor(image: RawImage, pairs: ColorPair[]): RawImage {
  if (!pairs.length) return image;
  const data = Buffer.from(image.data);
  for (let p = 0; p < data.length; p += CHANNELS) {
    if (data[p + 3] === 0) continue;
    const r = data[p]!, g = data[p + 1]!, b = data[p + 2]!;
    for (const [sr, sg, sb, tr, tg, tb] of pairs) {
      if (Math.abs(r - sr) <= 1 && Math.abs(g - sg) <= 1 && Math.abs(b - sb) <= 1) { data[p] = tr; data[p + 1] = tg; data[p + 2] = tb; break; }
    }
  }
  return { data, width: image.width, height: image.height };
}

/** Decoded, un-recoloured down-facing rows. Bounded: workers are short-lived and sheets are small. */
const rowCache = new Map<string, Promise<RawImage>>();
const ROW_CACHE_LIMIT = 128;
function downRow(path: string, animation: LpcAnimation): Promise<RawImage> {
  const key = `${path}${animation}`;
  let pending = rowCache.get(key);
  if (!pending) {
    pending = (async () => {
      const file = new URL(`spritesheets/${path}${animation}.png`, LPC_ASSET_ROOT);
      const { data, info } = await sharp(await readFile(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.height < (LPC_DOWN_ROW + 1) * FRAME || info.width % FRAME !== 0) throw new Error(`Unexpected LPC sheet geometry for ${path}${animation}`);
      const stride = info.width * CHANNELS;
      return { data: Buffer.from(data.subarray(LPC_DOWN_ROW * FRAME * stride, (LPC_DOWN_ROW + 1) * FRAME * stride)), width: info.width, height: FRAME };
    })();
    pending.catch(() => rowCache.delete(key));
    rowCache.set(key, pending);
    if (rowCache.size > ROW_CACHE_LIMIT) rowCache.delete(rowCache.keys().next().value!);
  }
  return pending;
}
function cropRaw(image: RawImage, left: number, top: number, width: number, height: number): RawImage {
  const data = Buffer.alloc(width * height * CHANNELS);
  for (let y = 0; y < height; y++) {
    const sourceY = top + y;
    if (sourceY >= image.height) break;
    const sourceStart = (sourceY * image.width + left) * CHANNELS;
    const copyWidth = Math.max(0, Math.min(width, image.width - left));
    image.data.copy(data, y * width * CHANNELS, sourceStart, sourceStart + copyWidth * CHANNELS);
  }
  return { data, width, height };
}

/** The down-facing strip (frames across) of one animation for a complete character. */
export async function composeLpcStrip(character: LpcCharacter, animation: LpcAnimation): Promise<RawImage> {
  const layers = await Promise.all(lpcLayers(character).map(async layer => recolor(await downRow(layer.path, animation), await colorPairs(layer.recolors))));
  const width = Math.max(...layers.map(layer => layer.width));
  const composed = await sharp({ create: { width, height: FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers.map(layer => ({ input: layer.data, raw: { width: layer.width, height: layer.height, channels: 4 }, left: 0, top: 0 })))
    .raw().toBuffer();
  return { data: composed, width, height: FRAME };
}
function frameOf(strip: RawImage, index: number): RawImage {
  return cropRaw(strip, Math.min(index, strip.width / FRAME - 1) * FRAME, 0, FRAME, FRAME);
}
/** Head-and-shoulders square for small sizes: anchored to the first opaque row, centred horizontally. */
function bustCrop(frame: RawImage): { left: number; top: number; size: number } {
  const size = FRAME / 2;
  let top = FRAME, minX = FRAME, maxX = -1;
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
    if (frame.data[(y * FRAME + x) * CHANNELS + 3]! === 0) continue;
    if (y < top) top = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (maxX < 0) return { left: size / 2, top: 0, size };
  const centre = Math.round((minX + maxX) / 2);
  return { left: Math.max(0, Math.min(FRAME - size, centre - size / 2)), top: Math.max(0, Math.min(FRAME - size, top - 1)), size };
}

export interface LpcFrameRequest {
  character: LpcCharacter;
  pose: CharacterState;
  size: AgentAvatarSize;
  scale: 1 | 2;
  muted?: boolean;
  background?: AgentAvatarBackground;
}
function finish(image: Sharp, muted: boolean | undefined, background: AgentAvatarBackground | undefined) {
  if (muted) image = image.greyscale();
  if (background === "paperclip-dark") image = image.flatten({ background: PAPERCLIP_DARK_AVATAR_BACKGROUND });
  return image.png({ compressionLevel: 9 }).toBuffer();
}
/** A still portrait: the pose's representative frame, bust-cropped below 64 logical px, scaled with nearest-neighbour when enlarging. */
export async function renderLpcFrame(request: LpcFrameRequest): Promise<Buffer> {
  const pose = LPC_POSES[request.pose];
  const frame = frameOf(await composeLpcStrip(request.character, pose.animation), pose.still);
  const crop = request.size < FRAME ? bustCrop(frame) : { left: 0, top: 0, size: FRAME };
  const target = request.size * request.scale;
  const image = sharp(frame.data, { raw: { width: FRAME, height: FRAME, channels: 4 } })
    .extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
    .resize(target, target, { kernel: target >= crop.size ? "nearest" : "lanczos3", fit: "fill" });
  return finish(image, request.muted, request.background);
}
/** Native-resolution animation sheet: one row per character state (CHARACTER_STATES order), the pose's frame sequence across. */
export async function renderLpcSheet(character: LpcCharacter, muted = false): Promise<Buffer> {
  const strips = new Map<LpcAnimation, Promise<RawImage>>();
  const strip = (animation: LpcAnimation) => { let s = strips.get(animation); if (!s) { s = composeLpcStrip(character, animation); strips.set(animation, s); } return s; };
  const tiles: OverlayOptions[] = [];
  for (const [row, state] of CHARACTER_STATES.entries()) {
    const pose = LPC_POSES[state];
    const source = await strip(pose.animation);
    pose.frames.forEach((index, column) => {
      const frame = frameOf(source, index);
      tiles.push({ input: frame.data, raw: { width: FRAME, height: FRAME, channels: 4 }, left: column * FRAME, top: row * FRAME });
    });
  }
  const image = sharp({ create: { width: LPC_SHEET_COLUMNS * FRAME, height: CHARACTER_STATES.length * FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles);
  return finish(image, muted, undefined);
}
