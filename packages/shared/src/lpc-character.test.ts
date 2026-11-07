import { describe, expect, it } from "vitest";
import {
  LPC_ANIMATIONS, LPC_FIELDS, LPC_FIELD_OPTIONS, LPC_POSES, LPC_SHEET_COLUMNS, LPC_SHEET_ROWS, LPC_SWATCHES,
  decodeLpcSpec, encodeLpcSpec, lpcAssetFolders, lpcCharacterSchema, lpcLayers, randomLpcCharacter,
} from "./lpc-character.js";
import { CHARACTER_STATES } from "./character-states.js";
import { agentAppearanceSchema, agentAvatarUrl, agentSpriteSheetUrl, appearanceForLpc, randomAgentAppearance, resolveAgentAppearance } from "./agent-appearance.js";

const character = {
  bodyType: "female", skin: "brown", eyes: "green", hair: "bob", hairColor: "pink", torso: "cardigan", torsoColor: "teal",
  legs: "formal", legsColor: "navy", feet: "boots", feetColor: "leather",
} as const;

describe("lpc-v1 character catalog", () => {
  it("round-trips the URL spec and rejects unknown or reordered tokens", () => {
    const spec = encodeLpcSpec(character);
    expect(spec).toBe("female.brown.green.bob.pink.cardigan.teal.formal.navy.boots.leather");
    expect(decodeLpcSpec(spec)).toEqual(character);
    expect(decodeLpcSpec("female.brown.green.bob.pink.cardigan.teal.formal.navy.boots")).toBeNull();
    expect(decodeLpcSpec(spec.replace("brown", "mauve"))).toBeNull();
    expect(decodeLpcSpec(spec.split(".").reverse().join("."))).toBeNull();
    expect(decodeLpcSpec(`${spec}/../x`)).toBeNull();
  });
  it("only ever draws random characters from the frozen catalog", () => {
    for (let i = 0; i < 200; i++) {
      const random = randomLpcCharacter();
      expect(lpcCharacterSchema.safeParse(random).success).toBe(true);
      for (const field of LPC_FIELDS) expect(LPC_FIELD_OPTIONS[field]).toContain(random[field]);
    }
    expect(randomAgentAppearance().characterVersion).toBe("lpc-v1");
  });
  it("orders layers by z position with the head above clothes and hair above the head", () => {
    const paths = lpcLayers(character).map(layer => layer.path);
    expect(paths).toEqual([
      "body/bodies/female/", "legs/formal/thin/", "feet/boots/basic/thin/", "torso/clothes/longsleeve/longsleeve2_cardigan/female/",
      "head/heads/human/female/", "hair/bob/adult/",
    ]);
    expect(lpcLayers({ ...character, hair: "none" }).map(layer => layer.path)).not.toContain("hair/bob/adult/");
    expect(lpcLayers({ ...character, bodyType: "male", feet: "shoes" }).map(layer => layer.path)).toContain("feet/shoes/basic/male/");
    expect(lpcAssetFolders()).toHaveLength(58);
    expect(lpcAssetFolders().every(folder => folder.endsWith("/"))).toBe(true);
  });
  it("defines a pose for every character state within the shared sheet geometry", () => {
    for (const state of CHARACTER_STATES) {
      const pose = LPC_POSES[state];
      expect(LPC_ANIMATIONS).toContain(pose.animation);
      expect(pose.frames.length).toBeGreaterThan(0);
      expect(pose.frames.length).toBeLessThanOrEqual(LPC_SHEET_COLUMNS);
      expect(pose.frames).toContain(pose.still);
    }
    expect(LPC_SHEET_ROWS).toBe(CHARACTER_STATES);
    expect(LPC_POSES.rest.frames).toEqual([0]);
  });
  it("has an editor swatch for every colour option", () => {
    expect(Object.keys(LPC_SWATCHES.body).sort()).toEqual([...LPC_FIELD_OPTIONS.skin].sort());
    expect(Object.keys(LPC_SWATCHES.eye).sort()).toEqual([...LPC_FIELD_OPTIONS.eyes].sort());
    expect(Object.keys(LPC_SWATCHES.hair).sort()).toEqual([...LPC_FIELD_OPTIONS.hairColor].sort());
    expect(Object.keys(LPC_SWATCHES.cloth).sort()).toEqual([...LPC_FIELD_OPTIONS.torsoColor].sort());
  });
  it("persists as an appearance and resolves to lpc-v1 avatar and sheet URLs", () => {
    const appearance = appearanceForLpc(character, "deep-tide");
    expect(agentAppearanceSchema.safeParse(appearance).success).toBe(true);
    expect(agentAppearanceSchema.safeParse({ ...appearance, lpc: { ...character, hair: "mullet" } }).success).toBe(false);
    expect(resolveAgentAppearance(appearance, "ignored")).toEqual(appearance);
    const spec = encodeLpcSpec(character);
    expect(agentAvatarUrl(appearance, 24, 2)).toBe(`/api/agent-avatars/lpc-v1/${spec}/rest.png?size=24&scale=2`);
    expect(agentAvatarUrl(appearance, 96, 1, "working", true, "paperclip-dark")).toBe(`/api/agent-avatars/lpc-v1/${spec}/working.png?size=96&scale=1&muted=1&background=paperclip-dark`);
    expect(agentSpriteSheetUrl(appearance)).toBe(`/api/agent-avatars/lpc-v1/${spec}/sheet.png`);
    expect(agentSpriteSheetUrl(appearance, true)).toBe(`/api/agent-avatars/lpc-v1/${spec}/sheet.png?muted=1`);
    expect(agentAppearanceSchema.safeParse({ ...appearance, scene: "night" }).success).toBe(true);
    expect(agentAppearanceSchema.safeParse({ ...appearance, scene: "mars" }).success).toBe(false);
    expect(appearanceForLpc(character, "deep-tide", "none")).not.toHaveProperty("scene");
    expect(appearanceForLpc(character, "deep-tide", "ocean").scene).toBe("ocean");
    expect(agentAvatarUrl(appearanceForLpc(character, "deep-tide", "ocean"), 24)).toBe(agentAvatarUrl(appearance, 24));
    const custom = { ...appearance, customAvatarAssetId: "22222222-2222-4222-8222-222222222222" };
    expect(agentAvatarUrl(custom)).toBe("/api/assets/22222222-2222-4222-8222-222222222222/content");
  });
});
