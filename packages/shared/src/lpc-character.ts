import { z } from "zod";
import { CHARACTER_STATES, type CharacterState } from "./character-states.js";

/**
 * lpc-v1: pixel-art agent characters composed from Liberated Pixel Cup (LPC)
 * layers, the same art and palette system used by the Universal LPC
 * Spritesheet Character Generator. The catalog below is a curated, frozen
 * subset; every id maps to a sprite folder vendored under
 * `server/src/lpc-assets`. Changing ids, layer order, palettes or poses
 * changes pixels and therefore requires a new character version.
 */
export const LPC_CHARACTER_VERSION = "lpc-v1" as const;
export const LPC_FRAME_SIZE = 64;
/** Per-animation LPC sheets: one row per direction, one column per frame. */
export const LPC_DOWN_ROW = 2;

/** Presentation-only backdrops drawn by the UI behind the live character (CSS, no server rendering). */
export const LPC_SCENES = ["none", "meadow", "sunset", "night", "ocean", "desert", "space"] as const;
export type LpcScene = typeof LPC_SCENES[number];

export const LPC_BODY_TYPES = ["male", "female"] as const;
export type LpcBodyType = typeof LPC_BODY_TYPES[number];
/** "body" material variants (ULPC palette). */
export const LPC_SKIN_TONES = ["light", "amber", "olive", "taupe", "bronze", "brown", "black"] as const;
/** "eye" material variants (ULPC palette). */
export const LPC_EYE_COLORS = ["blue", "green", "brown", "gray", "purple", "orange"] as const;
/** "hair" material variants (ULPC palette). */
export const LPC_HAIR_COLORS = ["black", "dark_brown", "chestnut", "light_brown", "blonde", "ginger", "red", "gray", "white", "blue", "purple", "pink", "green"] as const;
/** "cloth" material variants (ULPC palette). */
export const LPC_CLOTH_COLORS = ["white", "gray", "slate", "charcoal", "black", "brown", "leather", "walnut", "tan", "yellow", "orange", "rose", "maroon", "red", "pink", "lavender", "purple", "blue", "navy", "sky", "bluegray", "teal", "forest", "green"] as const;

export const LPC_HAIR_STYLES = ["none", "plain", "bob", "pixie", "messy", "curly_short", "curly_long", "afro", "long_straight", "spiked", "parted", "buzzcut", "bangs_bun", "cornrows", "dreadlocks_short", "swoop", "mop"] as const;
export const LPC_TORSOS = ["longsleeve", "polo", "cardigan", "buttoned", "tshirt", "tshirt_vneck", "shortsleeve_polo", "sleeveless"] as const;
export const LPC_LEGS = ["pants", "long_pants", "cuffed", "formal", "shorts", "leggings"] as const;
export const LPC_FEET = ["shoes", "shoes_revised", "boots", "boots_fold", "sandals"] as const;

export const lpcCharacterSchema = z.object({
  bodyType: z.enum(LPC_BODY_TYPES),
  skin: z.enum(LPC_SKIN_TONES),
  eyes: z.enum(LPC_EYE_COLORS),
  hair: z.enum(LPC_HAIR_STYLES),
  hairColor: z.enum(LPC_HAIR_COLORS),
  torso: z.enum(LPC_TORSOS),
  torsoColor: z.enum(LPC_CLOTH_COLORS),
  legs: z.enum(LPC_LEGS),
  legsColor: z.enum(LPC_CLOTH_COLORS),
  feet: z.enum(LPC_FEET),
  feetColor: z.enum(LPC_CLOTH_COLORS),
}).strict();
export type LpcCharacter = z.infer<typeof lpcCharacterSchema>;

/** Field order is the URL spec order; it is part of the frozen lpc-v1 contract. */
export const LPC_FIELDS = ["bodyType", "skin", "eyes", "hair", "hairColor", "torso", "torsoColor", "legs", "legsColor", "feet", "feetColor"] as const satisfies readonly (keyof LpcCharacter)[];
export const LPC_FIELD_OPTIONS: { [K in keyof LpcCharacter]: readonly LpcCharacter[K][] } = {
  bodyType: LPC_BODY_TYPES, skin: LPC_SKIN_TONES, eyes: LPC_EYE_COLORS, hair: LPC_HAIR_STYLES, hairColor: LPC_HAIR_COLORS,
  torso: LPC_TORSOS, torsoColor: LPC_CLOTH_COLORS, legs: LPC_LEGS, legsColor: LPC_CLOTH_COLORS, feet: LPC_FEET, feetColor: LPC_CLOTH_COLORS,
};

/** Compact, URL-safe, order-preserving encoding used as the avatar path segment. */
export function encodeLpcSpec(character: LpcCharacter): string {
  return LPC_FIELDS.map(field => character[field]).join(".");
}
export function decodeLpcSpec(spec: string): LpcCharacter | null {
  const parts = spec.split(".");
  if (parts.length !== LPC_FIELDS.length) return null;
  const candidate: Record<string, string> = {};
  LPC_FIELDS.forEach((field, index) => { candidate[field] = parts[index]; });
  const parsed = lpcCharacterSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function pick<T>(options: readonly T[]): T {
  const bytes = new Uint32Array(1);
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x100000000 / options.length) * options.length;
  do { globalThis.crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return options[bytes[0] % options.length];
}
/** A persisted choice, never randomize while rendering. */
export function randomLpcCharacter(): LpcCharacter {
  const hairStyles = LPC_HAIR_STYLES.filter(style => style !== "none");
  return {
    bodyType: pick(LPC_BODY_TYPES), skin: pick(LPC_SKIN_TONES), eyes: pick(LPC_EYE_COLORS),
    hair: pick([...hairStyles, ...hairStyles, "none"] as const), hairColor: pick(LPC_HAIR_COLORS),
    torso: pick(LPC_TORSOS), torsoColor: pick(LPC_CLOTH_COLORS),
    legs: pick(LPC_LEGS), legsColor: pick(LPC_CLOTH_COLORS),
    feet: pick(LPC_FEET), feetColor: pick(LPC_CLOTH_COLORS),
  };
}

/** Animations vendored for lpc-v1; each is a separate LPC sheet per layer. */
export const LPC_ANIMATIONS = ["idle", "walk", "emote", "sit", "spellcast", "jump"] as const;
export type LpcAnimation = typeof LPC_ANIMATIONS[number];
export interface LpcPose {
  animation: LpcAnimation;
  /** Materialized frame sequence (sheet columns), looped at `fps`. */
  frames: readonly number[];
  fps: number;
  /** Frame used for still portraits. */
  still: number;
}
export const LPC_POSES: Record<CharacterState, LpcPose> = {
  rest: { animation: "idle", frames: [0], fps: 1, still: 0 },
  idle: { animation: "idle", frames: [0, 0, 0, 0, 0, 0, 1, 1], fps: 3, still: 0 },
  listening: { animation: "idle", frames: [0, 1], fps: 1, still: 0 },
  thinking: { animation: "spellcast", frames: [0, 1, 2, 3, 3, 3, 2, 1], fps: 4, still: 3 },
  working: { animation: "walk", frames: [1, 2, 3, 4, 5, 6, 7, 8], fps: 8, still: 2 },
  success: { animation: "jump", frames: [0, 1, 2, 3, 4, 1], fps: 6, still: 2 },
  confused: { animation: "emote", frames: [0, 0, 1, 1, 2, 2, 1, 1], fps: 3, still: 2 },
  sleepy: { animation: "sit", frames: [0, 0, 0, 1, 1, 1, 2, 2, 2], fps: 1, still: 0 },
  loading: { animation: "spellcast", frames: [0, 1, 2, 3, 4, 5, 6], fps: 8, still: 3 },
};
/** Composite sheet served at `sheet.png`: one row per character state, frames across. */
export const LPC_SHEET_ROWS = CHARACTER_STATES;
export const LPC_SHEET_COLUMNS = Math.max(...Object.values(LPC_POSES).map(pose => pose.frames.length));

export type LpcMaterial = "body" | "eye" | "hair" | "cloth";
export interface LpcLayer {
  /** Sprite folder relative to the LPC `spritesheets` root, with trailing slash. */
  path: string;
  zPos: number;
  recolors: readonly (readonly [LpcMaterial, string])[];
}
const HAIR_FOLDERS: Record<Exclude<LpcCharacter["hair"], "none">, string> = {
  plain: "plain", bob: "bob", pixie: "pixie", messy: "messy1", curly_short: "curly_short", curly_long: "curly_long", afro: "afro",
  long_straight: "long_straight", spiked: "spiked", parted: "parted", buzzcut: "buzzcut", bangs_bun: "bangs_bun",
  cornrows: "cornrows", dreadlocks_short: "dreadlocks_short", swoop: "swoop", mop: "mop",
};
const TORSO_FOLDERS: Record<LpcCharacter["torso"], string> = {
  longsleeve: "longsleeve/longsleeve", polo: "longsleeve/longsleeve2_polo", cardigan: "longsleeve/longsleeve2_cardigan",
  buttoned: "longsleeve/longsleeve2_buttoned", tshirt: "shortsleeve/tshirt", tshirt_vneck: "shortsleeve/tshirt_vneck",
  shortsleeve_polo: "shortsleeve/shortsleeve_polo", sleeveless: "sleeveless/sleeveless2",
};
const LEGS_FOLDERS: Record<LpcCharacter["legs"], string> = {
  pants: "pants", long_pants: "pants2", cuffed: "cuffed", formal: "formal", shorts: "shorts/shorts", leggings: "leggings",
};
const FEET_FOLDERS: Record<LpcCharacter["feet"], { folder: string; zPos: number }> = {
  shoes: { folder: "shoes/basic", zPos: 15 }, shoes_revised: { folder: "shoes/revised", zPos: 15 },
  boots: { folder: "boots/basic", zPos: 25 }, boots_fold: { folder: "boots/fold", zPos: 25 }, sandals: { folder: "sandals", zPos: 15 },
};
/** Layers in draw order (lower zPos first), mirroring the generator z positions. */
export function lpcLayers(character: LpcCharacter): LpcLayer[] {
  const slim = character.bodyType === "female" ? "thin" : "male";
  const layers: LpcLayer[] = [
    { path: `body/bodies/${character.bodyType}/`, zPos: 10, recolors: [["body", character.skin]] },
    { path: `feet/${FEET_FOLDERS[character.feet].folder}/${slim}/`, zPos: FEET_FOLDERS[character.feet].zPos, recolors: [["cloth", character.feetColor]] },
    { path: `legs/${LEGS_FOLDERS[character.legs]}/${slim}/`, zPos: 20, recolors: [["cloth", character.legsColor]] },
    { path: `torso/clothes/${TORSO_FOLDERS[character.torso]}/${character.bodyType}/`, zPos: 35, recolors: [["cloth", character.torsoColor]] },
    { path: `head/heads/human/${character.bodyType}/`, zPos: 100, recolors: [["body", character.skin], ["eye", character.eyes]] },
  ];
  if (character.hair !== "none") layers.push({ path: `hair/${HAIR_FOLDERS[character.hair]}/adult/`, zPos: 120, recolors: [["hair", character.hairColor]] });
  return layers.sort((a, b) => a.zPos - b.zPos);
}
/** Every sprite folder a complete lpc-v1 asset bundle must contain. */
export function lpcAssetFolders(): string[] {
  const folders = new Set<string>();
  for (const bodyType of LPC_BODY_TYPES) {
    for (const hair of LPC_HAIR_STYLES) for (const torso of LPC_TORSOS) for (const legs of LPC_LEGS) for (const feet of LPC_FEET) {
      const sample: LpcCharacter = { bodyType, skin: "light", eyes: "blue", hair, hairColor: "black", torso, torsoColor: "white", legs, legsColor: "white", feet, feetColor: "white" };
      for (const layer of lpcLayers(sample)) folders.add(layer.path);
    }
  }
  return [...folders].sort();
}

/** Representative colors for editor swatches; the rendered palettes live with the server assets. */
export const LPC_SWATCHES: Record<LpcMaterial, Record<string, string>> = {
  body: { light: "#f9d5ba", amber: "#fdd082", olive: "#d38b59", taupe: "#ba8454", bronze: "#ae6b3f", brown: "#7f4c31", black: "#442725" },
  eye: { blue: "#4d79b8", green: "#4f9a4f", brown: "#7a4a2a", gray: "#8a8f99", purple: "#8c5bc2", orange: "#d9822b" },
  hair: { black: "#2b2525", dark_brown: "#4a3222", chestnut: "#7a4a2a", light_brown: "#a8734a", blonde: "#e8c872", ginger: "#d8742a", red: "#b53a2a", gray: "#9a9a9a", white: "#ededed", blue: "#4d79b8", purple: "#8c5bc2", pink: "#e87fb3", green: "#4f9a4f" },
  cloth: { white: "#efefef", gray: "#9d9d9d", slate: "#6c7a8a", charcoal: "#4b4b4b", black: "#2a2a2a", brown: "#7a5230", leather: "#9a6b3f", walnut: "#5d3d26", tan: "#cdb088", yellow: "#e9c84b", orange: "#e0802c", rose: "#d9748a", maroon: "#7a2a3a", red: "#c13a2a", pink: "#e8a0c0", lavender: "#b49ad6", purple: "#7a4aa8", blue: "#3d6fb8", navy: "#2b3f7a", sky: "#7fb8e0", bluegray: "#7a8fa8", teal: "#2f8f8a", forest: "#2f6b3a", green: "#4fa04f" },
};
