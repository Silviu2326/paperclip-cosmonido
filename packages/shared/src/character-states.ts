export const CHARACTER_STATES = ["rest", "idle", "listening", "thinking", "working", "success", "confused", "sleepy", "loading"] as const;
export type CharacterState = typeof CHARACTER_STATES[number];
