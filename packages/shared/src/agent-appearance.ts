import { z } from "zod";
import { CHARACTER_STATES, type CharacterState } from "./character-states.js";
import { LPC_CHARACTER_VERSION, LPC_SCENES, encodeLpcSpec, lpcCharacterSchema, randomLpcCharacter, type LpcCharacter, type LpcScene } from "./lpc-character.js";

export { CHARACTER_STATES, type CharacterState };

export const AGENT_PALETTE_IDS = ["bubblegum-sky", "pink-lemonade", "orchid-peach", "coral-mint", "lime-lagoon", "arctic-blue", "solar-flare", "violet-ember", "deep-tide", "coral-current", "golden-hour", "tangerine-cobalt", "electric-grove", "flamingo-jade", "cherry-pop", "turquoise-cherry", "ultraviolet-tide"] as const;
export type AgentPaletteId = typeof AGENT_PALETTE_IDS[number];
export type CharacterPaletteId = AgentPaletteId | "muted-dream";
export const AGENT_AVATAR_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512] as const;
export type AgentAvatarSize = typeof AGENT_AVATAR_SIZES[number];
export type AgentAvatarBackground = "transparent" | "paperclip-dark";
/** sRGB PNG equivalent of index.css .dark --background: oklch(0.205 0 0). */
export const PAPERCLIP_DARK_AVATAR_BACKGROUND = "#171717";
export const AGENT_CHARACTER_VERSIONS = ["cap-v1", LPC_CHARACTER_VERSION] as const;
export type AgentCharacterVersion = typeof AGENT_CHARACTER_VERSIONS[number];

/** ClipLab cap-v1: one character recoloured by a permanent palette. */
export const capAppearanceSchema = z.object({
  schemaVersion: z.literal(1),
  characterVersion: z.literal("cap-v1"),
  paletteId: z.enum(AGENT_PALETTE_IDS),
  /** Company-scoped normalized image, set through the avatar upload service. */
  customAvatarAssetId: z.uuid().optional(),
}).strict();
/** lpc-v1: a pixel-art character composed from Liberated Pixel Cup layers. The palette remains the accent colour. */
export const lpcAppearanceSchema = z.object({
  schemaVersion: z.literal(1),
  characterVersion: z.literal(LPC_CHARACTER_VERSION),
  paletteId: z.enum(AGENT_PALETTE_IDS),
  lpc: lpcCharacterSchema,
  /** Backdrop behind the live character in hero surfaces; portraits stay transparent. */
  scene: z.enum(LPC_SCENES).optional(),
  customAvatarAssetId: z.uuid().optional(),
}).strict();
export const agentAppearanceSchema = z.discriminatedUnion("characterVersion", [capAppearanceSchema, lpcAppearanceSchema]);
export type CapAgentAppearance = z.infer<typeof capAppearanceSchema>;
export type LpcAgentAppearance = z.infer<typeof lpcAppearanceSchema>;
export type AgentAppearance = z.infer<typeof agentAppearanceSchema>;

export function appearanceForPalette(paletteId: AgentPaletteId): CapAgentAppearance {
  return { schemaVersion: 1, characterVersion: "cap-v1", paletteId };
}
export function appearanceForLpc(lpc: LpcCharacter, paletteId: AgentPaletteId = AGENT_PALETTE_IDS[0], scene?: LpcScene): LpcAgentAppearance {
  return { schemaVersion: 1, characterVersion: LPC_CHARACTER_VERSION, paletteId, lpc, ...(scene && scene !== "none" ? { scene } : {}) };
}
function randomPaletteId(): AgentPaletteId {
  const bytes = new Uint32Array(1);
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x100000000 / AGENT_PALETTE_IDS.length) * AGENT_PALETTE_IDS.length;
  do { globalThis.crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return AGENT_PALETTE_IDS[bytes[0] % AGENT_PALETTE_IDS.length];
}
/** A persisted choice, never randomize while rendering. New agents are pixel-art (lpc-v1) characters. */
export function randomAgentAppearance(): LpcAgentAppearance {
  return appearanceForLpc(randomLpcCharacter(), randomPaletteId());
}
/** Must match the migration: rolling base-31 hash, modulo 17 at every step. */
export function legacyAgentAppearance(id: string): CapAgentAppearance {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % AGENT_PALETTE_IDS.length;
  return appearanceForPalette(AGENT_PALETTE_IDS[hash]);
}
export function resolveAgentAppearance(appearance: unknown, id = "agent"): AgentAppearance {
  const parsed = agentAppearanceSchema.safeParse(appearance);
  return parsed.success ? parsed.data : legacyAgentAppearance(id);
}
export function isLpcAppearance(appearance: AgentAppearance): appearance is LpcAgentAppearance {
  return appearance.characterVersion === LPC_CHARACTER_VERSION;
}
/** Public preset path segment: palette for cap-v1, encoded layer spec for lpc-v1. */
export function agentAvatarPresetKey(appearance: AgentAppearance, muted = false): string {
  if (isLpcAppearance(appearance)) return encodeLpcSpec(appearance.lpc);
  return muted ? "muted-dream" : appearance.paletteId;
}
export function agentAvatarUrl(appearance: AgentAppearance, size: AgentAvatarSize = 512, scale: 1 | 2 = 1, pose: CharacterState = "rest", muted = false, background: AgentAvatarBackground = "transparent"): string {
  if (appearance.customAvatarAssetId) return `/api/assets/${appearance.customAvatarAssetId}/content`;
  const lpc = isLpcAppearance(appearance);
  return `/api/agent-avatars/${appearance.characterVersion}/${agentAvatarPresetKey(appearance, muted)}/${pose}.png?size=${size}&scale=${scale}${lpc && muted ? "&muted=1" : ""}${background === "paperclip-dark" ? "&background=paperclip-dark" : ""}`;
}
/** lpc-v1 only: the native-resolution animation sheet consumed by the live sprite. */
export function agentSpriteSheetUrl(appearance: LpcAgentAppearance, muted = false): string {
  return `/api/agent-avatars/${appearance.characterVersion}/${agentAvatarPresetKey(appearance)}/sheet.png${muted ? "?muted=1" : ""}`;
}
export function characterStateForAgent(status: string): CharacterState {
  if (status === "running") return "working";
  if (status === "error") return "confused";
  if (status === "paused" || status === "terminated" || status === "pending_approval") return "rest";
  return "idle";
}

/** Hydrate compact agent projections without an additional per-agent request. */
export function withAgentAppearance<T extends { id: string; appearance?: AgentAppearance | null }>(agent: T) {
  const appearance = resolveAgentAppearance(agent.appearance, agent.id);
  return { ...agent, appearance, avatarUrl: agentAvatarUrl(appearance) };
}
